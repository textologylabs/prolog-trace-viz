/**
 * Tree Formatter - Generates Mermaid diagram from tree structure
 * 
 * By default, uses clause variable names instead of internal Prolog names.
 * With --debug:internal-vars, shows both: "Z (_2008) = value"
 */

import { TreeNode } from './tree.js';
import { TimelineStep, Solution, stepScope } from './timeline.js';
import { DebugFlag } from './cli.js';
import { LabelMode, buildLabelMap } from './coref.js';

export interface TreeFormatterOptions {
  debugFlags?: Set<DebugFlag>;
  /** Variable-labeling mode; applies the same X@N disambiguation as the timeline. */
  labelMode?: LabelMode;
  /** The original query — needed to scope the query's own variables. */
  query?: string;
}

/**
 * A scope-aware relabeling function for tree node text. Mermaid cannot colour
 * sub-tokens within a node label, so the tree gets the X@N labels (matching the
 * timeline) but not the per-variable colour.
 */
type TreeRelabel = (text: string, scope: 'query' | number) => string;
const TREE_IDENTITY: TreeRelabel = (t) => t;
const TREE_VAR_TOKEN = /[A-Za-z_][A-Za-z0-9_]*/g;

function buildTreeRelabel(steps: TimelineStep[], query: string, options: TreeFormatterOptions): TreeRelabel {
  const mode = options.labelMode;
  if (!mode || !query) return TREE_IDENTITY;
  const map = buildLabelMap(steps, query, mode);
  const active = mode !== 'source' && (mode === 'full' || map.overloaded.size > 0);
  return active ? (text, scope) => text.replace(TREE_VAR_TOKEN, (tok) => map.label(tok, scope)) : TREE_IDENTITY;
}

/**
 * Check if a debug flag is enabled
 */
function hasDebugFlag(options: TreeFormatterOptions, flag: DebugFlag): boolean {
  return options.debugFlags?.has(flag) ?? false;
}

/**
 * Format tree as Mermaid diagram
 */
export function formatTreeAsMermaid(root: TreeNode | null, options: TreeFormatterOptions = {}): string {
  if (!root) {
    return 'graph TD\n  A["No execution tree"]';
  }
  
  const lines: string[] = [];
  lines.push('graph TD');
  lines.push('');
  
  // Generate nodes
  const nodes: string[] = [];
  const edges: string[] = [];
  const styles: string[] = [];
  
  collectNodesAndEdges(root, nodes, edges, styles, true, options);
  
  // Add nodes section
  lines.push('%% Nodes');
  lines.push(...nodes);
  lines.push('');
  
  // Add edges section
  lines.push('%% Edges');
  lines.push(...edges);
  lines.push('');
  
  // Add styles section
  lines.push('%% Styles');
  lines.push(...styles);
  
  return lines.join('\n');
}

/** Node styles, keyed by role. `color` keeps labels legible on the fills in dark viewers. */
const NODE_STYLE = {
  query: 'fill:#e1f5ff,stroke:#01579b,stroke-width:3px,color:#0b2440',
  success: 'fill:#c8e6c9,stroke:#388e3c,color:#14361a',
  fail: 'fill:#ffcdd2,stroke:#c62828,stroke-width:2px,color:#4a1414',
  pending: 'fill:#fff9c4,stroke:#f57f17,color:#4a3208',
  answer: 'fill:#c8e6c9,stroke:#2e7d32,stroke-width:3px,color:#14361a',
} as const;

const MERMAID_INIT =
  "%%{init: {'flowchart': {'nodeSpacing': 46, 'rankSpacing': 50}, 'themeVariables': {'fontSize': '15px'}}}%%";

/**
 * Format the execution timeline as a Mermaid derivation diagram.
 *
 * Reads as the actual execution flow rather than a static call tree: goals are
 * chained in the order they run, and backtracking shows up as a loop — a dotted
 * "backtrack to Ⓝ" edge from the dead end back to the choice point, then a thick
 * "retry" edge on to the re-solution. It inherits everything the timeline gets
 * right (query-named goals, real results, conjunction siblings, nested retries),
 * and ends on a ✓ node carrying the answer.
 */
export function formatTimelineAsMermaid(
  steps: TimelineStep[],
  query: string,
  finalAnswer?: string,
  options: TreeFormatterOptions = {},
  solutions?: Solution[]
): string {
  if (steps.length === 0) {
    return [MERMAID_INIT, 'graph TD', '', '%% Nodes', `A["${escapeLabel('?- ' + query)}"]`].join('\n');
  }

  const nodes: string[] = [];
  const edges: string[] = [];
  const styles: string[] = [];

  let counter = 0;
  const nextId = (): string => generateMermaidId(counter++);

  // step number -> node id. Origins are always numbered before the retry that
  // re-enters them, so a single depth-first pass sees them in time.
  const idOfStep = new Map<number, string>();

  const relabel = buildTreeRelabel(steps, query, options);

  const rootId = nextId();
  nodes.push(`${rootId}["${escapeLabel('?- ' + relabel(query, 'query'))}"]`);
  styles.push(`style ${rootId} ${NODE_STYLE.query}`);

  // Walk a sibling list, chaining them in execution order and nesting each
  // one's own subtree beneath it. Returns the last sibling's id (the point the
  // flow continues from). parentScope is the caller's variable scope: 'query'
  // at the top, the enclosing step's number for nested subgoals.
  // The last node emitted for each solution, so a ✓ leaf hangs off the goal
  // that actually established that solution (not a synthesized ancestor re-exit).
  const lastIdBySolution = new Map<number, string>();

  // Solutions reached by a *demand-driven* redo (findnsols/; asking for the next
  // answer, no failure to trigger it). These still backtrack — into the recorded
  // choice point — but there is no dead-end node to draw the unwind from, so the
  // loop is drawn later from the previous solution's leaf (see the forest below).
  const demandRetryOrigin = new Map<number, { id: string; step: number }>();

  const walk = (list: TimelineStep[], parentId: string, parentScope: 'query' | number): string | null => {
    let prevId: string | null = null;
    for (const step of list) {
      // An ancestor re-entry is a consequential *second EXIT*, not a choice
      // point of its own — the goal never received a REDO. Don't draw it as a
      // node; thread the real re-solution beneath it into the current flow, so
      // the solution hangs off the goal that actually backtracked.
      if (step.isAncestorReentry) {
        const childLast = walk(step.children, prevId ?? parentId, stepScope(step));
        if (childLast) {
          prevId = childLast;
          if (step.solutionIndex !== undefined) lastIdBySolution.set(step.solutionIndex, childLast);
        }
        continue;
      }

      const id = nextId();
      idOfStep.set(step.stepNumber, id);
      nodes.push(`${id}[${labelForStep(step, relabel, parentScope)}]`);
      styles.push(`style ${id} ${styleForStep(step)}`);

      const origin = step.isRetry && step.retryOfStep !== undefined
        ? idOfStep.get(step.retryOfStep)
        : undefined;

      if (origin) {
        // Every redo is backtracking: Prolog unwinds to a choice point and takes
        // its next alternative. Two flavours, both drawn as a dotted "backtrack
        // to Ⓝ" loop into the choice point plus the thick "next solution" edge on
        // to the re-solution:
        //   - failure-driven: the unwind starts at a distinct dead end (a failed
        //     goal), so the loop is drawn here, from that dead end.
        //   - demand-driven (findnsols/;): no failure, so the unwind starts where
        //     the *previous* solution completed. That leaf does not exist yet, so
        //     record the choice point and draw the loop with the forest below.
        const deadEnd = step.backtrackFromStep !== undefined
          ? idOfStep.get(step.backtrackFromStep)
          : undefined;
        if (deadEnd && deadEnd !== origin) {
          edges.push(`${deadEnd} -.->|"backtrack to ${toCircledNumber(step.retryOfStep!)}"| ${origin}`);
        } else if (step.backtrackFromStep === undefined && step.solutionIndex !== undefined) {
          demandRetryOrigin.set(step.solutionIndex, { id: origin, step: step.retryOfStep! });
        }
        edges.push(`${origin} ==>|"next solution"| ${id}`);
      } else {
        edges.push(`${prevId ?? parentId} --> ${id}`);
      }

      // Record before recursing so a deeper node of the same solution wins —
      // the ✓ leaf should hang off the innermost goal that established it.
      if (step.solutionIndex !== undefined) lastIdBySolution.set(step.solutionIndex, id);
      walk(step.children, id, stepScope(step));
      prevId = id;
    }
    return prevId;
  };

  const lastId = walk(steps, rootId, 'query');

  if (solutions && solutions.length > 1) {
    // A forest: one ✓ leaf per solution, hung off the last node that solution
    // actually reached. Turns the flow into the full search tree.
    let prevLeafId: string | null = null;
    for (const sol of solutions) {
      const anchorId = lastIdBySolution.get(sol.index) ?? lastId;
      if (!anchorId) continue;
      const termId = nextId();
      const label = sol.bindings.length
        ? sol.bindings.map(b => `${relabel(b.variable, 'query')} = ${b.value}`).join(', ')
        : 'true';
      nodes.push(`${termId}["${escapeLabel(`✓ solution ${sol.index}: ${label}`)}"]`);
      styles.push(`style ${termId} ${NODE_STYLE.answer}`);
      // Demand-driven backtrack loop: having found the previous solution, Prolog
      // unwound from it back to this solution's choice point to seek another
      // answer. Draw the dotted loop from that leaf so the backtracking is visible
      // even though nothing failed. The thick "next solution" edge (drawn in the
      // walk) then carries the flow on to the re-solution.
      const back = demandRetryOrigin.get(sol.index);
      if (back && prevLeafId) {
        edges.push(`${prevLeafId} -.->|"backtrack to ${toCircledNumber(back.step)}"| ${back.id}`);
      }
      edges.push(`${anchorId} --> ${termId}`);
      prevLeafId = termId;
    }
  } else if (finalAnswer && lastId) {
    // Single solution: one terminal ✓ node carrying the answer.
    const termId = nextId();
    nodes.push(`${termId}["${escapeLabel('✓ ' + relabel(finalAnswer, 'query'))}"]`);
    styles.push(`style ${termId} ${NODE_STYLE.answer}`);
    edges.push(`${lastId} --> ${termId}`);
  }

  return [
    MERMAID_INIT, 'graph TD', '',
    '%% Nodes', ...nodes, '',
    '%% Flow', ...edges, '',
    '%% Styles', ...styles,
  ].join('\n');
}

/**
 * Node label: circled step number (matching the timeline), the goal in the
 * caller's variable names with earlier bindings substituted in, the clause line,
 * and what the step bound. A failure is just "Ⓝ ✗ fail" — the goal it tried is
 * on the call node above it.
 */
function labelForStep(step: TimelineStep, relabel: TreeRelabel = TREE_IDENTITY, scope: 'query' | number = 'query'): string {
  if (step.port === 'fail') {
    return `"${toCircledNumber(step.stepNumber)} ✗ fail"`;
  }

  const parts: string[] = [`${toCircledNumber(step.stepNumber)} ${escapeLabel(displayGoal(step, relabel, scope))}`];

  const clauseRef = step.clause
    ? `${step.clause.body && step.clause.body !== 'true' ? 'clause' : 'fact'} ${step.clause.line}`
    : '';

  if (step.resultBindings && step.resultBindings.length > 0) {
    const bound = step.resultBindings.map(b => `${relabel(b.variable, scope)} = ${escapeLabel(b.value)}`).join(', ');
    parts.push(clauseRef ? `${bound} · ${clauseRef}` : bound);
  } else if (clauseRef) {
    parts.push(clauseRef);
  }

  return `"${parts.join('<br/>')}"`;
}

/**
 * The goal as it was actually run: the caller's template (query conjunct or
 * clause subgoal) with the bindings that reached it substituted in, so a call
 * shows `likes(john, food)` rather than `likes(john, X)`.
 */
function displayGoal(step: TimelineStep, relabel: TreeRelabel = TREE_IDENTITY, scope: 'query' | number = 'query'): string {
  let goal = step.subgoalTemplate ?? step.goal;
  if (step.subgoalBindings) {
    for (const { variable, value } of step.subgoalBindings) {
      goal = goal.replace(new RegExp(`\\b${variable}\\b`, 'g'), value);
    }
  }
  return relabel(goal, scope);
}

/**
 * Mermaid node style: green for a goal that succeeded, red for a failure, amber
 * for one still open (a bare CALL that never got its own EXIT).
 */
function styleForStep(step: TimelineStep): string {
  if (step.port === 'fail') return NODE_STYLE.fail;
  if (step.port === 'merged') return NODE_STYLE.success;
  return NODE_STYLE.pending;
}

/**
 * Escape the few characters that break a quoted Mermaid label.
 */
function escapeLabel(text: string): string {
  return text
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Generate a Mermaid-safe node id (A-Z, AA-AZ, ...) from a running index.
 */
function generateMermaidId(index: number): string {
  if (index < 26) {
    return String.fromCharCode(65 + index);
  }
  const first = String.fromCharCode(65 + Math.floor(index / 26) - 1);
  const second = String.fromCharCode(65 + (index % 26));
  return first + second;
}

/**
 * Collect nodes, edges, and styles recursively
 */
function collectNodesAndEdges(
  node: TreeNode,
  nodes: string[],
  edges: string[],
  styles: string[],
  isRoot: boolean = true,
  options: TreeFormatterOptions = {}
): void {
  // Generate node definition
  const nodeLabel = formatNodeLabel(node, options);
  nodes.push(`${node.id}[${nodeLabel}]`);
  
  // Generate style
  const style = getNodeStyle(node, isRoot);
  if (style) {
    styles.push(style);
  }
  
  // Generate edges to children
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i];
    
    // Use actual subgoal content if available, otherwise generic label
    let edgeLabel = `subgoal ${i + 1}`;
    if (node.subgoals && i < node.subgoals.length) {
      edgeLabel = node.subgoals[i].goal;
    }
    
    edges.push(`${node.id} -->|"${edgeLabel}"| ${child.id}`);
    
    // Recursively process child
    collectNodesAndEdges(child, nodes, edges, styles, false, options);
  }
}

/**
 * Format node label with circled numbers and clause info
 */
function formatNodeLabel(node: TreeNode, options: TreeFormatterOptions = {}): string {
  const parts: string[] = [];
  const showInternalVars = hasDebugFlag(options, 'internal-vars');
  
  // Use source clause head if available, otherwise use goal
  const displayGoal = node.clauseHead || node.goal;
  
  // Add call step with circled number
  parts.push(`${toCircledNumber(node.callStep)} ${displayGoal}`);
  
  // Add clause number if available
  if (node.clauseNumber) {
    parts.push(`clause ${node.clauseNumber}`);
  }
  
  // Add final binding if available
  if (node.finalBinding) {
    // Format the binding - use clause variable name, optionally with internal var
    const bindingDisplay = formatBindingWithClauseVar(node.finalBinding, node.clauseHead, showInternalVars);
    parts.push(`Result: ${bindingDisplay}`);
  }
  
  return `"${parts.join('<br/>')}"`;
}

/**
 * Format a binding using clause variable name instead of internal name
 * When showInternalVars is true, shows both: "Z (_2008)=value"
 * e.g., "_2008=1+1+1+1+0" with clauseHead "t(X+1+1, Z)" -> "Z=1+1+1+1+0" or "Z (_2008)=1+1+1+1+0"
 */
function formatBindingWithClauseVar(binding: string, clauseHead?: string, showInternalVars: boolean = false): string {
  if (!clauseHead) return binding;
  
  // Parse binding: "_2008=1+1+1+1+0" -> ["_2008", "1+1+1+1+0"]
  const eqIndex = binding.indexOf('=');
  if (eqIndex === -1) return binding;
  
  const varPart = binding.slice(0, eqIndex);
  const valuePart = binding.slice(eqIndex + 1);
  
  // If it's an internal variable, try to find the clause variable name
  if (/^_\d+$/.test(varPart)) {
    // Extract the last argument from clause head (typically the output)
    const headMatch = clauseHead.match(/^[^(]+\((.+)\)$/);
    if (headMatch) {
      const args = splitArgsSimple(headMatch[1]);
      if (args.length > 0) {
        const lastArg = args[args.length - 1].trim();
        // Check if it's a simple variable or pattern
        if (/^[A-Z][A-Za-z0-9_]*$/.test(lastArg) || lastArg.includes('+') || lastArg.includes('[')) {
          if (showInternalVars) {
            // Additive: show both clause var and internal var
            return `${lastArg} (${varPart})=${valuePart}`;
          }
          // Clean: just clause var
          return `${lastArg}=${valuePart}`;
        }
      }
    }
  }
  
  return binding;
}

/**
 * Simple argument splitter for clause heads
 */
function splitArgsSimple(argsStr: string): string[] {
  const args: string[] = [];
  let current = '';
  let depth = 0;
  
  for (const char of argsStr) {
    if (char === '(' || char === '[') {
      depth++;
      current += char;
    } else if (char === ')' || char === ']') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  if (current.trim()) {
    args.push(current.trim());
  }
  
  return args;
}

/**
 * Convert number to circled Unicode character
 */
function toCircledNumber(n: number): string {
  if (n >= 1 && n <= 20) {
    // Unicode circled numbers 1-20
    return String.fromCharCode(0x2460 + n - 1);
  } else if (n >= 21 && n <= 35) {
    // Unicode circled numbers 21-35
    return String.fromCharCode(0x3251 + n - 21);
  } else if (n >= 36 && n <= 50) {
    // Unicode circled numbers 36-50
    return String.fromCharCode(0x32B1 + n - 36);
  } else {
    // Fallback for numbers > 50
    return `(${n})`;
  }
}

/**
 * Get Mermaid style for node based on status
 */
function getNodeStyle(node: TreeNode, isRoot: boolean): string | null {
  if (isRoot) {
    // Blue for root query
    return `style ${node.id} fill:#e1f5ff,stroke:#01579b,stroke-width:3px`;
  }
  
  switch (node.status) {
    case 'success':
      // Green for success
      return `style ${node.id} fill:#c8e6c9,stroke:#388e3c`;
    case 'failure':
      // Red for failure
      return `style ${node.id} fill:#ffcdd2,stroke:#c62828`;
    case 'pending':
      // Yellow for pending
      return `style ${node.id} fill:#fff9c4,stroke:#f57f17`;
    default:
      return null;
  }
}

/**
 * Handle backtracking visualization in tree
 */
export function markBacktrackingPaths(root: TreeNode): void {
  // Walk the tree and mark failed attempts
  function markNode(node: TreeNode): void {
    // If this node failed, mark it
    if (node.status === 'failure') {
      // Already marked by status
    }
    
    // Process children
    for (const child of node.children) {
      markNode(child);
    }
  }
  
  markNode(root);
}
