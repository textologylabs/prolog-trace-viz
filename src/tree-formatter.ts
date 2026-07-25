/**
 * Tree Formatter - Generates Mermaid diagram from tree structure
 * 
 * By default, uses clause variable names instead of internal Prolog names.
 * With --debug:internal-vars, shows both: "Z (_2008) = value"
 */

import { TreeNode } from './tree.js';
import { TimelineStep } from './timeline.js';
import { DebugFlag } from './cli.js';

export interface TreeFormatterOptions {
  debugFlags?: Set<DebugFlag>;
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
  options: TreeFormatterOptions = {}
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

  const rootId = nextId();
  nodes.push(`${rootId}["${escapeLabel('?- ' + query)}"]`);
  styles.push(`style ${rootId} ${NODE_STYLE.query}`);

  // Walk a sibling list, chaining them in execution order and nesting each
  // one's own subtree beneath it. Returns the last sibling's id (the point the
  // flow continues from).
  const walk = (list: TimelineStep[], parentId: string): string | null => {
    let prevId: string | null = null;
    for (const step of list) {
      const id = nextId();
      idOfStep.set(step.stepNumber, id);
      nodes.push(`${id}[${labelForStep(step)}]`);
      styles.push(`style ${id} ${styleForStep(step)}`);

      const origin = step.isRetry && step.retryOfStep !== undefined
        ? idOfStep.get(step.retryOfStep)
        : undefined;

      if (origin) {
        // Backtracking: the previous step in execution order is the dead end;
        // control returns to the choice point, which then yields this retry.
        const deadEnd = idOfStep.get(step.stepNumber - 1) ?? prevId ?? parentId;
        edges.push(`${deadEnd} -.->|"backtrack to ${toCircledNumber(step.retryOfStep!)}"| ${origin}`);
        edges.push(`${origin} ==>|"retry"| ${id}`);
      } else {
        edges.push(`${prevId ?? parentId} --> ${id}`);
      }

      walk(step.children, id);
      prevId = id;
    }
    return prevId;
  };

  const lastId = walk(steps, rootId);

  // Terminal ✓ node carrying the answer, off the last goal in the flow.
  if (finalAnswer && lastId) {
    const termId = nextId();
    nodes.push(`${termId}["${escapeLabel('✓ ' + finalAnswer)}"]`);
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
function labelForStep(step: TimelineStep): string {
  if (step.port === 'fail') {
    return `"${toCircledNumber(step.stepNumber)} ✗ fail"`;
  }

  const parts: string[] = [`${toCircledNumber(step.stepNumber)} ${escapeLabel(displayGoal(step))}`];

  const clauseRef = step.clause
    ? `${step.clause.body && step.clause.body !== 'true' ? 'clause' : 'fact'} ${step.clause.line}`
    : '';

  if (step.resultBindings && step.resultBindings.length > 0) {
    const bound = step.resultBindings.map(b => `${b.variable} = ${escapeLabel(b.value)}`).join(', ');
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
function displayGoal(step: TimelineStep): string {
  let goal = step.subgoalTemplate ?? step.goal;
  if (step.subgoalBindings) {
    for (const { variable, value } of step.subgoalBindings) {
      goal = goal.replace(new RegExp(`\\b${variable}\\b`, 'g'), value);
    }
  }
  return goal;
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
