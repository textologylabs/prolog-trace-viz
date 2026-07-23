/**
 * Query analysis - relates traced goals back to the query the user typed.
 *
 * The tracer reports goals with Prolog's internal variable names
 * ("likes(mary,_1102)"). Everything the user reads should instead speak in the
 * names from their own query ("likes(mary, X)"), which means matching each
 * top-level goal to the conjunct it came from.
 */

export interface QueryBinding {
  variable: string;
  value: string;
}

/**
 * Split a query into its top-level conjuncts.
 * "likes(mary, X), likes(john, X)" -> ["likes(mary, X)", "likes(john, X)"]
 */
export function splitConjuncts(query: string): string[] {
  const conjuncts: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of query.trim().replace(/\.\s*$/, '')) {
    if (char === '(' || char === '[') {
      depth++;
      current += char;
    } else if (char === ')' || char === ']') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      if (current.trim()) conjuncts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) conjuncts.push(current.trim());

  return conjuncts;
}

/**
 * Parse a `functor(arg, ...)` term. Returns null for anything else.
 */
export function parseTerm(term: string): { functor: string; args: string[] } | null {
  const match = term.trim().match(/^([a-z_][A-Za-z0-9_]*)\((.*)\)$/);
  if (!match) return null;
  return { functor: match[1], args: splitArguments(match[2]) };
}

/**
 * True for a Prolog variable - a source name (X, Result) or an internal one (_1102).
 */
export function isVariable(term: string): boolean {
  return /^[A-Z_][A-Za-z0-9_]*$/.test(term.trim());
}

/**
 * Find the conjunct a traced goal came from.
 *
 * Matches on functor and arity, then prefers the conjunct whose ground
 * arguments agree with the goal's - what distinguishes "likes(mary, X)" from
 * "likes(john, X)" when the goal is "likes(mary,_1102)".
 */
export function matchGoalToConjunct(goal: string, conjuncts: string[]): string | undefined {
  const goalTerm = parseTerm(goal);
  if (!goalTerm) return undefined;

  let best: { conjunct: string; score: number } | undefined;

  for (const conjunct of conjuncts) {
    const term = parseTerm(conjunct);
    if (!term) continue;
    if (term.functor !== goalTerm.functor) continue;
    if (term.args.length !== goalTerm.args.length) continue;

    let score = 0;
    let compatible = true;
    for (let i = 0; i < term.args.length; i++) {
      const conjunctArg = term.args[i].trim();
      const goalArg = goalTerm.args[i].trim();
      if (isVariable(conjunctArg) || isVariable(goalArg)) continue;
      if (conjunctArg === goalArg) {
        score++;
      } else {
        // A ground argument that disagrees rules this conjunct out.
        compatible = false;
        break;
      }
    }

    if (compatible && (!best || score > best.score)) {
      best = { conjunct, score };
    }
  }

  return best?.conjunct;
}

/**
 * Read the query variables' values out of a solved goal.
 *
 * Pairs the conjunct's arguments with the goal as it stood at EXIT:
 * "likes(mary, X)" + "likes(mary,wine)" -> X = wine.
 */
export function extractQueryBindings(conjunct: string, exitGoal: string): QueryBinding[] {
  const template = parseTerm(conjunct);
  const exit = parseTerm(exitGoal);
  if (!template || !exit) return [];
  if (template.functor !== exit.functor) return [];
  if (template.args.length !== exit.args.length) return [];

  const bindings: QueryBinding[] = [];
  for (let i = 0; i < template.args.length; i++) {
    const variable = template.args[i].trim();
    const value = exit.args[i].trim();
    if (!isVariable(variable) || variable === '_') continue;
    if (variable.startsWith('_')) continue; // anonymous / internal, not the user's name
    if (isVariable(value)) continue;         // still unbound
    bindings.push({ variable, value });
  }

  return bindings;
}

/**
 * Split an argument list, respecting nested brackets.
 */
export function splitArguments(argsStr: string): string[] {
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

  if (current.trim()) args.push(current.trim());

  return args;
}
