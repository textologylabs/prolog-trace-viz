/**
 * Timeline Formatter - Formats nested timeline steps into markdown
 * 
 * Renders a hierarchical view where child calls are visually nested inside their parents.
 * By default, uses clause variable names (X, Z, X1) instead of internal Prolog names (_2008).
 * With --debug:internal-vars, shows both: "Z (_2008) = value"
 */

import { TimelineStep, stepScope } from './timeline.js';
import { DebugFlag } from './cli.js';
import { LabelMode, LabelMap, Coloring, buildLabelMap, buildColoringBySolution, clauseCorefClasses, queryHeadLinks } from './coref.js';

export interface TimelineFormatterOptions {
  debugFlags?: Set<DebugFlag>;
  /** When > 1, insert a "Solution N" divider before each solution's first step. */
  solutionCount?: number;
  /** Variable-labeling mode. Requires `query` to take effect. */
  labelMode?: LabelMode;
  /** The original query — needed to scope the query's own variables. */
  query?: string;
  /** Coreference detail level: 0 off (default), 1 callout, 2 +colour, … */
  corefLevel?: number;
}

/**
 * When colour is active the formatter emits HTML (variable `<span>`s), so it
 * escapes text itself and the generator must not re-escape. Escapes the three
 * metacharacters significant inside a <pre>.
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** True if the formatter's output is already HTML-escaped (colour is active). */
export function timelineEmitsHtml(steps: TimelineStep[], options: TimelineFormatterOptions): boolean {
  return (options.corefLevel ?? 0) >= 2 && !!options.query && !!options.labelMode;
}

/**
 * A scope-aware relabeling function. `relabel(text, scope)` rewrites each
 * variable token in `text` to its display label within `scope`. When labeling
 * is inactive it is the identity function, guaranteeing byte-identical output.
 */
type Relabel = (text: string, scope: 'query' | number) => string;

const IDENTITY_RELABEL: Relabel = (text) => text;

/** Rendering context threaded through the formatter. */
interface FormatCtx {
  relabel: Relabel;
  labelMap: LabelMap | null;
  corefLevel: number;
  query: string;
}

const INERT_CTX: FormatCtx = { relabel: IDENTITY_RELABEL, labelMap: null, corefLevel: 0, query: '' };

// Match maximal identifiers so an underscore inside a lowercase atom
// (`sister_of`) is matched whole; `label` leaves non-variable tokens alone.
const VAR_TOKEN = /[A-Za-z_][A-Za-z0-9_]*/g;

/**
 * Build a factory that yields the rendering context for a given solution index.
 * Labeling is global (step-indexed `X@N`), but colour is confined to a single
 * solution — so the colour relabel is selected per solution. The relabel is the
 * identity (no-op, byte-identical output) in `source` mode or in `auto` mode
 * when no name is overloaded. When colour is active (--coref:2) relabel
 * additionally HTML-escapes and wraps each variable in a `<span>` for its
 * coreference class within that solution.
 */
function buildCtxFactory(steps: TimelineStep[], options: TimelineFormatterOptions): (solutionIndex: number) => FormatCtx {
  const mode = options.labelMode;
  const corefLevel = options.corefLevel ?? 0;
  const query = options.query ?? '';
  if (!mode || !query) {
    const ctx = { ...INERT_CTX, corefLevel, query };
    return () => ctx;
  }

  const map = buildLabelMap(steps, query, mode);

  // Colour layer: escape + span-wrap each variable by its coreference class,
  // using the colouring for the solution the step belongs to.
  if (corefLevel >= 2) {
    const bySolution = buildColoringBySolution(steps, query);
    const ctxCache = new Map<number, FormatCtx>();
    return (solutionIndex: number): FormatCtx => {
      const cached = ctxCache.get(solutionIndex);
      if (cached) return cached;
      const coloring: Coloring = bySolution.forSolution(solutionIndex);
      const relabel: Relabel = (text, scope) => {
        let out = '';
        let last = 0;
        for (const m of text.matchAll(VAR_TOKEN)) {
          out += escapeHtml(text.slice(last, m.index));
          const tok = m[0];
          const label = escapeHtml(map.label(tok, scope));
          const cid = coloring.classId(tok, scope);
          out += cid !== null ? `<span class="ptv-c${cid}">${label}</span>` : label;
          last = m.index + tok.length;
        }
        out += escapeHtml(text.slice(last));
        return out;
      };
      const ctx = { relabel, labelMap: map, corefLevel, query };
      ctxCache.set(solutionIndex, ctx);
      return ctx;
    };
  }

  const active = mode !== 'source' && (mode === 'full' || map.overloaded.size > 0);
  const relabel: Relabel = active
    ? (text, scope) => text.replace(VAR_TOKEN, (tok) => map.label(tok, scope))
    : IDENTITY_RELABEL;
  const ctx = { relabel, labelMap: map, corefLevel, query };
  return () => ctx;
}

/**
 * Check if a debug flag is enabled
 */
function hasDebugFlag(options: TimelineFormatterOptions, flag: DebugFlag): boolean {
  return options.debugFlags?.has(flag) ?? false;
}

/**
 * Format timeline steps into markdown with nested structure
 */
export function formatTimeline(steps: TimelineStep[], options: TimelineFormatterOptions = {}): string {
  const lines: string[] = [];
  const showDividers = (options.solutionCount ?? 1) > 1;
  let shownSolution: number | undefined;
  const ctxFor = buildCtxFactory(steps, options);

  for (const step of steps) {
    if (showDividers && step.solutionIndex !== undefined && step.solutionIndex !== shownSolution) {
      if (shownSolution !== undefined) lines.push('');
      lines.push(`──────── Solution ${step.solutionIndex} ────────`);
      lines.push('');
      shownSolution = step.solutionIndex;
    }
    // Root steps: the goal header shows the query's own variables. Colour is
    // scoped to this step's solution, so pick that solution's context.
    lines.push(...formatStepNested(step, 0, options, ctxFor(step.solutionIndex ?? 1), 'query'));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format a single timeline step with nesting support
 * @param step The step to format
 * @param depth Current nesting depth (0 = root level)
 * @param options Formatter options
 */
function formatStepNested(
  step: TimelineStep,
  depth: number,
  options: TimelineFormatterOptions,
  ctx: FormatCtx = INERT_CTX,
  parentScope: 'query' | number = 'query',
): string[] {
  const lines: string[] = [];
  const indent = '│  '.repeat(depth);
  const showInternalVars = hasDebugFlag(options, 'internal-vars');
  const relabel = ctx.relabel;
  // The goal header is written in the *caller's* variable names (query scope at
  // the root, the enclosing clause's scope in a child). The clause line,
  // unifications and subgoals are written in *this* step's clause scope.
  const goalScope: 'query' | number = depth === 0 ? 'query' : parentScope;
  const clauseScope: 'query' | number = stepScope(step);
  
  // Step header with box drawing. A retry keeps its REDO label after the
  // following EXIT merges the next solution into it — but an ancestor re-entry
  // never actually redid (it only re-EXITs as a consequence), so it wears no
  // REDO label.
  const portLabel = step.isAncestorReentry
    ? ''
    : step.isRetry
      ? 'REDO '
      : step.port === 'merged' ? '' : step.port.toUpperCase() + ' ';
  // subgoalLabel is like "[1.1]", strip brackets for cleaner display
  const subgoalMarker = step.subgoalLabel ? ` [Goal ${step.subgoalLabel.slice(1, -1)}]` : '';
  
  // Format goal display - use clause variable name for output arg if available.
  // Relabel the goal body in the caller's scope, but keep the port label
  // (REDO/CALL/FAIL) out of relabeling — those are uppercase tokens too.
  const goalDisplay = relabel(formatGoalDisplay(step, showInternalVars), goalScope);

  // Build goal display from subgoal template when available (avoids using raw
  // tracer goal which may have different internal variable names from a different frame)
  let fullGoalDisplay = `${portLabel}${goalDisplay}`;
  if (step.subgoalTemplate && (step.subgoalInstantiated || (step.subgoalBindings && step.subgoalBindings.length > 0))) {
    // Start from subgoalInstantiated (parent's internal vars) if available,
    // otherwise fall back to template. Then apply sibling bindings on top.
    let instantiated = step.subgoalInstantiated || step.subgoalTemplate;
    if (step.subgoalBindings) {
      for (const binding of step.subgoalBindings) {
        instantiated = instantiated.replace(new RegExp(`\\b${binding.variable}\\b`, 'g'), binding.value);
      }
    }
    // Clean internal vars: non-debug replaces with template names,
    // debug uses additive V(_NNN) notation for consistency
    instantiated = replaceInternalVarsFromTemplate(step.subgoalTemplate, instantiated, showInternalVars);
    const displayWithArrow = step.subgoalTemplate === instantiated ? step.subgoalTemplate : `${step.subgoalTemplate} → ${instantiated}`;
    fullGoalDisplay = `${portLabel}${relabel(displayWithArrow, goalScope)}`;
  }

  // An ancestor re-entry is not a genuine step (it reuses the number of the
  // instance it re-satisfies), so it wears no "Step N:" header — the
  // "Succeeds again (Step N re-satisfied)" line below names what re-solved.
  const stepHeader = step.isAncestorReentry
    ? `${indent}┌─ ${fullGoalDisplay}`
    : `${indent}┌─ Step ${step.stepNumber}${subgoalMarker}: ${fullGoalDisplay}`;
  lines.push(stepHeader);

  // Show binding context if we have bindings from sibling steps
  if (step.subgoalBindings && step.subgoalBindings.length > 0) {
    for (const binding of step.subgoalBindings) {
      lines.push(`${indent}│  where ${relabel(binding.variable, goalScope)} = ${relabel(binding.value, goalScope)} (from Step ${binding.fromStep})`);
    }
  }

  // Explain why execution came back to this goal.
  if (step.isAncestorReentry) {
    // Not a real backtrack — this goal only succeeds a second time because a
    // goal beneath it re-solved.
    const of = step.retryOfStep ? ` (Step ${step.retryOfStep} re-satisfied)` : '';
    lines.push(`${indent}│  Succeeds again${of} — a goal below it re-solved on backtracking`);
  } else if (step.isRetry) {
    const retryOf = step.retryOfStep ? `Retry of Step ${step.retryOfStep}` : 'Retry';
    // A failure triggered it (backtrackFromStep set) → name the binding it undid.
    // Otherwise it's enumeration asking the goal for its next solution.
    const reason = step.backtrackFromStep !== undefined && step.retryRejected?.length
      ? `${relabel(formatBindings(step.retryRejected), goalScope)} led to failure; undone, seeking another solution`
      : 'seeking another solution';
    lines.push(`${indent}│  ${retryOf} — ${reason}`);
  }

  // Format based on port type
  switch (step.port) {
    case 'call':
    case 'merged':
      // An ancestor re-entry just re-succeeds; re-printing its clause and
      // subgoals is noise (they didn't run again). Show only the re-success line
      // above, its re-solved child below, and the new result.
      if (!step.isAncestorReentry) {
        lines.push(...formatMergedContent(step, indent, showInternalVars, relabel, clauseScope));
      }
      break;
    case 'redo':
      if (!step.isRetry) {
        lines.push(`${indent}│  Backtracking...`);
      }
      break;
    case 'fail':
      lines.push(`${indent}│  Failure`);
      break;
  }

  // Coreference callout (--coref:1): name the identity classes for this clause
  // — the query↔head channel (root only) and the variables shared across goals.
  if (ctx.corefLevel >= 1 && ctx.labelMap && step.clause && !step.isAncestorReentry && (step.port === 'merged' || step.port === 'call')) {
    lines.push(...formatCorefCallout(step, depth, indent, ctx));
  }

  // Render children (nested inside this step). A child's goal header is written
  // in this step's clause scope, so pass stepNumber as the child's parentScope.
  if (step.children.length > 0) {
    lines.push(`${indent}│  `);
    for (const child of step.children) {
      lines.push(...formatStepNested(child, depth + 1, options, ctx, stepScope(step)));
    }
  }

  // Show result AFTER children (this is the key insight!)
  if (step.port === 'merged') {
    // Get the output variable name from clause if available, otherwise extract from goal
    const resultDisplay = relabel(formatResultDisplay(step, showInternalVars), goalScope);
    if (resultDisplay) {
      lines.push(`${indent}│  => ${resultDisplay}`);
    }

    // Show query variable state only on root-level steps (depth 0), and only
    // where we could not work out precisely what the goal bound - otherwise the
    // "=>" line above already says it, in the query's own variable names.
    if (depth === 0 && step.queryVarState && step.result && !step.resultBindings) {
      lines.push(`${indent}│  Query Variable: ${relabel(step.queryVarState, 'query')}`);
    }
  }
  
  lines.push(`${indent}└─`);
  
  return lines;
}

/**
 * Format the coreference callout for a clause application (--coref:1): the
 * query↔head identifications (root only) and the variables shared across the
 * clause's goals. Names are shown with their scope-correct labels.
 */
function formatCorefCallout(step: TimelineStep, depth: number, indent: string, ctx: FormatCtx): string[] {
  const map = ctx.labelMap!;
  const shared = clauseCorefClasses(step, map);
  const links = depth === 0 ? queryHeadLinks(ctx.query, step, map) : [];
  if (shared.length === 0 && links.length === 0) return [];

  const lines: string[] = [`${indent}│  Coreferences:`];
  for (const link of links) {
    lines.push(`${indent}│    ${link.queryVar} ≡ ${link.clauseVar}  (query ↔ clause)`);
  }
  for (const s of shared) {
    lines.push(`${indent}│    ${s.label} — shared by ${s.places.join(', ')}`);
  }
  return lines;
}

/**
 * Format the goal display, replacing internal variable names with clause variable names
 * When showInternalVars is true, shows both: "t(1+0+1, Z (_2008))"
 * 
 * Priority for variable names:
 * 1. subgoalTemplate (caller's variable name) - preferred for child steps
 * 2. clause head (matched clause's variable name) - fallback
 */
function formatGoalDisplay(step: TimelineStep, showInternalVars: boolean): string {
  // If we have clause info, try to use clause variable name for the output argument
  if (step.clause) {
    const goalMatch = step.goal.match(/^([^(]+)\((.+)\)$/);
    const headMatch = step.clause.head.match(/^([^(]+)\((.+)\)$/);
    
    // Also parse subgoalTemplate if available (caller's variable names)
    const templateMatch = step.subgoalTemplate?.match(/^([^(]+)\((.+)\)$/);
    const templateArgs = templateMatch ? splitArgs(templateMatch[2]) : null;
    
    if (goalMatch && headMatch) {
      const predicate = goalMatch[1];
      const goalArgs = splitArgs(goalMatch[2]);
      const headArgs = splitArgs(headMatch[2]);
      
      // Replace internal variable names with clause variable names where appropriate
      const displayArgs = goalArgs.map((arg, i) => {
        // If this is an internal variable (starts with _) and we have a clause arg
        if (isInternalVariable(arg) && i < headArgs.length) {
          // Prefer subgoalTemplate variable (caller's name) over clause head variable
          const displayVar = (templateArgs && i < templateArgs.length) 
            ? templateArgs[i] 
            : headArgs[i];
          
          if (showInternalVars) {
            // Additive: show both display var and internal var
            return `${displayVar}(${arg})`;
          }
          // Clean: just show display var
          return displayVar;
        }
        return arg;
      });
      
      return `${predicate}(${displayArgs.join(', ')})`;
    }
  }
  
  return step.goal;
}

/**
 * Format the result display line
 * When showInternalVars is true, shows both: "Z (_2008) = value"
 * 
 * Priority for variable names:
 * 1. subgoalTemplate (caller's variable name) - preferred for child steps
 * 2. clause head (matched clause's variable name) - fallback
 */
function formatResultDisplay(step: TimelineStep, showInternalVars: boolean): string {
  // Preferred: the bindings derived by comparing the CALL and EXIT goals. An
  // empty list means the goal bound nothing, so there is no result to show.
  if (step.resultBindings) {
    return formatBindings(step.resultBindings);
  }

  if (!step.result) return '';

  // Extract the last argument from the goal (typically the output - internal var)
  const goalMatch = step.goal.match(/^[^(]+\((.+)\)$/);
  const internalVar = goalMatch ? splitArgs(goalMatch[1]).pop() : null;
  
  // Get the display variable name - prefer subgoalTemplate over clause head
  let displayVar: string | null = null;

  // `is/2` goal: the result binds the LHS variable, e.g. template "Y1 is Y - X".
  if (step.subgoalTemplate) {
    const isMatch = step.subgoalTemplate.match(/^(.+?)\s+is\s+/);
    if (isMatch) {
      displayVar = isMatch[1].trim();
    }
  }

  // First try subgoalTemplate (caller's variable name)
  if (!displayVar && step.subgoalTemplate) {
    const templateMatch = step.subgoalTemplate.match(/^[^(]+\((.+)\)$/);
    if (templateMatch) {
      const templateArgs = splitArgs(templateMatch[1]);
      if (templateArgs.length > 0) {
        displayVar = templateArgs[templateArgs.length - 1];
      }
    }
  }
  
  // Fallback to clause head variable name
  if (!displayVar && step.clause) {
    const headMatch = step.clause.head.match(/^[^(]+\((.+)\)$/);
    if (headMatch) {
      const headArgs = splitArgs(headMatch[1]);
      if (headArgs.length > 0) {
        displayVar = headArgs[headArgs.length - 1];
      }
    }
  }
  
  if (displayVar) {
    if (showInternalVars && internalVar && isInternalVariable(internalVar)) {
      // Additive: show both
      return `${displayVar}(${internalVar}) = ${step.result}`;
    }
    // Clean: just display var
    return `${displayVar} = ${step.result}`;
  }
  
  // Fallback to internal var or ?
  return `${internalVar || '?'} = ${step.result}`;
}

/**
 * Render a list of bindings as "X = wine, Y = 3"
 */
function formatBindings(bindings: Array<{ variable: string; value: string }>): string {
  return bindings.map(b => `${b.variable} = ${b.value}`).join(', ');
}

/**
 * Check if a term is an internal Prolog variable (starts with _)
 */
function isInternalVariable(term: string): boolean {
  return /^_\d+$/.test(term.trim());
}

/**
 * Split arguments respecting nested brackets
 */
function splitArgs(argsStr: string): string[] {
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
 * Format merged CALL/EXIT step content (before children)
 */
function formatMergedContent(
  step: TimelineStep,
  indent: string,
  showInternal: boolean,
  relabel: Relabel = IDENTITY_RELABEL,
  scope: 'query' | number = step.stepNumber,
): string[] {
  const lines: string[] = [];

  if (step.clause) {
    const clauseLabel = step.clause.body && step.clause.body !== 'true' ? 'Clause' : 'Fact';
    lines.push(`${indent}│  ${clauseLabel}: ${relabel(step.clause.head, scope)} [line ${step.clause.line}]`);

    // Show unifications if any - filter out internal variable bindings unless showInternal
    if (step.unifications.length > 0) {
      const displayUnifications = showInternal
        ? step.unifications
        : step.unifications.filter(u => !isInternalVariable(u.value));

      if (displayUnifications.length > 0) {
        lines.push(`${indent}│  Unifications:`);
        for (const unif of displayUnifications) {
          lines.push(`${indent}│    ${relabel(unif.variable, scope)} = ${relabel(unif.value, scope)}`);
        }
      }
    }

    // Show spawned subgoals (these will be solved by children)
    // Clean up internal variables in subgoal display unless showInternal
    if (step.subgoals.length > 0) {
      lines.push(`${indent}│  Subgoals:`);
      for (const subgoal of step.subgoals) {
        const cleanedGoal = showInternal ? subgoal.goal : cleanInternalVarsFromSubgoal(subgoal.goal);
        lines.push(`${indent}│    ${subgoal.label} ${relabel(cleanedGoal, scope)}`);
      }
    }
  }

  return lines;
}

/**
 * Replace internal variable names (_NNN) in a string with corresponding names
 * from a template string.
 *
 * The mapping is built by aligning the two terms *structurally* (functor by
 * functor, argument by argument) rather than by counting variable tokens
 * positionally. Positional counting breaks whenever a template variable was
 * instantiated to a constant: e.g. template `gcd(X, Y1, D)` vs instantiated
 * `gcd(10, Y1, _3302)` — `X` became `10` (no longer a variable token), so a
 * token-counting walk would map `_3302` to `Y1` instead of `D`.
 *
 * Works for predicate(args), `is/2` expressions, and arithmetic operators.
 */
function replaceInternalVarsFromTemplate(template: string, instantiated: string, additive: boolean = false): string {
  if (!/_\d+/.test(instantiated)) return instantiated;

  const map = new Map<string, string>();
  buildInternalVarMap(template, instantiated, map);

  let result = instantiated;
  for (const [internalVar, displayVar] of map) {
    const replacement = additive ? `${displayVar}(${internalVar})` : displayVar;
    result = result.replace(new RegExp(`\\b${internalVar}\\b`, 'g'), replacement);
  }

  return result;
}

/**
 * Recursively align a template term with its instantiated form, recording a
 * mapping from each internal variable (_NNN) found in the instantiated term to
 * the meaningful name at the structurally-corresponding position in template.
 */
function buildInternalVarMap(template: string, instantiated: string, map: Map<string, string>): void {
  template = template.trim();
  instantiated = instantiated.trim();

  // Leaf: an internal variable maps to whatever the template has here.
  if (isInternalVariable(instantiated)) {
    if (template && !isInternalVariable(template)) {
      map.set(instantiated, template);
    }
    return;
  }

  // predicate(args) decomposition
  const tPred = parsePredicateTerm(template);
  const iPred = parsePredicateTerm(instantiated);
  if (tPred && iPred && tPred.functor === iPred.functor && tPred.args.length === iPred.args.length) {
    for (let i = 0; i < tPred.args.length; i++) {
      buildInternalVarMap(tPred.args[i], iPred.args[i], map);
    }
    return;
  }

  // `is/2` decomposition (X is Expr)
  const tIs = splitTopLevelIs(template);
  const iIs = splitTopLevelIs(instantiated);
  if (tIs && iIs) {
    buildInternalVarMap(tIs.lhs, iIs.lhs, map);
    buildInternalVarMap(tIs.rhs, iIs.rhs, map);
    return;
  }

  // arithmetic operator decomposition
  const tOp = findBinaryOperator(template);
  const iOp = findBinaryOperator(instantiated);
  if (tOp && iOp && tOp.op === iOp.op) {
    buildInternalVarMap(tOp.left, iOp.left, map);
    buildInternalVarMap(tOp.right, iOp.right, map);
  }
}

/** Parse a `functor(args...)` term. Returns null if not a compound term. */
function parsePredicateTerm(term: string): { functor: string; args: string[] } | null {
  const match = term.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.+)\)$/);
  if (!match) return null;
  return { functor: match[1], args: splitArgs(match[2]) };
}

/** Split a term on a top-level (depth-0) ` is ` operator. */
function splitTopLevelIs(term: string): { lhs: string; rhs: string } | null {
  let depth = 0;
  for (let i = 0; i < term.length - 3; i++) {
    const ch = term[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (depth === 0 && term.startsWith(' is ', i)) {
      return { lhs: term.slice(0, i).trim(), rhs: term.slice(i + 4).trim() };
    }
  }
  return null;
}

/** Find a top-level binary arithmetic operator (rightmost wins, like findOperator). */
function findBinaryOperator(term: string): { op: string; left: string; right: string } | null {
  const operators = ['+', '-', '*', '/'];
  let depth = 0;
  for (let i = term.length - 1; i >= 0; i--) {
    const ch = term[i];
    if (ch === ')' || ch === ']') depth++;
    else if (ch === '(' || ch === '[') depth--;
    else if (depth === 0 && operators.includes(ch) && i > 0) {
      return { op: ch, left: term.slice(0, i).trim(), right: term.slice(i + 1).trim() };
    }
  }
  return null;
}

/**
 * Clean internal variable names from subgoal display
 * e.g., "t(X1+1, Z) → t(X1+1, _2008)" becomes "t(X1+1, Z)"
 * e.g., "N is N1 + 1 → _1604 is N1 + 1" becomes "N is N1 + 1"
 */
function cleanInternalVarsFromSubgoal(subgoalDisplay: string): string {
  const arrowIndex = subgoalDisplay.indexOf(' → ');
  if (arrowIndex === -1) {
    return subgoalDisplay;
  }

  const template = subgoalDisplay.slice(0, arrowIndex);
  const instantiated = subgoalDisplay.slice(arrowIndex + 3);

  const cleaned = replaceInternalVarsFromTemplate(template, instantiated);

  // If template and cleaned are the same, just show template
  if (template === cleaned) {
    return template;
  }

  return `${template} → ${cleaned}`;
}
