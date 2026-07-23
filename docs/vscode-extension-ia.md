# ptv-vscode — Information Architecture brief

> **Status:** First-cut IA brief, written as input to a Claude Design session.
>
> **Audience:** A designer (human or AI) who has not seen the rest of this project. This brief gives the *what* and the *where* — the entry points, surfaces, panels, controls, and states — so the design session can spend its time on the *how* (layout, hierarchy, motion, theming, interaction details).
>
> **Companion docs (read in this order if helpful):**
> 1. [`handoff-output-redesign.md`](./handoff-output-redesign.md) — why we're doing this at all
> 2. [`trace-model-design.md`](./trace-model-design.md) — the data the extension consumes
> 3. *(this doc)* — the surfaces and interactions

---

## 1. What ptv-vscode is, in one paragraph

A VSCode extension that traces a Prolog query and shows the execution interactively. Today, the CLI (`ptv`) produces a single monolithic markdown file — useful, but flat. The extension consumes the same trace as a structured **TraceModel** (a tree of steps with bindings, partial answers, and choice points) and renders it in a webview with interactive affordances: expand/collapse nodes, jump to source, step through the *partial answer being constructed*, navigate between solutions, see backtracking paths. Audience: Prolog learners (current target) and Prolog professionals (debugging + teaching).

---

## 2. The data the UI must render

From [`trace-model-design.md`](./trace-model-design.md), the model carries:

- **`trace: TraceNode`** — root of a tree where each node has a goal, port (call/exit/fail/redo/exception), bindings, a list of `children` (sub-goals descended into), and optional `alternatives[]` (branches tried and abandoned — Forest mode data).
- **`partialAnswer` per step** — the skeleton-so-far at that step (`X = [1 | [2 | ?]]`). Drives Skeleton mode.
- **`solutions[]` + `moreSolutionsAvailable`** — for multi-answer queries.
- **`source.clauses[]`** — the file's clause table, with line numbers.
- **`status` + `diagnostic`** — success / failure / exception, with optional source line for errors.

Every rendering surface is a pure function of this model. The UI never mutates the model; selection, expansion, filter state etc. live in the UI's own state.

---

## 3. Entry points — how the user starts a trace

Multiple, because different users reach for different idioms. **Recommend supporting all four** in V1:

| # | Entry point | Trigger | Fills in |
|---|---|---|---|
| 1 | **Command palette** — *"ptv: Trace query…"* | `Cmd+Shift+P` → type | Prompts for query if no `.pl` file in focus; uses current file otherwise |
| 2 | **Editor context menu** — right-click in a `.pl` file → *"Trace query…"* | Right-click | Same as #1, but pre-fills source file |
| 3 | **Code lens above queries** — `▶ Trace this` above any line matching `?- …` or a directive-like query comment | Click | Pre-fills both file and query — zero-friction path for learner files like `% query: factorial(5, X).` (already a convention in our fixtures) |
| 4 | **From `prolog-test-explorer`** — failing test → *"Show trace"* button | Click in test-explorer UI | test-explorer calls ptv subprocess; the extension receives the result and opens its webview (cross-product integration) |

**Open question for Design:** does #3 (code lens) need a *distinct* affordance vs. #2 (context menu)? A code lens is more discoverable but more visually noisy. One school says: only show it when there's an obvious query comment. Another: always show it, but only on the line containing the user's *first* clause (so each file gets exactly one).

---

## 4. Surface — which VSCode UI hosts the trace

VSCode offers four surfaces, each with different ergonomics:

| Surface | Pros | Cons |
|---|---|---|
| **A. Webview in a new editor tab** (like a Jupyter notebook) | Full-width, immersive; user can split-view it next to the `.pl` file | Steals editor real estate; user must Cmd+W to dismiss |
| **B. Webview in the bottom panel** (alongside Terminal / Problems / Output) | Doesn't compete with editor; matches "tool window" mental model; sidebar still free | Cramped vertically; bad for tree-heavy renders |
| **C. Sidebar view** (icon in the activity bar, narrow persistent panel) | Always-on; good for "trace explorer" pattern | Too narrow for a meaningful tree; doesn't suit prose-heavy modes |
| **D. Hover / inline decoration** in the `.pl` file | Maximally contextual; "see trace where you write" | Tiny; can't host the rich interactions we want |

**Recommend A (new editor tab)** as primary, with **D (inline decorations)** as a *secondary* surface for lightweight signals — e.g. a step number gutter mark next to the line whose clause is currently selected in the tab.

**Reject B** for V1: skeleton view needs vertical real estate. **Reject C**: too narrow.

**Open question for Design:** when the extension opens a new tab, should it open *beside* the source file (split view, source on the left) by default? Or in a fresh column? Or replace the current editor? VSCode lets the user pick, but the default matters.

---

## 5. Top-level layout inside the webview

The webview is a single React app. Two strong layout options:

### Option A — "Notebook" layout (single column, vertical scroll)

```
┌──────────────────────────────────────────────┐
│ HEADER: query, source file, status, controls │
├──────────────────────────────────────────────┤
│ MODE SWITCHER (Tree / Skeleton / Forest…)    │
├──────────────────────────────────────────────┤
│                                              │
│ MODE CONTENT (scrolls)                       │
│                                              │
├──────────────────────────────────────────────┤
│ SOLUTIONS PAGINATOR (when applicable)        │
└──────────────────────────────────────────────┘
```

- Simple, predictable, ports cleanly to the future `--mode=html` export
- Mode switching is a tab/segmented control
- Tree mode expands/collapses inline; Skeleton mode shows the construction in flow

### Option B — "IDE-debugger" layout (multi-pane)

```
┌─────────────────┬────────────────────────────┐
│ HEADER + mode controls                       │
├─────────────────┼────────────────────────────┤
│                 │                            │
│  CALL TREE      │  STEP DETAIL               │
│  (always shown) │  (whatever node is         │
│                 │   selected — bindings,     │
│                 │   partial answer, source   │
│                 │   excerpt, alternatives)   │
│                 │                            │
├─────────────────┴────────────────────────────┤
│ SOLUTIONS PAGINATOR + cross-cutting controls │
└──────────────────────────────────────────────┘
```

- Closer to standard debugger UX (call stack on left, variables on right)
- Tree is the persistent navigation; right pane is contextual
- Skeleton / Forest / Tutorial become "views" of the right pane, not separate top-level modes

**Recommend B for the *interactive* modes** (Tree, Forest, source-linked navigation). It mirrors what professional debuggers do, and the user instinct of "click a row → see details on the right" is universal.

**Recommend A for the *narrative* modes** (Skeleton, Tutorial), which want a single column for flow.

**Open question for Design:** do we collapse these into one shape (e.g. always B, but in narrative modes the left pane collapses to a thin gutter)? Or do we genuinely switch layouts based on mode? Switching is jarring; collapsing is subtler.

---

## 6. Mode landing — what does the user see first?

When the trace finishes, the webview opens to *some* mode. Options:

1. **Always Tree mode** — safest, most learner-neutral, mirrors current CLI default
2. **Auto-detect by query complexity** — small trace (≤5 steps) → Skeleton; backtracking present → Forest; everything else → Tree
3. **Remember last-used mode** — recall from VSCode global state per-user
4. **First-time user lands on Skeleton; everyone else on Tree** — onboarding-aware

**Recommend (2) auto-detect**, with a "this view was chosen because…" affordance and a 1-click way to switch. Beats fixed default; respects the data.

---

## 7. The four primary modes

### 7.1 Tree mode (default for most queries)

The call tree as collapsible rows. Each row shows:

- The goal (with bound values, e.g. `appendo([2], [3,4], R)`)
- Port indicator (✓ exit, ✗ fail, ↻ redo, ⚠ exception)
- Step number on the gutter (e.g. `[3]`)
- Source line on hover (e.g. `:77`)
- Expand/collapse chevron if there are children
- Selected state → right pane fills with details

**Open questions for Design:**
- How do failure subtrees look? Greyed and collapsed by default with a "show what was tried" toggle?
- Mid-tree REDO (backtracking) — visually distinct from siblings? Threaded line? Different indent?
- For deep traces, do we render the tree virtualised (only visible rows in DOM)? Yes — but that affects search/filter design.

### 7.2 Skeleton mode (default for learner queries)

The killer mode. Each step is a row, but instead of the call tree, the visual focus is the **partial answer**. Roughly:

```
Step 1 ━━━ enter appendo([1,2], [3,4], X)
           X = [1 | ?₁]                            ← partial answer

Step 2 ━━━ enter appendo([2], [3,4], ?₁)
           X = [1 | [2 | ?₂]]                      ← grew here

Step 3 ━━━ hit base case
           X = [1 | [2 | [3,4]]]                   ← ?₂ filled in
           ━━━ unwind ━━━
Step 4     X = [1 | [2,3,4]]                       ← ?₁ filled in
Step 5     X = [1,2,3,4]                           ← final
```

**Visual primitives the designer should consider:**
- Animation: the skeleton "grows" — should it animate on scrub, or only on user-driven step-through?
- Diff highlighting: every step shows the *delta* from the previous skeleton
- "?₁" / "?₂" placeholders — colour-coded so users can track which slot fills when
- Scrubber bar at the bottom — drag to scrub through steps; arrow keys also work
- Toggle between "descent only" / "descent + unwind" / "everything"

**Open question:** how does Skeleton mode handle backtracking? It's *not* the natural mode for backtracking-heavy queries (those go to Forest). Should Skeleton refuse to render them, or show only the successful path?

### 7.3 Forest mode (default for backtracking queries)

The choice-point tree. Tried branches (failed) shown with red X; chosen branch shown live; alternatives still pending shown faded.

```
appendo(A, B, [1,2])
├─ try clause @76: appendo([], L, L)
│    ✓ A=[], B=[1,2]                ─── SOLUTION 1
│
├─ try clause @77: appendo([H|T], L, [H|R])
│    H=1, A=[1|T'], B=L, R=[2]
│    └─ recurse: appendo(T', L, [2])
│        ├─ try clause @76
│        │    ✓ T'=[], L=[2]
│        │    ✓ A=[1], B=[2]        ─── SOLUTION 2
│        └─ try clause @77 → fails (head pattern mismatch)
```

**Visual primitives:**
- Branch lines (the ASCII art above becomes proper SVG / styled HTML)
- Per-branch state: tried-and-failed (red X), succeeded-once (green check), pending (faded)
- "Solution found" markers float to a side rail with line numbers, clickable to jump to that branch
- Cut barrier (when `!` fires) — distinct visual: a horizontal bar with "cut here" label, alternatives below greyed out and labelled "pruned"

**Open question:** is Forest a separate mode, or always available as an overlay on Tree mode? Argument for overlay: backtracking is *part* of the call story; mode-switching loses context.

### 7.4 Source-linked navigation (cross-cutting, not a mode)

This isn't a *mode*; it's a behaviour that runs in every mode.

- **Click any step in the trace** → editor reveals the matching `.pl` file at the matching line, with a highlight decoration
- **Click any clause in the source file** → trace view scrolls to and selects the first step where that clause fired
- **Multi-firing clauses** — show a small chip with count and step numbers ("fired at steps 2, 5, 8"), clickable to cycle

**Open question:** does this rely on a peek view (a temporary editor inset), or on opening the file in a real editor pane? Peek is less disruptive; full editor is more useful for actual code editing. VSCode allows both — recommend full editor by default, peek as a hover/preview affordance.

---

## 8. Cross-cutting controls

Should be present in every mode, ideally in a consistent location (header band).

- **Depth limit** — slider or input; defaults to the model's depth field
- **Search** — fuzzy match on goal text, predicate name, or step number
- **Filter** — by port (hide all `fail` subtrees, etc.) or by predicate (`only show appendo/3`)
- **Jump to step N** — typeable input
- **Solutions paginator** — `< 1 of 3 >`, with a "show all" sibling action that switches to Forest mode
- **Re-trace** — re-runs the query; useful if user edits the source while the panel is open
- **Export** — download as JSON / markdown / static HTML
- **Settings** — colour scheme, font, mode default, animation on/off

**Open question:** is "re-trace" automatic on file save, or manual? Auto is delightful when it works, frustrating when the file is mid-edit and ill-formed. Recommend: manual by default, with an opt-in "auto-trace on save" toggle.

---

## 9. State catalogue

The designer needs every state designed, not just the happy path.

| State | When | What to show |
|---|---|---|
| **Idle** | Extension just opened, no trace yet | A primer / cheat sheet — "trace your first query" with an example button |
| **Loading** | swipl subprocess running | Progress (spinner with elapsed time; SWI traces can take a few seconds) + cancel button |
| **Success** | trace ready, ≥1 solution | The chosen mode renders normally |
| **No solutions** | query failed entirely | "No solutions found. Here's what Prolog tried" + Forest mode showing the failure tree |
| **Exception** | runtime error in user code | Error message prominent at top; source line linked; partial trace below if any |
| **More-than-N solutions** | unbounded query (e.g. generate-and-test) | Truncated trace + clear affordance: "showing first 100; load more / change limit" |
| **Engine error** | ptv itself failed | Friendly error + "report bug" link with prefilled details |
| **Stale** | source file modified since trace | Subtle banner at top: "Source has changed since this trace. Re-trace?" |

**Open question:** how to surface partial results during long traces? VSCode can stream output. Should we stream trace events progressively, or wait for the complete model?

---

## 10. Editor integration

Beyond clicking-to-jump, what else should the extension do in the editor itself?

**Strongly recommend** (small, high-value):
- **Step gutter marks** — when a step is selected in the webview, render a step-number badge in the editor gutter of the matching clause
- **Active-clause highlight** — when the user is stepping through (e.g. dragging the Skeleton scrubber), highlight the matching clause line in the editor

**Probably yes**:
- **Inline trace counts** — small "fired 3 times" annotation next to clauses that fired (toggleable per-trace)

**Defer to V2**:
- Replay-style stepping in the editor (like a real debugger's F10/F11)
- Inline variable bindings shown as decorations
- "Find references" integration

---

## 11. Persistence

What survives across sessions:

| Item | Persists across reload | Persists across VSCode restart |
|---|---|---|
| Selected mode | yes | yes |
| Selected step | yes | no (resets to first) |
| Expanded tree nodes | yes | yes |
| Search/filter input | yes | no |
| Last query for this `.pl` file | yes | yes (workspace state) |
| User preferences (default mode, colours, animation) | yes | yes (global state) |

The trace data itself is *not* persisted — every reload re-runs the trace. This is intentional: the source file may have changed.

**Open question:** should the user be able to save/pin a trace explicitly? Use case: a teacher writes a tutorial and wants the trace exactly as it was. → Export to JSON solves this without us needing internal persistence machinery.

---

## 12. Themes and a11y

Inherits the user's VSCode theme by default — light, dark, high-contrast. Custom palette only for the trace-specific signals:

- **Carried vs. newly bound variables** — needs distinct treatment (the P2 learner improvement). Recommend: newly bound = bold or accent colour; carried = muted/secondary
- **Port indicators** — distinct shapes *and* colours (don't rely on colour alone for a11y)
- **Failure paths** — strikethrough or red; never just colour
- **Skeleton placeholders** (`?₁`) — colour-coded slots; needs a parallel symbol/numeric scheme so colourblind users can still track

Keyboard navigation must cover everything: tree expand/collapse with arrow keys, mode switching with `Cmd+1/2/3`, jump-to-step with `Cmd+G N`, search with `Cmd+F` (intercepted within the webview).

---

## 13. Open questions, consolidated

These are the questions Claude Design should address (the IA brief deliberately leaves them unresolved, since the visual stage is the right time to settle them):

1. Code lens vs. context menu vs. both for the "trace this" entry point
2. New tab default placement — beside source, fresh column, or replace?
3. Unified multi-pane layout vs. switching between notebook and IDE-debugger shapes
4. Auto-detect default mode vs. fixed default vs. user remembering
5. Failure subtrees in Tree mode — collapsed-by-default with toggle, or always shown faded?
6. Skeleton mode behaviour on backtracking-heavy queries
7. Forest as separate mode vs. overlay on Tree
8. Peek vs. full editor for source-linked navigation
9. Manual vs. auto-trace on source file save
10. Streaming trace events vs. wait-for-complete-model

---

## 14. Out of scope for this brief

Things Claude Design should NOT design in the first session:

- **The full design system** — colours, type scale, spacing. Use VSCode theme defaults for V1.
- **Marketing site / landing page** — that's a Textology Labs Website concern.
- **Settings UI** — VSCode's built-in settings UI handles this; we just contribute a settings schema.
- **Onboarding flow / first-run wizard** — V1 can do without; revisit if usage data suggests confusion.
- **Mobile / web variant** — there is no mobile or web target.
- **Localisation** — English-only V1.

---

## 15. Deliverables expected from the Design session

What we'd like to come out of Claude Design with:

1. **Resolved decisions** on the 10 open questions above (or at least narrowed to 1-2 candidates each)
2. **High-fidelity mockups** of:
   - Tree mode (default state — query with ~10 steps, one expansion)
   - Skeleton mode (mid-scrub, showing 3 steps with placeholder colour-coding)
   - Forest mode (3 solutions visible, one failure branch shown)
   - The cross-cutting header (controls)
   - At least 3 of the non-happy states from § 9
3. **Interaction notes** — short captions per mockup explaining what's clickable / hoverable / draggable
4. **An updated version of this brief** with the open questions answered and unresolved questions surfaced

---

## 16. Pointers

- ClickUp: [VSCode extension](https://app.clickup.com/t/869dea7v0)
- ClickUp: [Phase 0: TraceModel contract + fixtures](https://app.clickup.com/t/869deab12)
- Companion docs: [`handoff-output-redesign.md`](./handoff-output-redesign.md), [`trace-model-design.md`](./trace-model-design.md)
- Repo: this one (`prolog-trace-viz`)
- Companion product: `prolog-test-explorer` (shares the webview component long-term)
