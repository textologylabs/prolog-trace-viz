# prolog-trace-viz

Generate beautiful, educational visualisations from Prolog execution traces.

## Features

- Custom Prolog tracer using SWI-Prolog's trace interception hook
- Captures accurate unification information directly from execution
- **Dual visualisation format**: execution timeline + call tree diagram
- **Pattern matching display**: Shows how goals unify with clause heads
- **Subgoal tracking**: Labels and tracks subgoals with [N.M] notation
- Generates colour-coded Mermaid diagrams
- Produces complete markdown documentation with step-by-step breakdowns
- Tracks variable bindings and clause usage
- **Smart clause filtering** - Only shows clauses that were actually used during execution
- **Depth limiting** - Control trace depth to focus on relevant execution
- No external dependencies beyond SWI-Prolog

## Prerequisites

**SWI-Prolog 7.0 or later** - Install from https://www.swi-prolog.org/Download.html

The tool uses a custom tracer built on SWI-Prolog's `prolog_trace_interception/4` hook, which requires version 7.0 or later. No additional packages are required.

## Installation

```
npm install -g prolog-trace-viz
```

Or run directly with npx:

```
npx prolog-trace-viz <prolog-file> <query>
```

## Usage

```
prolog-trace-viz <prolog-file> <query> [options]
```

### Arguments

- `<prolog-file>` - Path to your Prolog source file
- `<query>` - Prolog query to trace (e.g., `"append([1,2], [3,4], X)"`)

### Options

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Write output to file (default: `<source>-output.md`) |
| `--depth <number>` | Maximum trace depth to capture (default: 100) |
| `-n, --solutions <n>` | Trace up to `n` solutions (default: 1) |
| `--all` | Trace all solutions (capped at 10) |
| `--split` | Also write one file per solution: `<source>-soln1.md`, `-soln2.md`, … |
| `--tree` | Include the call tree diagram (Mermaid) |
| `--debug` | Enable all debug features |
| `--debug:<flag>` | Enable specific debug flag (e.g., `--debug:internal-vars`) |
| `--verbose` | Display detailed processing information |
| `--quiet` | Suppress all non-error output except final result |
| `-h, --help` | Show help message |
| `-v, --version` | Show version number |

ptv automatically checks npm for a newer release (at most once per day) and
offers to install it. Use `--quiet` to skip that check.

### Multiple solutions

By default ptv traces the **first** solution. Ask for more with `-n` (or `--all`,
capped at 10):

```
prolog-trace-viz likes.pl "likes(mary, X)" -n 5 --tree
```

The output gains a **Solutions** summary table, the timeline is split by
`──── Solution N ────` dividers, and the call tree becomes a **forest** — one
`✓` leaf per solution, with `next solution` edges showing how backtracking
enumerates them. Enumeration is one continuous trace (Prolog backtracks from one
solution into the next), not N independent runs.

Add `--split` to also emit a self-contained file per solution
(`<source>-soln1.md`, `-soln2.md`, …), each covering that solution's segment of
the derivation.

### Debug Flags

| Flag | Description |
|------|-------------|
| `internal-vars` | Show Prolog's internal variable names alongside clause variable names (e.g., `Z (_2008) = value`) |

Debug flags can be combined: `--debug:internal-vars,other-flag` or use `--debug` to enable all.

### Examples

Basic usage:

```
prolog-trace-viz program.pl "append([1,2], [3,4], X)"
```

Save to file:

```
prolog-trace-viz program.pl "member(X, [a,b,c])" -o trace.md
```

With verbose output:

```
prolog-trace-viz program.pl "factorial(5, X)" --verbose
```

Limit trace depth:

```
prolog-trace-viz program.pl "factorial(10, X)" --depth 20
```

## Example Output

### Simple Example: Append

Given a simple Prolog file `append.pl`:

```prolog
append([], L, L).
append([H|T], L, [H|R]) :- append(T, L, R).
```

Running:

```
prolog-trace-viz append.pl "append([1,2], [3], X)"
```

Produces a markdown document with:

1. **Query section** - The original query in a code block
2. **Clause definitions** - Table showing clauses used during execution
3. **Execution timeline** - Step-by-step breakdown with subgoal tracking
4. **Call tree diagram** - Mermaid visualisation showing execution structure
5. **Final answer** - The result bindings with original query variables

### Advanced Example: Recursive Arithmetic

The tool excels at visualising complex recursive predicates. Consider this arithmetic transformation example:

```prolog
t(0+1, 1+0).
t(X+0+1, X+1+0).
t(X+1+1, Z) :- t(X+1, X1), t(X1+1, Z).
```

Running:

```
prolog-trace-viz operators.pl "t(1+0+1+1+1, B)"
```

Produces a beautifully nested timeline showing how the recursion unfolds:

```
┌─ Step 1: t(1+0+1+1+1,Z)
│  Clause: t(X+1+1, Z) [line 28]
│  Unifications:
│    X = 1+0+1
│  Subgoals:
│    [1.1] t(X+1, X1) → t(1+0+1+1, X1)
│    [1.2] t(X1+1, Z)
│  
│  ┌─ Step 2 [Goal 1.1]: t(1+0+1+1,Z)
│  │  Clause: t(X+1+1, Z) [line 28]
│  │  Unifications:
│  │    X = 1+0
│  │  Subgoals:
│  │    [2.1] t(X+1, X1) → t(1+0+1, X1)
│  │    [2.2] t(X1+1, Z)
│  │  
│  │  ┌─ Step 3 [Goal 2.1]: t(1+0+1,X+1+0)
│  │  │  Fact: t(X+0+1, X+1+0) [line 27]
│  │  │  Unifications:
│  │  │    X = 1
│  │  │  => X+1+0 = 1+1+0
│  │  └─
│  │  ┌─ Step 4 [Goal 2.2]: t(X1+1, Z) → t(1+1+0+1,X+1+0)
│  │  │  where X1 = 1+1+0 (from Step 3)
│  │  │  Fact: t(X+0+1, X+1+0) [line 27]
│  │  │  Unifications:
│  │  │    X = 1+1
│  │  │  => X+1+0 = 1+1+1+0
│  │  └─
│  │  => Z = 1+1+1+0
│  └─
│  ┌─ Step 5 [Goal 1.2]: t(X1+1, Z) → t(1+1+1+0+1,X+1+0)
│  │  where X1 = 1+1+1+0 (from Step 2)
│  │  Fact: t(X+0+1, X+1+0) [line 27]
│  │  Unifications:
│  │    X = 1+1+1
│  │  => X+1+0 = 1+1+1+1+0
│  └─
│  => Z = 1+1+1+1+0
│  Query Variable: B = 1+1+1+1+0
└─
```

Key features shown:
- **Nested structure**: Child calls are visually nested inside their parents
- **Subgoal tracking**: `[1.1]`, `[2.1]` etc. show which subgoal is being solved
- **Binding context**: `where X1 = 1+1+0 (from Step 3)` shows how variables flow between sibling subgoals
- **Clean variable names**: Uses clause variable names (X, Z, X1) instead of Prolog's internal names (_2008)
- **Results after children**: The `=> Z = value` appears after all child steps complete

### Timeline Format

The execution timeline shows each step with:
- Step number and event type (CALL, EXIT, REDO, FAIL)
- Goal being solved
- Pattern matches and unifications
- Subgoal labels in `[N.M]` format
- Variable flow between steps
- Box drawing characters for visual structure

### Call Tree Format

The Mermaid diagram shows:
- Circled numbers (①②③...) for step references
- Node colours: blue (root query), green (success), red (failure)
- Edges labelled with subgoal relationships
- Clause numbers for each call
- Final bindings at EXIT nodes

## Architecture

The tool uses a custom Prolog tracer that leverages SWI-Prolog's `prolog_trace_interception/4` hook to capture execution events. This approach provides several advantages:

- **Accurate unifications**: Direct access to variable bindings via `prolog_frame_attribute/3`
- **No code instrumentation**: Your Prolog code runs unmodified
- **Reliable clause tracking**: Clause numbers come from Prolog's internal tracking
- **Structured output**: JSON-based trace format for easy parsing
- **Depth control**: Configurable trace depth to manage output size

### Pipeline

1. Parse user's Prolog file to extract clauses
2. Generate wrapper that loads custom tracer with depth limit
3. Execute query with trace interception active
4. Export trace events as JSON
5. Build execution timeline and call tree in parallel
6. Format timeline with subgoal tracking and variable flow
7. Generate Mermaid diagram from call tree
8. Render complete markdown document

## Development

```
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

Every push and pull request against `main` runs the build, type-check, and
tests on CI (SWI-Prolog is installed in the runner). `main` is protected: land
changes through a pull request with a green CI check.

## Releasing

Releases are cut locally and published by CI:

```
# On main, working tree clean:
npm run release patch      # or minor / major / x.y.z
git push origin main --tags
```

`npm run release` bumps the version, regenerates build info, builds, runs the
tests, updates the changelog, commits `🔖 release vX.Y.Z`, and creates the
matching `vX.Y.Z` tag. Pushing that tag triggers the **Publish** workflow,
which rebuilds, retests, and runs `npm publish` (with provenance).

One-time setup: create an **Automation** access token on npmjs.com (Automation
tokens bypass 2FA) and store it as a repository secret:

```
gh secret set NPM_TOKEN --repo textologylabs/prolog-trace-viz
```

## Licence

MIT
