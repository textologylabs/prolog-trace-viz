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
import { extractQueryVariables } from './query.js';

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
  const re = /[A-Z_][A-Za-z0-9_]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const tok = m[0];
    if (tok === ANON) continue;         // anonymous — never co-refers
    if (!seen.has(tok)) {
      seen.add(tok);
      names.push(tok);
    }
  }
  return names;
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

  const overloaded = new Set<string>();
  for (const [name, list] of byName) {
    if (list.length > 1) overloaded.add(name);
  }

  const tag = (name: string, scope: 'query' | number) =>
    scope === 'query' ? name : `${name}@${scope}`;

  const label = (name: string, scope: 'query' | number): string => {
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
