# TraceModel — design contract for ptv v3

> **Status:** Spec draft. This document is the contract that downstream work pins to. Engine refactor, JSON mode, VSCode extension, and prolog-test-explorer integration all consume this interface.
>
> **Companion:** [`handoff-output-redesign.md`](./handoff-output-redesign.md) — the problem framing.

---

## Why this document exists

The handoff doc proposed splitting ptv into `engine → TraceModel → renderer(s)`. The TraceModel is the seam, and the entire downstream plan hinges on it being:

1. **Rich enough** to express any Prolog trace we care about (recursion, backtracking, cut, negation, exceptions, builtins, higher-order).
2. **Stable enough** that the VSCode extension and prolog-test-explorer can pin a schema version.
3. **Renderer-agnostic** — no rendering decisions baked in.

Without nailing this down first, two tracks (engine refactor + extension) cannot run in parallel. With it, both consume the same TypeScript interface, both stay in sync, and design issues surface immediately rather than weeks into rework.

---

## Phase 0 — the contract

### Deliverables

1. **`packages/core/src/model.ts`** — TraceModel TypeScript interface (the contract).
2. **`packages/core/fixtures/`** — hand-crafted fixture pairs:
   - `<name>.pl` — Prolog source + query
   - `<name>.trace.json` — expected TraceModel output
3. **`packages/core/src/model.test.ts`** — round-trip validation: every fixture parses, type-checks, and round-trips through `JSON.stringify(parse(x)) === x`.

### Why fixtures first, not engine first

Writing realistic fixtures *by hand* exposes design flaws in the TraceModel before any engine code commits to them. If you can't express a backtracking trace cleanly in the model, you discover that while typing the fixture, not three weeks into the refactor. Hand-crafted fixtures are also what unblocks the VSCode extension to start in parallel: the extension renders fixtures from day one and swaps to live data when the engine catches up.

---

## The model (sketch)

```ts
// packages/core/src/model.ts

export const SCHEMA_VERSION = '3.0.0';

export interface TraceModel {
  schemaVersion: string;
  query: string;                       // original user query, verbatim
  source: SourceInfo;
  trace: TraceNode;                    // root node — the top-level goal
  solutions: Solution[];
  moreSolutionsAvailable: boolean;
  status: 'success' | 'failure' | 'exception';
  diagnostic?: Diagnostic;             // present iff status !== 'success'
}

export interface SourceInfo {
  path: string;                        // absolute path to the .pl file
  clauses: ClauseDef[];                // every clause discovered in the file
}

export interface ClauseDef {
  id: string;                          // synthetic, stable: "appendo/3#1"
  predicate: string;                   // "appendo"
  arity: number;
  sourceLine: number;                  // 1-based, original source file
  term: string;                        // pretty-printed clause
  kind: 'fact' | 'rule';
}

export interface TraceNode {
  step: number;                        // 1-based, monotonic across the trace
  depth: number;                       // 0 for root
  port: Port;                          // call | exit | fail | redo | exception
  goal: string;                        // resolved goal at this step
  goalTemplate?: string;               // pre-substitution form (for partial-answer display)
  clauseId?: string;                   // which clause fired; absent for builtins
  unifications: Unification[];
  carriedVars: string[];               // variable names threaded in from parent
  partialAnswer?: string;              // skeleton at this step — drives Skeleton mode
  resolvedBinding?: string;            // the return value if applicable
  children: TraceNode[];               // sub-goals descended into
  alternatives?: TraceNode[];          // for Forest mode: branches tried & abandoned
  durationMs?: number;                 // optional perf data
}

export type Port = 'call' | 'exit' | 'fail' | 'redo' | 'exception';

export interface Unification {
  variable: string;                    // clause variable name, e.g. "H"
  value: string;                       // pretty-printed bound value
  origin: 'new' | 'carried';
  fromStep?: number;                   // when origin === 'carried'
}

export interface Solution {
  index: number;                       // 1-based
  bindings: Record<string, string>;    // query variable → value
}

export interface Diagnostic {
  message: string;
  sourceLine?: number;                 // source location if known
  prologError?: string;                // raw SWI error term, for tooling
}
```

### Renderer contract

Every renderer is a pure function:

```ts
type Renderer<TOutput> = (model: TraceModel) => TOutput;
```

- **Markdown renderer** (CLI default) → `string` of markdown
- **Linear renderer** → `string` of one-line-per-step text
- **Skeleton renderer** → `string` of partial-answer construction
- **Forest renderer** → `string` of choice-point tree
- **JSON renderer** → `string` of `JSON.stringify(model)`
- **HTML renderer** → React tree (for extension webview)

Renderers MUST NOT mutate the model. Renderers MAY ignore fields they don't need (e.g. Linear mode ignores `partialAnswer`).

### Schema versioning

`schemaVersion` follows semver:

- **patch**: backwards-compatible field additions, new optional fields
- **minor**: backwards-compatible enum extensions (e.g. new `Port` values)
- **major**: breaking — field rename, field removal, type change

Tools that consume the model SHOULD pin a major version and warn on minor mismatch. The JSON renderer emits `schemaVersion` at the top of every output.

---

## Fixture matrix

These are not "litmus tests" cherry-picked from a Bratko chapter. They are a **coverage matrix** — one fixture per category of Prolog feature, chosen so that if all fixtures parse cleanly and round-trip, the model is provably capable of representing real traces.

| # | Fixture | Category | What it proves |
|---|---|---|---|
| 01 | `factorial.pl` — `factorial(5, X)` | Deterministic linear recursion | `children`, depth, `resolvedBinding` propagation through unwind |
| 02 | `appendo_forward.pl` — `appendo([1,2], [3,4], X)` | List recursion (mode +,+,−) | `partialAnswer` field — drives Skeleton mode |
| 03 | `appendo_split.pl` — `appendo(A, B, [1,2,3])` | Nondeterministic, multiple solutions | `solutions[]`, `moreSolutionsAvailable`, `alternatives[]` for Forest |
| 04 | `no_solution.pl` — `member(99, [1,2,3])` | Failure path | `status: 'failure'`, `port: 'fail'` propagation |
| 05 | `cut_max.pl` — `max(3, 5, X)` with `!` | Cut / pruning | Cut barrier — alternatives must be marked pruned |
| 06 | `type_error.pl` — `X is foo + 1` | Exception | `status: 'exception'`, `Diagnostic.prologError` |
| 07 | `arithmetic.pl` — `Y is (3 + 4) * 2` | Builtin (`is/2`) | Builtins have no `clauseId`; goal display preserves operators |
| 08 | `negation.pl` — `\+ member(99, [1,2,3])` | Negation as failure | `\+` wraps a sub-trace whose failure becomes the parent's success |
| 09 | `findall_demo.pl` — `findall(X, member(X, [a,b,c]), L)` | Higher-order builtin | Meta-call sub-trace with its own solution set; `findall` succeeds even when inner branches fail |
| 10 | `even_odd.pl` — `even(4)` (mutual recursion) | Mutual recursion | Trace alternates between two predicates; carried-vars tracking across the alternation |

Each fixture is **two files**:

```
fixtures/
├─ 01_factorial.pl
├─ 01_factorial.trace.json
├─ 02_appendo_forward.pl
├─ 02_appendo_forward.trace.json
└─ ...
```

The `.pl` files include the query as a comment at the top so the engine can run them later for self-validation:

```prolog
% query: factorial(5, X).
factorial(0, 1).
factorial(N, F) :-
    N > 0,
    N1 is N - 1,
    factorial(N1, F1),
    F is N * F1.
```

### Out of scope for Phase 0

These are deferred — the model should accommodate them later, but Phase 0 doesn't need to include fixtures:

- DCG (`-->`)
- Assert/retract (dynamic database mutation)
- `setof/3`, `bagof/3` (covered well enough by `findall/3`)
- Constraint logic (CLP)
- Tabling (`:- table p/2`)
- Modules / qualified goal calls

If the model proves wrong for these later, we bump the major version. They're tracked here as known-deferred so the model design doesn't accidentally close them off (e.g. don't make `clauseId` required-string when a tabled answer has no firing clause).

---

## How the two tracks run in parallel

Once `model.ts` + the 10 fixtures are committed (target: end of Phase 0, ~2–3 days):

**Track A — Engine refactor** consumes the fixtures as golden files:
1. Refactor `timeline.ts` + `tree.ts` to produce TraceModel instead of formatter-coupled internal types.
2. For each fixture, run the engine against `<name>.pl` and assert the output matches `<name>.trace.json` (allowing acceptable diffs documented per-fixture).
3. Add `--mode=json` that serialises TraceModel.
4. Keep the existing markdown output working by adding a new `markdown` renderer that consumes TraceModel.

**Track B — VSCode extension** consumes the fixtures as test data:
1. Set up `packages/vscode/` with `code-server` dev harness.
2. Webview shell loads a fixture and renders the call tree (expand/collapse).
3. Source-link navigation: clicking a node opens `<source.path>:<sourceLine>` in the editor.
4. Basic Skeleton mode using `partialAnswer` field.
5. When Track A lands `--mode=json`, swap fixture loading for spawning ptv CLI.

Both tracks consume `@prolog-trace-viz/core` from the monorepo. No mock or stub on either side — the TraceModel + fixtures are the truth.

---

## Open questions for the next session

These are deliberately not answered here. They become decisions during Phase 0 implementation:

1. **`alternatives[]` placement**: are abandoned branches children of the parent (sibling to the chosen child), or attached to the chosen child as alternatives-also-tried? The latter is more compact; the former is closer to the SWI trace event stream.
2. **`carriedVars` granularity**: per-step list of variable names, or a `Map<variable, originStep>`? The latter is richer but heavier in JSON.
3. **`durationMs` units**: should the JSON carry timing at all by default, or only when run with `--profile`? Probably the latter to keep diffs deterministic.
4. **Source path encoding**: absolute vs. project-relative? Absolute is robust; relative is portable across machines. Recommend: emit both — `path` (absolute) and `relativePath` (best-effort from cwd).
5. **Anonymous vars (`_`)**: do they appear as `Unification` entries, or filtered out? Probably filter from `unifications[]` but preserve in `goal` text.

---

## Pointers

- ClickUp: [Engine refactor: extract canonical TraceModel](https://app.clickup.com/t/869dea6ky) (this work)
- ClickUp: [VSCode extension](https://app.clickup.com/t/869dea7v0) (Track B)
- ClickUp: [Mode: JSON](https://app.clickup.com/t/869dea6vw)
- Handoff: [`handoff-output-redesign.md`](./handoff-output-redesign.md)
