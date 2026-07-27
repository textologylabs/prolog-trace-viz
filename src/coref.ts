/**
 * Coreference & variable-labeling model.
 *
 * The trace already resolves each clause application to its *source* clause, so
 * a step's `clause.head`/`clause.body` carry the real variable names the user
 * wrote (`sister_of(X, Y) :- female(X), parents(X, M, F), parents(Y, M, F)`).
 * That means "which variables are the same variable" is a *static* question we
 * can answer from source structure + the query + step numbers — no need for
 * stable runtime variable ids (which Prolog renumbers per frame anyway).
 *
 * This module identifies the distinct *logical* variables in a trace and,
 * where a single surface name denotes more than one of them (the query's `X`
 * vs a clause's `X`, or `N` recurring across recursive clause instances),
 * disambiguates them with step-indexed labels like `X@2`.
 */
import { TimelineStep } from './timeline.js';
import { extractQueryVariables, parseTerm, splitConjuncts, isVariable } from './query.js';

/** How variable names are displayed. */
export type LabelMode = 'auto' | 'source' | 'full';

/**
 * A distinct logical variable occurring in the trace. Its scope is either the
 * query itself or a specific clause instance, keyed by the step number at which
 * that clause was entered — recursion re-enters the same clause at different
 * steps, giving genuinely different logical variables that share a name.
 */
export interface LogicalVar {
  name: string;              // source surface name, e.g. "X"
  scope: 'query' | number;   // 'query', or the step number of the clause instance
}

/** A resolved label lookup for the whole trace. */
export interface LabelMap {
  /** Display label for a variable name within a given scope. */
  label(name: string, scope: 'query' | number): string;
  /** Surface names that denote more than one logical variable. */
  overloaded: Set<string>;
}

const ANON = '_';

/**
 * Extract distinct Prolog variable names from a term/clause string, in order of
 * first appearance. Variables start with an uppercase letter or underscore.
 * The bare anonymous variable `_` is excluded (each `_` is its own variable and
 * never co-refers). Atoms (lowercase-initial) and numbers are ignored.
 *
 * This is a lexical scan tuned for the simple source clauses these traces come
 * from; it does not attempt to skip variable-like text inside quoted atoms.
 */
export function extractVarNames(text: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  // Match *maximal* identifiers so an underscore inside a lowercase atom
  // (`sister_of`) is never mistaken for the variable `_of`.
  const re = /[A-Za-z_][A-Za-z0-9_]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const tok = m[0];
    if (!isVarName(tok)) continue;
    if (!seen.has(tok)) {
      seen.add(tok);
      names.push(tok);
    }
  }
  return names;
}

/**
 * True if a token is a Prolog *source* variable: uppercase- or
 * underscore-initial, not the bare anonymous `_`, and not a tracer-internal
 * variable like `_1150` (those belong to other rendering layers).
 */
function isVarName(tok: string): boolean {
  if (tok === ANON) return false;
  if (/^_\d+$/.test(tok)) return false;
  return /^[A-Z_]/.test(tok);
}

/** Flatten a nested step tree into a pre-order list. */
function flatten(steps: TimelineStep[]): TimelineStep[] {
  const out: TimelineStep[] = [];
  const walk = (s: TimelineStep) => {
    out.push(s);
    s.children.forEach(walk);
  };
  steps.forEach(walk);
  return out;
}

/**
 * Collect every distinct logical variable in the trace: the query's variables,
 * plus the variables of each clause instance (scoped to the step that entered
 * the clause). A clause instance's variables live in its `clause.head`/`body`.
 */
export function collectLogicalVars(steps: TimelineStep[], query: string): LogicalVar[] {
  const vars: LogicalVar[] = [];
  const push = (name: string, scope: 'query' | number) => {
    if (!vars.some(v => v.name === name && v.scope === scope)) {
      vars.push({ name, scope });
    }
  };

  for (const name of extractQueryVariables(query)) {
    push(name, 'query');
  }

  for (const step of flatten(steps)) {
    if (!step.clause) continue;
    const text = `${step.clause.head} ${step.clause.body ?? ''}`;
    for (const name of extractVarNames(text)) {
      push(name, step.stepNumber);
    }
  }

  return vars;
}

/**
 * Assign display labels to logical variables.
 *
 * - `source`: never disambiguate — every occurrence shows its source name.
 * - `full`:   always tag clause-instance variables with `@<step>` (the query's
 *             own variables stay as written); demonstrates that Prolog
 *             standardizes clause variables apart on every call.
 * - `auto`:   disambiguate only names that denote more than one logical
 *             variable. The query occurrence (if any) keeps the bare name;
 *             clause-instance occurrences get `@<step>`. If the collision is
 *             purely between clause instances (recursion), all get `@<step>`.
 */
export function computeLabels(vars: LogicalVar[], mode: LabelMode): LabelMap {
  const byName = new Map<string, LogicalVar[]>();
  for (const v of vars) {
    const list = byName.get(v.name) ?? [];
    list.push(v);
    byName.set(v.name, list);
  }

  const known = new Set(byName.keys());
  const overloaded = new Set<string>();
  for (const [name, list] of byName) {
    if (list.length > 1) overloaded.add(name);
  }

  const tag = (name: string, scope: 'query' | number) =>
    scope === 'query' ? name : `${name}@${scope}`;

  const label = (name: string, scope: 'query' | number): string => {
    // Unknown token (an atom, a tracer-internal var, anything not collected as a
    // source variable) is never a variable we should relabel — leave it alone.
    if (!known.has(name)) return name;
    if (mode === 'source') return name;
    if (mode === 'full') return scope === 'query' ? name : `${name}@${scope}`;
    // auto
    if (!overloaded.has(name)) return name;
    // Overloaded: keep the query occurrence bare, tag clause instances. If no
    // query occurrence exists, every instance is tagged.
    return tag(name, scope);
  };

  return { label, overloaded };
}

/** Convenience: build the label map for a trace in one call. */
export function buildLabelMap(steps: TimelineStep[], query: string, mode: LabelMode): LabelMap {
  return computeLabels(collectLogicalVars(steps, query), mode);
}

// ---------------------------------------------------------------------------
// Coreference callout (--coref:1)
// ---------------------------------------------------------------------------

/** A variable that appears in more than one place within a clause. */
export interface SharedVar {
  /** Display label within the clause scope, e.g. "M" or "X@1". */
  label: string;
  /** Where it occurs: "head" and/or subgoal labels like "[1.2]". */
  places: string[];
}

/** A query variable identified with a clause variable via head unification. */
export interface QueryLink {
  /** The query's variable (query scope), e.g. "X". */
  queryVar: string;
  /** The clause head variable it unifies with (clause scope), e.g. "Y". */
  clauseVar: string;
}

/** Strip a subgoal's " → instantiated" tail, leaving the source template. */
function subgoalTemplate(goal: string): string {
  const i = goal.indexOf(' → ');
  return i === -1 ? goal : goal.slice(0, i);
}

/**
 * The shared-variable coreference classes within a clause application: each
 * variable that occurs in more than one goal (head or a body subgoal). These
 * are the "plumbing" of the clause — e.g. `M`/`F` shared by the two `parents`
 * subgoals is what makes the rule mean "same parents".
 */
export function clauseCorefClasses(step: TimelineStep, labelMap: LabelMap): SharedVar[] {
  if (!step.clause) return [];
  const scope = step.stepNumber;
  const places = new Map<string, string[]>();
  const add = (name: string, place: string) => {
    const arr = places.get(name) ?? [];
    if (!arr.includes(place)) arr.push(place);
    places.set(name, arr);
  };

  for (const name of extractVarNames(step.clause.head)) add(name, 'head');
  for (const sg of step.subgoals) {
    for (const name of extractVarNames(subgoalTemplate(sg.goal))) add(name, sg.label);
  }

  const shared: SharedVar[] = [];
  for (const [name, pls] of places) {
    if (pls.length >= 2) shared.push({ label: labelMap.label(name, scope), places: pls });
  }
  return shared;
}

/**
 * The query↔clause identifications made when the query goal unifies with the
 * clause head: for each argument position where the query has a variable, that
 * variable co-refers with the head variable at the same position. This is the
 * channel a solution travels back through (query `X` ≡ clause `Y`).
 */
export function queryHeadLinks(query: string, step: TimelineStep, labelMap: LabelMap): QueryLink[] {
  if (!step.clause) return [];
  const head = parseTerm(step.clause.head);
  if (!head) return [];

  const conjunct = splitConjuncts(query)
    .map(c => parseTerm(c))
    .find(t => t !== null && t.functor === head.functor && t.args.length === head.args.length);
  if (!conjunct) return [];

  const links: QueryLink[] = [];
  for (let i = 0; i < head.args.length; i++) {
    const qArg = conjunct.args[i];
    const hArg = head.args[i];
    if (isVariable(qArg) && isVariable(hArg)) {
      links.push({
        queryVar: labelMap.label(qArg, 'query'),
        clauseVar: labelMap.label(hArg, step.stepNumber),
      });
    }
  }
  return links;
}
