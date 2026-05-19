# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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