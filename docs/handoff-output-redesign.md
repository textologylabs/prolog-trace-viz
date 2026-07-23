# Handoff — Rethinking ptv's Output Shape

> **Status:** Discussion document. Drop into a fresh session with the ptv repo loaded to triage. The author is the product owner and target user (currently a Prolog learner working through Bratko).
>
> **Companion repo:** [`prolog-bratko`](https://github.com/jarecsni/prolog-bratko) — the project that surfaced this feedback. Specifically `exercises/4_family.pl` and the `appendo/3` query that exposed both bugs and visualisation shortcomings.

---

## Why this handoff exists

ptv works. The current output (single markdown blob with nested boxes, unifications listed per step, and `=>` propagation arrows) is genuinely better than SWI's built-in `trace.` for understanding what Prolog is doing — confirmed by a real learner session this morning.

**But:** the current "one big monolithic markdown blob" shape doesn't scale. A 3-level recursion fits. A 7-level mutual recursion with backtracking and cut would be unreadable. And different learners need different *things* from the trace at different times.

The big idea this handoff proposes: **stop thinking of ptv as "emit a trace document." Start thinking of it as "emit a structured trace model that can be rendered at multiple layers of detail, in multiple formats, for multiple audiences."**

> **Tracking:** Every ticket that comes out of this handoff goes to **ClickUp** in the ptv space — not GitHub Issues, not scratch markdown, not chat history. The ClickUp board is the single source of truth for prioritisation and status.

---

## The big idea: layered output

Today's output mixes too many concerns into one rendering:

- The clause source (header table)
- The recursion depth (nested boxes)
- The unifications per step (bullet list)
- The substitution-resolved goals (`appendo(T, L, R) → appendo([2], [3,4], R)`)
- The return values (`=> R = [3,4]`)
- The final answer

Each of these is *useful*, but jamming them all into one blob means:

- A learner gets overwhelmed on a 3-level recursion.
- An expert can't get a quick "did clause X fire" answer without scrolling.
- A downstream tool (e.g. `prolog-test-explorer`) can't *programmatically* consume the trace.
- Backtracking, when added, will make the blob unreadable.

**Proposal: separate the model from the renderer.**

```
ptv pipeline (revised):

  source.pl + query
        │
        ▼
   ┌──────────────────┐
   │  trace engine    │
   │  (current core)  │
   └──────────────────┘
        │
        ▼
   ┌──────────────────┐
   │  trace model     │  ← canonical, structured (JSON/Prolog terms)
   │  (NEW)           │
   └──────────────────┘
        │
   ┌────┴────┬────────┬────────┬────────┐
   ▼         ▼        ▼        ▼        ▼
  Linear   Skeleton  Forest   JSON    Tutorial
  text     view      view     export  view
 (concise) (focus)   (back-   (for     (annotated,
                     tracking) tools)  Bratko-style)
```

The engine emits a **structured trace model** (a tree of steps, each with: clause-fired, unifications, sub-goals, choice points, return values, partial answers at each level). All renderers consume this model.

This unlocks five different output shapes from the same engine, plus the ability to write *new* renderers (HTML viewer, IDE plugin, test-explorer integration) without touching the engine.

---

## Proposed output shapes

Each shape is its own renderer reading the trace model. Default depends on `--mode` flag, or auto-detect from query complexity.

### 1. Linear (concise) — `--mode=linear`

For quick "did this work" sanity-check. One line per step. No nesting.

```
[1] appendo([1,2], [3,4], X)        → clause @77, H=1, T=[2]
[2]   appendo([2], [3,4], R)         → clause @77, H=2, T=[]
[3]     appendo([], [3,4], R2)       → fact @76, R2=[3,4]
[3]     ← R2 = [3,4]
[2]   ← R = [2,3,4]
[1] ← X = [1,2,3,4]
```

Best for: experienced users, CI logs, quick mental check.

### 2. Skeleton view — `--mode=skeleton`

**This is the killer mode for learners.** Focus on the *partial answer being constructed*. Show how the skeleton grows.

```
appendo([1,2], [3,4], X).

Step 1: enter appendo([1,2], [3,4], X)
        skeleton so far: X = [1 | ?₁]

Step 2: enter appendo([2], [3,4], ?₁)
        skeleton so far: X = [1 | [2 | ?₂]]

Step 3: hit base case appendo([], [3,4], ?₂)
        ?₂ = [3,4]
        skeleton: X = [1 | [2 | [3,4]]]

Step 4: unwind through level 2
        ?₁ = [2 | [3,4]] = [2,3,4]
        skeleton: X = [1 | [2,3,4]]

Step 5: unwind through level 1
        X = [1 | [2,3,4]] = [1,2,3,4]

Answer: X = [1,2,3,4]
```

**Why this matters:** the conceptual block for most learners is "where does the answer get built?" The current view shows bindings level-by-level but doesn't make the *answer skeleton* a first-class object. Showing it grow turns abstract recursion into a visible construction process.

Best for: learners. Should be the default for first-time users, or behind a `--learn` flag.

### 3. Forest view (with backtracking) — `--mode=forest`

For nondeterministic queries — shows the choice-point tree.

```
appendo(A, B, [1,2]).

├─ try clause @76: appendo([], L, L)
│   ✓ A=[], B=[1,2]                    ← SOLUTION 1
│
├─ try clause @77: appendo([H|T], L, [H|R])
│   H=1, A=[1|T'], B=L, R=[2]
│   └─ recurse: appendo(T', L, [2])
│       ├─ try clause @76
│       │   ✓ T'=[], L=[2]
│       │   ✓ A=[1], B=[2]              ← SOLUTION 2
│       │
│       └─ try clause @77
│           H'=2, T'=[2|T''], L=[], R'=[]
│           └─ recurse: appendo(T'', [], [])
│               ├─ try clause @76
│               │   ✓ T''=[], L=[]
│               │   ✓ A=[1,2], B=[]    ← SOLUTION 3
│               │
│               └─ try clause @77 → fails (head [H|T] vs [])
```

Best for: understanding backtracking, demonstrating "Prolog is bidirectional."

### 4. JSON export — `--mode=json`

The model itself, machine-readable. Schema TBD but roughly:

```json
{
  "query": "appendo([1,2], [3,4], X).",
  "source": "appendo_test.pl",
  "clauses": [
    {"line": 76, "term": "appendo([], L, L)."},
    {"line": 77, "term": "appendo([H|T], L, [H|R]) :- appendo(T, L, R)."}
  ],
  "trace": {
    "step": 1,
    "goal": "appendo([1,2], [3,4], X)",
    "clause_used": 77,
    "unifications": {"H": "1", "T": "[2]", "L": "[3,4]"},
    "partial_answer": "X = [1 | ?₁]",
    "children": [
      {
        "step": 2,
        "goal": "appendo([2], [3,4], ?₁)",
        "clause_used": 77,
        "unifications": {"H": "2", "T": "[]", "L": "[3,4]"},
        "partial_answer": "X = [1 | [2 | ?₂]]",
        "children": [...]
      }
    ],
    "return": "X = [1,2,3,4]"
  },
  "solutions": [{"X": "[1,2,3,4]"}],
  "more_solutions_available": false
}
```

**Cross-product win:** this is exactly what [`prolog-test-explorer`](../../prolog-test-explorer/VISION.md) needs for its "click a failing test → see the trace" integration (moat feature B in its VISION). The JSON output of ptv becomes the API surface between the two products.

Best for: tooling, IDE integration, programmatic analysis, CI snapshots.

### 5. Tutorial view — `--mode=tutorial`

Long-form, annotated, prose-heavy. The current "essay" experience but generated.

```
# Tracing `appendo([1,2], [3,4], X)`

We want to find what value of X makes `appendo([1,2], [3,4], X)` true.

## Step 1: Try the recursive clause

Prolog tries clause @77: `appendo([H|T], L, [H|R]) :- appendo(T, L, R).`

This unifies with our query when:
- H = 1 (head of first list)
- T = [2] (tail of first list)
- L = [3,4] (unchanged — L always rides along)
- X = [1|R] (we know X starts with 1, R still to be determined)

> **Notice:** L is bound here but never actually used by this clause's logic.
> It will ride along through every recursive call until the base case finally
> consumes it.

The clause's body says: recurse with `appendo(T, L, R)` — that is,
`appendo([2], [3,4], R)`. Whatever R turns out to be, X will be `[1|R]`.

## Step 2: ...
```

Best for: docs, blog posts, generated study notes, embedding in textbooks. Companion to Bratko-style learning. **Could be a killer differentiator if ptv is positioned as a teaching tool.**

### 6. Interactive HTML — `--mode=html` (stretch)

The model rendered as an HTML page with collapsible nodes, hover-to-see-unifications, side-by-side clause source. Could open in browser, or host as VSCode webview.

Best for: deep dives, sharing trace links, integration with test-explorer's VSCode panel.

---

## Specific learner-facing improvements

These are the six points raised in the Bratko session. Each maps to a specific mode above, or applies across modes.

| # | Improvement | Best mode(s) | Priority |
|---|---|---|---|
| 1 | **Distinguish "carried" vs "newly bound" variables.** Today, L=[3,4] appears at every level with no signal that it's the same L threaded through. Colour, annotation, or grouping. | Skeleton, Tutorial | P2 |
| 2 | **Visually distinguish descent from unwind.** Current `=>` arrows are subtle. Use different gutter chars (`┌─→` descent, `←─┘` unwind), colour, or section separators. | All modes | P2 |
| 3 | **Show partial answer being built.** **THIS IS THE BIG ONE.** Make the skeleton a first-class visible object that grows step by step. (See Skeleton mode above.) | Skeleton (centrepiece), Tutorial | P1 |
| 4 | **Header table — show which clause fired at each step.** Augment the existing clause table with step numbers / checkmarks. | All text modes | P3 |
| 5 | **Backtracking visualisation.** Current output is single-solution only. Backtracking is the heart of Prolog and missing it is a real gap. | Forest mode (new) | P1 |
| 6 | **"More solutions available" affordance.** Current footer "Showing first solution only" is buried. Make it a teaching moment: "Press `;` or run with `--all` to see all 3 solutions." | All modes | P3 |

---

## Cross-product opportunity

ptv's JSON output mode is the API surface for `prolog-test-explorer`'s "trace-viz integration" feature (moat feature B in its [VISION](../../prolog-test-explorer/VISION.md#b-trace-viz-integration--the-moats-moat)). Concrete vision:

1. A plunit test fails in test-explorer.
2. User clicks "Show trace."
3. test-explorer invokes ptv with `--mode=json` against the failing goal.
4. test-explorer renders the JSON as an inline webview using its own React-based viewer, with deep links into the source file.

This is the **selfware ecosystem play**: each tool makes the others more valuable. Designing ptv with this integration in mind from day one (rather than retrofitting it later) is cheap if done now, expensive if deferred.

Concrete dependency for test-explorer: ptv must be able to emit JSON from a CLI invocation without requiring user interaction. That's already mostly true; just needs `--mode=json` as a flag.

---

## Suggested next-session agenda

When you open the next session in the ptv repo:

1. **Architecture decision** (30 min). Is the "trace model + renderers" split desirable? Read the current `tracer.pl` and main rendering code to see how invasive the refactor would be. The split is the foundation for everything below; if rejected, the improvement work falls back to incremental polishing of the current monolithic renderer.

2. **Prioritise modes** (15 min). Linear, Skeleton, Forest, JSON, Tutorial, HTML — which 2 ship first? My nomination: **Skeleton (P1)** for learner value, **JSON (P1)** for test-explorer dependency. Forest can follow as P2.

3. **Ticket creation in ClickUp** (rest of session). Each surviving item from this doc becomes a ClickUp ticket in the ptv space:
   - Title
   - Description (paste relevant chunk of this doc)
   - Priority
   - Estimate (rough T-shirt)
   - Dependencies (e.g. modes depend on the model refactor)

   **ClickUp, not GitHub Issues.** The ClickUp board is the canonical priority view. This markdown file is a one-off design document, not a tracking system — once tickets exist, this doc is reference material.

---

## What this document is not

- Not a spec. The modes above are sketches, not signed-off designs.
- Not a refactor plan. The trace-model-vs-renderer split is *proposed*, not decided.
- Not exhaustive. Backtracking visualisation, cut handling, negation-as-failure, exception flows — all open questions for later.

The point is to give the next session a coherent starting frame so it doesn't have to rediscover the problem.

---

## Source material

- Original Prolog learner session: [conversation context from `prolog-bratko` morning session, 2026-05-25]
- Companion product vision: [`prolog-test-explorer` VISION.md](../../prolog-test-explorer/VISION.md)
- Sample of current monolithic output mode: `prolog-bratko/exercises/4_family-output.md`
- Sample query for testing all modes: `appendo([1,2], [3,4], X).` against `appendo/3` as defined in `prolog-bratko/exercises/4_family.pl` (lines 76–77).
