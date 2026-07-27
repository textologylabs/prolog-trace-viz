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
import { TimelineStep, stepScope } from './timeline.js';
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
      push(name, stepScope(step));
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
  const scope = stepScope(step);
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
        clauseVar: labelMap.label(hArg, stepScope(step)),
      });
    }
  }
  return links;
}

// ---------------------------------------------------------------------------
// Coreference colouring (--coref:2)
// ---------------------------------------------------------------------------

/**
 * Categorical palette (skill-validated for both light and dark surfaces; first
 * six hues, worst-pair CVD ΔE ≥ 9). Colour is always secondary here — every
 * coloured token also shows its name — so the low-contrast light slots are
 * covered by the relief rule.
 */
const PALETTE_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const PALETTE_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'];

/** A coreference-class colouring over the trace's logical variables. */
export interface Coloring {
  /** Colour-class index (0-based) for a variable, or null if uncoloured. */
  classId(name: string, scope: 'query' | number): number | null;
  /** The `<style>` block defining the used colour classes, theme-aware. */
  css(): string;
  /** True if some coreference classes were left uncoloured (palette exhausted). */
  capped: boolean;
  /** How many palette colours this coloring uses. */
  usedCount: number;
}

/** The palette classes' <style> block for the first `n` colours, theme-aware. */
function paletteCss(n: number): string {
  const light = Array.from({ length: n }, (_, i) => `.ptv-c${i}{color:${PALETTE_LIGHT[i]}}`).join('');
  const dark = Array.from({ length: n }, (_, i) => `.ptv-c${i}{color:${PALETTE_DARK[i]}}`).join('');
  return `<style>\n${light}\n@media (prefers-color-scheme: dark){${dark}}\n</style>`;
}

const varKey = (name: string, scope: 'query' | number) => `${name}@@${scope}`;
const appearanceRank = (scope: 'query' | number) => (scope === 'query' ? 0 : scope);

/**
 * Build the coreference-class colouring: union variables that Prolog identifies
 * through unification (query↔head at the root, caller-subgoal↔callee-head down
 * the call tree), then give each *interesting* class a palette colour so every
 * occurrence of a co-referring variable shares a hue. A class is interesting if
 * it spans more than one variable (cross-scope coreference) or its variable is
 * shared across a clause's goals. Classes are coloured in first-appearance
 * order; once the palette is exhausted the rest stay uncoloured (never cycled).
 */
export function buildColoring(steps: TimelineStep[], query: string): Coloring {
  const nodes = collectLogicalVars(steps, query);

  // Union-find over variable keys.
  const parent = new Map<string, string>();
  const ensure = (k: string) => { if (!parent.has(k)) parent.set(k, k); };
  const find = (k: string): string => {
    ensure(k);
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(k) !== root) { const next = parent.get(k)!; parent.set(k, root); k = next; }
    return root;
  };
  const union = (a: string, b: string) => { parent.set(find(a), find(b)); };

  for (const n of nodes) ensure(varKey(n.name, n.scope));

  // Edge: query variable ≡ head variable (positional) at each root step.
  for (const root of steps) {
    if (!root.clause) continue;
    const head = parseTerm(root.clause.head);
    if (!head) continue;
    const conj = splitConjuncts(query).map(c => parseTerm(c))
      .find(t => t !== null && t.functor === head.functor && t.args.length === head.args.length);
    if (!conj) continue;
    for (let i = 0; i < head.args.length; i++) {
      if (isVariable(conj.args[i]) && isVariable(head.args[i])) {
        union(varKey(conj.args[i], 'query'), varKey(head.args[i], stepScope(root)));
      }
    }
  }

  // Edge: caller subgoal argument ≡ callee head argument (positional), walking
  // the call tree with each child's parent scope.
  const walk = (step: TimelineStep) => {
    for (const child of step.children) {
      if (child.subgoalTemplate && child.clause) {
        const caller = parseTerm(child.subgoalTemplate);
        const callee = parseTerm(child.clause.head);
        if (caller && callee && caller.args.length === callee.args.length) {
          for (let i = 0; i < caller.args.length; i++) {
            if (isVariable(caller.args[i]) && isVariable(callee.args[i])) {
              union(varKey(caller.args[i], stepScope(step)), varKey(callee.args[i], stepScope(child)));
            }
          }
        }
      }
      walk(child);
    }
  };
  steps.forEach(walk);

  // Variables shared across ≥2 goals within a clause (intra-clause coreference).
  const shared = new Set<string>();
  for (const step of flatten(steps)) {
    if (!step.clause) continue;
    const places = new Map<string, number>();
    const bump = (name: string) => places.set(name, (places.get(name) ?? 0) + 1);
    // head is one place; each subgoal another
    for (const name of new Set(extractVarNames(step.clause.head))) bump(name);
    for (const sg of step.subgoals) {
      const tmpl = sg.goal.indexOf(' → ') >= 0 ? sg.goal.slice(0, sg.goal.indexOf(' → ')) : sg.goal;
      for (const name of new Set(extractVarNames(tmpl))) bump(name);
    }
    for (const [name, count] of places) {
      if (count >= 2) shared.add(varKey(name, stepScope(step)));
    }
  }

  // Group into components; pick the interesting ones and order by first appearance.
  const members = new Map<string, LogicalVar[]>();
  for (const n of nodes) {
    const r = find(varKey(n.name, n.scope));
    (members.get(r) ?? members.set(r, []).get(r)!).push(n);
  }
  const interesting = [...members.values()].filter(ms =>
    ms.length >= 2 || ms.some(m => shared.has(varKey(m.name, m.scope)))
  );
  interesting.sort((a, b) =>
    Math.min(...a.map(m => appearanceRank(m.scope))) - Math.min(...b.map(m => appearanceRank(m.scope)))
  );

  const colourOf = new Map<string, number>();
  interesting.forEach((ms, i) => {
    if (i < PALETTE_LIGHT.length) {
      for (const m of ms) colourOf.set(varKey(m.name, m.scope), i);
    }
  });
  const capped = interesting.length > PALETTE_LIGHT.length;
  const usedCount = Math.min(interesting.length, PALETTE_LIGHT.length);

  return {
    classId: (name, scope) => colourOf.get(varKey(name, scope)) ?? null,
    capped,
    usedCount,
    css: () => paletteCss(usedCount),
  };
}

/** A per-solution colouring: coreference classes are confined to one proof. */
export interface SolutionColoring {
  /** The colouring for a given solution index (1-based). */
  forSolution(index: number): Coloring;
  /** Aggregate `<style>` block covering every solution's used colours. */
  css(): string;
  /** True if any solution left coreference classes uncoloured. */
  capped: boolean;
}

/**
 * Build coreference colourings **per solution**. Each solution is a separate
 * proof, so colour-linking is confined to it — the query variable does not
 * bridge one solution's clause variables to another's. The palette resets per
 * solution (small-multiple style); the `──── Solution N ────` dividers keep the
 * passes visually separate.
 */
export function buildColoringBySolution(steps: TimelineStep[], query: string): SolutionColoring {
  const groups = new Map<number, TimelineStep[]>();
  for (const s of steps) {
    const idx = s.solutionIndex ?? 1;
    (groups.get(idx) ?? groups.set(idx, []).get(idx)!).push(s);
  }

  const bySolution = new Map<number, Coloring>();
  for (const [idx, group] of groups) bySolution.set(idx, buildColoring(group, query));

  const empty = buildColoring([], query);
  let maxUsed = 0;
  let capped = false;
  for (const c of bySolution.values()) {
    maxUsed = Math.max(maxUsed, c.usedCount);
    capped = capped || c.capped;
  }

  return {
    forSolution: (idx) => bySolution.get(idx) ?? bySolution.get(1) ?? empty,
    capped,
    css: () => paletteCss(maxUsed),
  };
}

// ---------------------------------------------------------------------------
// Binding-environment panel (--coref:3)
// ---------------------------------------------------------------------------

/** One row of the binding-environment table: a coreference class and its value. */
export interface BindingRow {
  /** Colour class id, or null if uncoloured. */
  colourId: number | null;
  /** Labeled variables in this coreference class, e.g. ["X", "Y"]. */
  labels: string[];
  /** The value the class resolved to. */
  value: string;
  /** The step at which that value was established. */
  whereStep: number;
}

const isInternalValue = (v: string) => /^_\d+$/.test(v.trim());

/**
 * Build the substitution trail: harvest each logical variable's value from the
 * trace (clause-head unifications in clause scope; results and sibling bindings
 * in the caller's scope), then group by coreference class so co-referring
 * variables share one row. Unbound variables are omitted.
 */
export function buildBindingEnvironment(
  steps: TimelineStep[],
  query: string,
  labelMap: LabelMap,
  coloring: Coloring,
): BindingRow[] {
  const values = new Map<string, { value: string; step: number }>();
  const setVal = (name: string, scope: 'query' | number, value: string, step: number) => {
    if (!isInternalValue(value)) values.set(varKey(name, scope), { value, step });
  };

  const walk = (step: TimelineStep, parentScope: 'query' | number, isRoot: boolean) => {
    const goalScope: 'query' | number = isRoot ? 'query' : parentScope;
    for (const u of step.unifications) setVal(u.variable, stepScope(step), u.value, step.stepNumber);
    for (const b of step.resultBindings ?? []) setVal(b.variable, goalScope, b.value, step.stepNumber);
    for (const b of step.subgoalBindings ?? []) setVal(b.variable, goalScope, b.value, b.fromStep);
    for (const c of step.children) walk(c, stepScope(step), false);
  };
  steps.forEach(s => walk(s, 'query', true));

  // Group logical variables by coreference class (colour), keeping uncoloured
  // ones as singletons.
  const groups = new Map<string, LogicalVar[]>();
  for (const n of collectLogicalVars(steps, query)) {
    const cid = coloring.classId(n.name, n.scope);
    const gkey = cid !== null ? `c${cid}` : `s:${varKey(n.name, n.scope)}`;
    (groups.get(gkey) ?? groups.set(gkey, []).get(gkey)!).push(n);
  }

  const rows: BindingRow[] = [];
  for (const ms of groups.values()) {
    let found: { value: string; step: number } | undefined;
    for (const m of ms) {
      const v = values.get(varKey(m.name, m.scope));
      if (v) { found = v; break; }
    }
    if (!found) continue; // unbound — omit
    const labels = [...new Set(ms.map(m => labelMap.label(m.name, m.scope)))];
    rows.push({ colourId: coloring.classId(ms[0].name, ms[0].scope), labels, value: found.value, whereStep: found.step });
  }

  rows.sort((a, b) => a.whereStep - b.whereStep || (a.colourId ?? 99) - (b.colourId ?? 99));
  return rows;
}
