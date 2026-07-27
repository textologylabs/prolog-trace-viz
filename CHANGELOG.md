# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.10.4] - 2026-07-27

### Fixed
- **Step numbering skipped a number on backtracking.** An ancestor re-entry (a clause re-`EXIT`ing the same instance on backtracking) was consuming a step number even though the call tree never draws it — so `grandparent(tom, GC) -n 2` numbered the re-solved goal ⑤ with no ④ anywhere, a jump that read as a bug. An ancestor re-entry is not a genuine execution step, so it now reuses the number (and scope) of the instance it re-satisfies and consumes none of its own. Genuine steps stay consecutive (`①②③④`), and the re-entry shows no `Step N:` header in the timeline — the *"Succeeds again (Step N re-satisfied)"* line already names what re-solved. Real recursion is unaffected: its genuinely distinct instances keep consecutive numbers and their `@N` scope tags.

## [2.10.3] - 2026-07-27

### Fixed
- **A demand-driven redo drew no backtrack line.** When enumerating solutions (`-n`/`--all`), asking a choice point for its next answer *is* backtracking — but the call tree only drew the dotted `backtrack to Ⓝ` loop for *failure*-driven backtracking, so a query like `grandparent(tom, GC) -n 2`, whose second solution comes from re-satisfying `parent(bob, C)`, showed a bare `next solution` edge and no backtrack at all. The tree now draws the same loop for demand-driven redos, sourced from the point Prolog actually unwinds *from* — the previous solution's leaf — back up to the choice point, then the `next solution` edge on to the re-solution. Failure-driven backtracking is unchanged.
- **A re-solved goal was mislabelled as a fresh, unrelated goal.** On backtracking, an ancestor clause re-`EXIT`s the *same* instance it already entered — but the builder was backfilling it as a brand-new clause application, minting a phantom second instance. In `grandparent(tom, GC) -n 2` the second solution's `parent(P, C)` therefore rendered as `parent(P@4, C@4)` — first argument shown *unbound* and tagged with a spurious `@4` scope — when it is the same goal as the first pass with `P` still bound to `bob`. Now an ancestor re-entry aliases back to the original instance's scope (`scopeId`), and a retry inherits its origin's subgoal identity and the earlier-sibling bindings that persist across the backtrack. The goal reads `parent(bob, C)` in both passes, and step markers stay consistent (`[Goal 1.2]`, not `[4.2]`). A single-instance query no longer shows `@N` tags at all (there is nothing to disambiguate); recursion, which has genuinely distinct instances, still tags them (`@1`, `@4`, `@7`). The `--coref:1` callout is no longer reprinted on the consequential re-exit.

## [2.10.2] - 2026-07-27

### Fixed
- **Backtracking was attributed to goals that never backtracked.** When enumerating solutions, a goal with a single clause (e.g. `grandparent/2`) re-`EXIT`s a second time purely because a goal *beneath* it re-solved — it never receives a `REDO` of its own. The builder was treating every such re-exit as a choice point, so the call tree drew a spurious `next solution` loop and a misplaced `backtrack to Ⓝ` arrow on it, and the timeline labelled it `REDO … Retry`. Now only the goal that actually received the `REDO` (the real choice point) is rendered as backtracking; ancestor re-exits are shown as *"succeeds again"* consequences. The call tree omits the synthesized ancestor node entirely and hangs each `✓` solution off the goal that established it, so a multi-solution diagram shows one choice point with its answers instead of a tangle. Failure-driven backtracking (e.g. `likes(mary,X), likes(john,X)`) is unchanged — its `✗ fail` still drives a real dotted `backtrack` arrow.
- **The dotted `backtrack to Ⓝ` arrow no longer manufactures a dead end.** It is drawn only when a genuine failure triggered the unwind; enumeration-driven re-solutions rely on the `next solution` edge alone.

## [2.10.1] - 2026-07-27

### Changed
- **Coreference colour-linking is now confined to a single solution.** Previously the shared query variable bridged a clause's variables across *every* solution into one colour class — so in a multi-solution trace the same clause variable from two different proofs (holding different values) shared a colour, which read as spurious linkage. Colouring is now computed per solution (the palette resets each pass, small-multiple style; the `──── Solution N ────` dividers keep passes separate). Bonus: structural roles now colour consistently across passes (the recursion/​instance variable takes the same hue in every proof). The `--coref:3` binding panel likewise splits per solution. Single-solution traces are unaffected.

## [2.10.0] - 2026-07-27

### Added
- **Coreference visualization.** Makes explicit *which variables are the same variable* — the hardest thing for Prolog beginners. Standardize-apart labeling is **on by default**: when one surface name denotes more than one logical variable — the query's `X` versus a clause's `X` (a "false friend"), or `N` recurring across recursive clause instances — the clause instances are disambiguated as `X@1`, `N@2`, etc., while names that are unambiguous stay exactly as written. `--labels:<mode>` overrides this: `auto` (default), `source` (never disambiguate), `full` (tag every clause instance, demonstrating that Prolog renames clause variables apart on each call). Labels apply to the timeline and the `--tree` call graph.
- **`--coref:<n>` — layered coreference detail** (off by default):
  - `--coref:1` adds a **Coreferences** callout per clause: the query↔head channel (`X ≡ Y`) and the variables shared across a clause's goals (`M — shared by [1.2], [1.3]`).
  - `--coref:2` **colours** each coreference class, so a variable and everything it unifies with (the query's `X` and the clause's `Y`) glow the same hue across the whole trace. Skill-validated, colourblind-safe palette; theme-aware; degrades to plain labelled text where inline styles are stripped (e.g. GitHub).
  - `--coref:3` adds a **Variable Bindings** panel: the substitution trail, one row per coreference class with the value it resolved to.

### Fixed
- **A failed query was reported as succeeding.** The Final Answer printed `Query succeeded with no bindings` whenever there were no variable bindings — but that also fired when the query *failed*, so an unprovable query was announced as a success. Success and failure are now distinguished from whether any solution was recorded.

### Changed
- **Clearer outcome messaging.** A ground query that succeeds now reads **`Yes` — the query is true** (with a note explaining there are no variables to bind), and an unprovable query reads **`No` — the query is not provable**, replacing the cryptic `succeeded with no bindings`.
- **Discoverability hint on the single-solution footer.** The default single-solution note now points the reader at how to enumerate the rest — `re-run with -n <count> or --all to see more` — and is suppressed entirely on failure, where "showing first solution only" made no sense.

## [2.9.1] - 2026-07-26

### Fixed
- **Execution Timeline rendered as prose in Markdown viewers.** The box-drawing timeline was emitted as raw text with no code block, so viewers set it in a proportional font with prose line-height — misaligning the columns and breaking the `│ ┌ └` rails into gappy, dotted lines. It is now emitted as a self-contained `<pre style="line-height: 1.15">` block: monospaced with a tightened line-height baked in, so the rails render as solid, continuous lines with **no reader-side CSS or editor plugin required**. HTML metacharacters in goals (`<`, `>`, `&`, e.g. `N > 0`) are escaped. GitHub sanitizes the inline style and falls back to a plain monospace block. Example outputs regenerated.

## [2.9.0] - 2026-07-25

### Added
- **Multiple-solution tracing.** `-n, --solutions <n>` traces up to *n* solutions (default 1); `--all` traces every solution, capped at 10. Enumeration is one continuous trace — Prolog backtracks from one solution into the next (via `findnsols/4`), so the inter-solution backtracking is captured, not faked by re-running. The output gains a **Solutions** summary table, `──── Solution N ────` dividers in the timeline, and a **forest** call tree: one `✓` leaf per solution, joined by `next solution` edges. `--split` additionally writes a self-contained file per solution (`<source>-soln1.md`, `-soln2.md`, …). The default (one solution, single file) is unchanged.

## [2.8.1] - 2026-07-25

### Fixed
- **Backtrack edge could point from the wrong node in nested backtracking.** In a cascade — one failure re-entering an ancestor goal *and* an inner goal — the renderer guessed the dead end as "the step just before the retry", which for the inner re-entry was the *other retry*, not the failure. The builder now records the actual failure that triggered each retry, so every `backtrack to Ⓝ` edge springs from the real dead end (e.g. both re-entries in `member(X, [1,2,3]), X > 2` now originate at the one `✗ fail`).

## [2.8.0] - 2026-07-25

### Changed
- **`--tree` now reads as an execution flow with backtracking loops.** The call tree previously fanned every goal off the query root and drew an unlabelled edge from a retry to the goal it re-entered. It now chains goals in the order they run, shows each goal with the bindings it was actually called with (`likes(john, food)`, not `likes(john, X)`), and draws backtracking as a labelled loop: a dotted `backtrack to Ⓝ` edge from the dead end back to the choice point, then a thick `retry` edge on to the re-solution. Failures render as `Ⓝ ✗ fail`, and the diagram ends on a `✓` node carrying the answer. Node numbers still match the timeline's step numbers.

## [2.7.0] - 2026-07-25

### Fixed
- **Backtracking into a goal that already succeeded was invisible**: The goals of a conjunction all run at one trace level, and step state was keyed by level alone. When `likes(mary, X)` exited, its entry was deleted — so the `REDO` that came back to it found nothing and was dropped, and so was the `EXIT` carrying its second solution. `?- likes(mary, X), likes(john, X).` rendered as three unrelated steps with the retry missing entirely. Exited goals are now kept as re-enterable choice points, and a `REDO` into one emits a visible step that the following `EXIT` records the new solution against.
- **Re-solving a goal through a deeper choice point lost the outer solution**: When backtracking re-entered a *nested* choice point, the enclosing goals succeeded a second time but their `EXIT`s had nowhere to land. Re-entering a choice point now re-enters its already-succeeded ancestors too, so the re-solution nests under the goal it belongs to.
- **Top-level goals were named after the clause they matched, not the query**: A goal's arguments were displayed using the matched clause head, so a retry of `likes(mary, X)` announced itself as `REDO likes(mary, wine)` and the root of `factorial(3, X)` read `factorial(3, R)`. Top-level goals are now matched to the query conjunct they came from and named accordingly — the same way a subgoal is named after its parent clause's body.
- **Result lines assumed the output was the last argument**: `member(X, [a,b,c])` reported `[a,b,c] = [a,b,c]` and a fact match reported `wine = wine`. Results are now derived by comparing the `CALL` goal with the `EXIT` goal — the arguments the caller left open and execution filled in — so `member` reports `X = a`, and a goal that bound nothing emits no result line at all.
- **Final answer for a conjunctive query**: `?- likes(mary, X), likes(john, X).` answered `X) = food` — a greedy regex mis-split the query, and the answer was read from the call tree's root, which only ever sees the first conjunct. The answer is now read from the query variables' bindings across all top-level goals, with the last solution winning.

- **`--tree` produced a broken diagram for conjunctions**: The Mermaid call tree was built by a separate, level-keyed tree builder that could not represent the goals of a conjunction (which share a trace level) — `?- likes(mary, X), likes(john, X).` rendered as a single orphan node labelled with the raw internal variable and the *rejected* binding. The call tree is now rendered from the same execution timeline as the rest of the output, so it inherits conjunction siblings, retries drawn as branches, failed attempts shown in place, and query-named goals. Retries get a dotted `backtrack` edge to the solution they re-enter, and node numbers match the timeline's step numbers.

### Changed
- The `Query Variable:` line is no longer printed where the `=>` line above it already states the same binding in the same names. It remains for steps whose bindings cannot be derived exactly.

## [2.6.6] - 2026-05-25

### Fixed
- **Trailing `.` in query crashed the tracer**: A query like `"appendo([1,2], [3,4], X)."` was inlined verbatim into the generated wrapper as `(appendo(…)., export_trace_json(…))`, where the period inside the parens produced a `Syntax error: Operand expected, unquoted comma or bar found` and `run_trace/0` never got defined. The wrapper generator now strips a single trailing `.` from the query before inlining it.
- **Relative `consult/1` paths broke**: `swipl` was being spawned with `cwd` set to the wrapper's temp dir, so any `:- consult('../foo').` in the user's file resolved against `/var/folders/…` instead of the source file's directory. `ptv` now runs `swipl` with `cwd` set to the source file's directory; the trace JSON output is written via an absolute path so it still lands in the temp dir regardless of cwd.

## [2.6.5] - 2026-05-20

### Changed
- **Update check runs before the command, not after**: The automatic update nudge now runs *before* ptv starts the trace, so the user can update first rather than waiting on a stale-version run.
- **Seamless re-run after update**: If the user accepts the update, ptv installs the new version and then re-execs itself with the same arguments (stdio inherited), so the original command runs transparently on the freshly installed binary. A guard env var prevents the re-run from triggering another check.
- **Throttle temporarily disabled**: The once-per-day cache is commented out in this release so every run exercises the npm registry check. It will be re-enabled in a follow-up.

## [2.6.4] - 2026-05-19

### Added
- **Automatic update check**: After a normal run, ptv checks the npm registry for a newer release (throttled to at most once per day, with a cached result in between) and, if one exists, nudges the user with a `Y/n` prompt to install it globally. Installation progress is shown with an animated terminal spinner. The check is silent and non-fatal on any error, is skipped when not running interactively (non-TTY), and can be disabled with `--quiet`.

## [2.6.3] - 2026-05-19

### Fixed
- **Backtracking misattribution**: `REDO` events were dropped during parsing, so a goal that failed one clause and backtracked to another kept the failed attempt's subgoal steps. Those steps were then mislabeled against the surviving clause's subgoals (e.g. a failed `10 < 6` comparison rendered under the wrong goal, and recursive calls split into phantom sibling steps). `REDO` events are now processed and the failed clause attempt is discarded from both the execution timeline and the call tree.
- **Internal variable mislabeling**: When a clause argument was instantiated to a constant, positional variable-name alignment shifted and mapped the wrong name onto trailing internal variables — e.g. `gcd(X, Y1, D)` rendered as `gcd(10, Y1, Y1)` instead of `gcd(10, Y1, D)`. Variable mapping is now structural (functor / argument / operator alignment).
- **Builtin goal results**: `is/2` steps now show the bound left-hand-side variable (e.g. `Y1 = 6`) instead of `? = 6 is 16-10`; comparison goals (`<`, `>=`, …) no longer emit a meaningless result line.
- **Call tree builtin goals**: `is/2` nodes display the resolved goal (e.g. `6 is 16-10`) instead of an unresolved internal variable (`_3154 is 16-10`).

## [2.6.2] - 2026-04-05

### Fixed
- **Internal variable leakage**: Operator expressions (`is/2`, `>/2`) in step headers and subgoal listings leaked raw Prolog internal variable names (e.g., `_778 is 2+1`) instead of using clause variable names. Now uses parent's subgoal template for consistent display.
- **Debug mode variable consistency**: In `--debug` mode, step headers now use the same internal variable names as their parent's subgoal listing, with additive `V(_NNN)` notation (e.g., `R(_2482) is 4 * 6`). Previously showed mismatched internal vars from different frames.
- **Goal display comma spacing**: Added space after comma in goal arguments (e.g., `factorial(4, R)` instead of `factorial(4,R)`)

## [2.6.1] - 2026-04-05

### Fixed
- **Wrapper line offset bug**: Source files with leading blank lines caused clause line numbers to be mapped incorrectly, resulting in wrong clause matching in the timeline (e.g., recursive clauses displayed as base case facts with wrong variable names and no unifications)

## [2.6.0] - 2026-01-14

### Added
- **`--tree` flag**: Call tree diagram (Mermaid) is now opt-in via `--tree` flag, reducing default output size
- Regression tests for subgoalTemplate variable priority fix

### Fixed
- **Timeline variable display bug**: Child steps now correctly use the caller's variable name (from subgoalTemplate) instead of the matched clause's pattern. For example, when parent's subgoal is `t(X+1, X1)` and it matches fact `t(X+0+1, X+1+0)`, the step now shows `t(1+0+1, X1)` instead of incorrectly showing `t(1+0+1, X+1+0)`

### Changed
- Call tree diagram is no longer included by default - use `--tree` to include it
- Updated `regenerate_examples.sh` to use `--tree` flag

### Removed
- **BREAKING**: Removed `--show-internal-vars` backwards compatibility flag (use `--debug:internal-vars` instead)

## [2.5.0] - 2026-01-11

### Added
- **Debug flag system**: New `--debug` and `--debug:<flag>` CLI options for extensible debugging features
- **Additive internal variable display**: With `--debug:internal-vars`, shows both clause variable names AND internal Prolog names (e.g., `Z (_2008) = value`) instead of replacing one with the other
- **CLI integration tests**: Comprehensive test suite covering flag parsing, output format, and error handling (19 new tests)
- Support for `--debug:*` and `--debug:all` to enable all debug flags
- Backwards compatibility: `--show-internal-vars` still works (maps to `--debug:internal-vars`)

### Changed
- Renamed `--show-internal-vars` to `--debug:internal-vars` (old flag still works)
- Debug mode now shows internal vars additively rather than replacing clean names
- Updated help screen with debug flag documentation
- Updated README with operators example showing recursive tracing

## [2.4.1] - 2026-01-11

### Fixed
- Complete internal variable cleanup: removed remaining internal Prolog variable names (_2008) from unifications section, subgoals display, and call tree results
- Result lines for facts with pattern outputs now show full pattern (e.g., `X+1+0 = 1+1+0`) instead of ellipsis (`X+... = 1+1+0`)
- Removed unused function parameters causing TypeScript warnings

### Added
- New test suite for tree-formatter with pattern output display tests
- Additional timeline-formatter tests for pattern output display

## [2.4.0] - 2026-01-11

### Added
- **Clean Variable Display**: Timeline and call tree now use clause variable names (X, Z, X1) instead of Prolog's internal names (_2008) by default, making traces much easier to follow
- **--show-internal-vars flag**: New CLI option to display Prolog's internal variable names for debugging purposes

### Changed
- Result lines now show `=> Z = 1+1+1+1+0` instead of `=> _2008 = 1+1+1+1+0`
- Call tree nodes show `Result: Z=value` instead of `EXIT: _2008=value`

## [2.3.0] - 2026-01-11

### Added
- **Subgoal Binding Context**: When a subgoal uses a variable bound by a previous sibling step, the timeline now shows the template → instantiated form with a "where X = value (from Step N)" annotation, making the data flow between sibling subgoals explicit

## [2.2.0] - 2026-01-01

## [2.2.0] - 2025-12-30

### Added
- **Nested Timeline Structure**: Child calls are now visually nested inside their parent steps, showing the call stack hierarchy clearly
- New `flattenTimeline()` utility function for backward compatibility and testing
- New test suite for nested timeline structure validation

### Changed
- **Timeline Visualisation Redesign**: Replaced flat sequential timeline with hierarchical nested format
- Results now appear AFTER child steps complete, matching actual Prolog execution order
- Query variable state (`A = ...`) now only displays on root-level steps, preventing premature display
- Simplified timeline builder architecture - single-pass tree construction instead of multi-pass flat array processing
- Reduced timeline.ts from ~1000 lines to ~400 lines through architectural cleanup

### Fixed
- Fixed premature query variable display where `A = result` appeared before subgoals were shown
- Fixed confusing timeline where results appeared before the computation that produced them
- Fixed Mermaid diagram step numbers not matching timeline step numbers (tree builder now uses flattened timeline for mapping)

### Technical
- `TimelineStep` interface now includes `children: TimelineStep[]` for nested structure
- Timeline builder uses active call stack to track parent-child relationships
- Clause info backfilled from EXIT events when CALL events lack it
- Depth-first renumbering ensures consistent step numbers in nested output
- Tree builder receives flattened timeline for correct step number mapping

## [2.1.2] - 2025-12-23

### Fixed
- Fixed timeline merging bug where steps appeared out of chronological order for recursive predicates with multiple calls at the same recursion level
- Synchronized call tree diagram step numbers with timeline steps - diagram now uses same step numbers (①②③) as timeline (1, 2, 3)
- Renumbered timeline steps to be continuous (1, 2, 3, ...) after merging CALL/EXIT pairs
- Added instantiated subgoal display showing variable substitutions (e.g., `t(X+1, X1) → t(1+0+1+1, X1)`)

### Added
- Comprehensive unit tests for timeline merging with recursive predicates
- Test coverage for multiple calls at same recursion level (the bug scenario)
- Timeline builder now passes merged timeline to tree builder for correct step number mapping

## [2.1.1] - 2025-12-23

### Fixed
- Regenerated build-info.ts with correct version (was showing 2.0.0 instead of 2.1.0)
- Build now correctly reports v2.1.1 in --copyright flag

## [2.1.0] - 2025-12-23

### Added
- **Timeline Redesign**: Merged CALL/EXIT pairs into single steps, reducing timeline verbosity by ~50%
- **Query Variable Tracking**: Shows how query variables evolve through recursive execution (Russian doll pattern)
- **Variable Binding Tracker**: Event-driven tracker that processes trace events in chronological order
- Variable name extraction from queries (no longer hardcodes "X")
- List simplification for nested structures: `[1|[2|[3,4]]]` → `[1,2,3,4]`

### Changed
- Timeline steps now show: goal, clause, unifications, subgoals, and result in merged format
- Event processing order changed to chronological to capture intermediate states
- Subgoal tracking updated to work with merged timeline format

### Technical
- New `VariableBindingTracker` class for tracking bindings through parent_info
- Timeline builder processes events in original order (CALL1, CALL2, CALL3, EXIT3, EXIT2, EXIT1)
- Added `specs/timeline-redesign.md` documenting the implementation

## [2.0.0] - 2025-12-21

### Added
- **Variable Flow Tracking**: Shows how variables bind and flow across execution steps
- Variable binding notes at EXIT steps (e.g., "R from Step 11 is now bound to 1")
- Parent frame information capture in tracer
- Enhanced timeline visualization with variable flow context

### Changed
- **BREAKING**: Simplified output format - removed multiple detail levels (minimal, standard, detailed, full)
- **BREAKING**: Now generates single unified output with timeline and tree views
- Tracer now captures parent_info for better execution context
- Timeline builder includes variable flow analysis pass
- Updated all example outputs with new format

### Technical
- Added `parent_info` field to trace events
- Implemented `addVariableFlowNotes()` method in timeline builder
- Added `variableFlowNotes` field to TimelineStep interface
- Enhanced timeline formatter to display variable flow information
- All 54 tests passing with new architecture

### Documentation
- Added gap-analysis.md documenting feature requirements
- Added variable-flow-implementation-plan.md with implementation details
- Updated README with new output format examples

## [1.1.3] - 2025-12-20

## [1.1.3] - 2025-12-20

### Fixed
- Fixed clause numbering inconsistency between tracer and display output
- Clause numbers now correctly map from wrapper file line numbers to source file line numbers
- Match boxes, node labels, and edge labels now show consistent clause numbering
- Resolves issue where tracer reported wrapper lines (e.g., 8,9,10) vs source lines (e.g., 26,27,28)

### Technical
- Added `prologContent` parameter to `parseTraceJson` function for line number mapping
- Enhanced `parseEvents` function to use `mapWrapperLineToSource` for accurate clause mapping
- Improved structural clause matching to work with exact tracer clause information

## [1.1.2] - 2025-12-20

## [1.1.1] - 2025-12-16

## [1.1.1] - 2025-12-16

### Fixed
- Fixed Markdown auto-numbering issue in "Clauses Defined" section
- Clause numbers now display as "**Line X:**" format to prevent Markdown renderers from renumbering them
- Maintains original source file line numbers in documentation output

## [1.1.0] - 2025-12-14

### Fixed
- Fixed missing clause matching visualisation for simple facts in detailed and full modes
- Fixed identical output between detailed and full detail levels - full now shows additional clause type information
- Improved match node creation for direct fact matches (e.g., `t(0+1, A)`)

### Added
- Comprehensive test coverage for simple fact matching scenarios
- Enhanced unification display in match nodes for simple facts
- Additional clause type information in full detail mode

## [1.0.2] - 2025-12-14

## [1.0.2] - 2025-12-13

### Fixed
- Correct copyright year from 2024 to 2025
- Remove extra newline at start of copyright notice

## [1.0.1] - 2025-12-13

### Fixed
- Correct author email address in package.json and copyright notice

## [1.0.0] - 2025-12-13

### Added
- Copyright and version information display
- Build timestamp and git commit hash tracking
- Comprehensive changelog documentation

## [1.0.0] - 2024-12-13

### Added
- Initial release of Prolog Trace Visualiser (ptv)
- Generate Mermaid diagrams from SWI-Prolog trace execution
- Four detail levels: minimal, standard, detailed, full
- Support for recursive predicate visualisation with match nodes
- Clause alignment between tracer output and visualisation
- Comprehensive test coverage (180+ tests)
- Global npm package installation support
- Built-in tracer integration with SWI-Prolog

### Features
- **Query Visualisation**: Transform Prolog execution traces into clear Mermaid flowcharts
- **Detail Levels**: 
  - `minimal`: Basic execution flow
  - `standard`: Includes recursion indicators
  - `detailed`: Adds match nodes showing clause selection
  - `full`: Complete trace with all backtracking paths
- **Match Nodes**: Show exactly which clauses are being matched during execution
- **Recursion Detection**: Automatic identification and highlighting of recursive calls
- **Clause Alignment**: Perfect synchronisation between trace events and clause references
- **Built-in Filtering**: Removes infrastructure predicates (catch/3, format/2) from output

### Technical
- TypeScript implementation with comprehensive type safety
- Property-based testing with fast-check
- Integration tests for end-to-end functionality
- Robust error handling and parser warnings
- Cross-platform compatibility (macOS, Linux, Windows)

### Installation
```
npm install -g prolog-trace-viz
ptv your-program.pl "your_query(X)"
```

### Examples
- Factorial computation with recursion visualisation
- List membership with backtracking
- Append operations with unification details
- Arithmetic expression evaluation

---

## Release Notes

### Version 1.0.0 - "Foundation Release"

This initial release establishes ptv as a comprehensive tool for visualising Prolog execution traces. The core architecture supports extensible detail levels and maintains perfect alignment between SWI-Prolog's internal clause numbering and the generated visualisations.

Key architectural decisions:
- Extract clause definitions directly from trace events rather than parsing source files
- Use predicate-based matching with heuristics for base vs recursive case detection
- Implement comprehensive filtering to hide infrastructure predicates
- Provide four distinct detail levels for different use cases

The tool has been tested extensively with property-based testing and includes comprehensive integration tests to ensure reliability across different Prolog programs and query patterns.