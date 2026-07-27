import { describe, it, expect } from 'vitest';
import {
  extractVarNames,
  collectLogicalVars,
  computeLabels,
  buildLabelMap,
  clauseCorefClasses,
  queryHeadLinks,
  buildColoring,
  buildBindingEnvironment,
  LogicalVar,
} from './coref.js';
import { TimelineStep } from './timeline.js';

/** Minimal TimelineStep factory for tests. */
function step(
  stepNumber: number,
  head: string,
  body: string,
  children: TimelineStep[] = [],
  subgoals: Array<{ label: string; goal: string }> = [],
): TimelineStep {
  return {
    stepNumber,
    port: 'merged',
    level: 1,
    goal: head,
    clause: { head, body, line: stepNumber },
    unifications: [],
    subgoals,
    children,
  };
}

/** The sister_of clause step, with its body decomposed into labeled subgoals. */
function sisterStep(): TimelineStep {
  return step(1, 'sister_of(X, Y)', 'female(X), parents(X, M, F), parents(Y, M, F)', [], [
    { label: '[1.1]', goal: 'female(X)' },
    { label: '[1.2]', goal: 'parents(X, M, F)' },
    { label: '[1.3]', goal: 'parents(Y, M, F)' },
  ]);
}

describe('extractVarNames', () => {
  it('extracts distinct variables in order, skipping atoms and numbers', () => {
    expect(extractVarNames('female(X), parents(X, M, F), parents(Y, M, F)'))
      .toEqual(['X', 'M', 'F', 'Y']);
  });

  it('excludes the anonymous variable _', () => {
    expect(extractVarNames('member(X, [X|_])')).toEqual(['X']);
  });

  it('keeps named underscore variables', () => {
    expect(extractVarNames('foo(_Rest, X)')).toEqual(['_Rest', 'X']);
  });

  it('returns nothing for a ground term', () => {
    expect(extractVarNames('parents(alice, victoria, albert)')).toEqual([]);
  });

  it('does not mistake an underscore inside a lowercase atom for a variable', () => {
    // Regression: `sister_of` must not yield the phantom variable `_of`.
    expect(extractVarNames('sister_of(X, Y)')).toEqual(['X', 'Y']);
    expect(extractVarNames('is_list(L)')).toEqual(['L']);
  });

  it('ignores tracer-internal variables like _1150', () => {
    expect(extractVarNames('sister_of(alice, _1150)')).toEqual([]);
  });
});

describe('collectLogicalVars', () => {
  it('collects query variables and per-step clause variables', () => {
    const steps = [
      step(1, 'sister_of(X, Y)', 'female(X), parents(X, M, F), parents(Y, M, F)'),
    ];
    const vars = collectLogicalVars(steps, 'sister_of(alice, X)');
    // query X (scope 'query'), plus clause X,Y,M,F at scope 1
    expect(vars).toContainEqual({ name: 'X', scope: 'query' });
    expect(vars).toContainEqual({ name: 'X', scope: 1 });
    expect(vars).toContainEqual({ name: 'Y', scope: 1 });
    expect(vars).toContainEqual({ name: 'M', scope: 1 });
    expect(vars).toContainEqual({ name: 'F', scope: 1 });
  });

  it('treats a recursive clause re-entry as a distinct scope', () => {
    const steps = [
      step(1, 'fact(N, F)', 'N > 0, N1 is N - 1, fact(N1, F1), F is N * F1'),
      step(2, 'fact(N, F)', 'N > 0, N1 is N - 1, fact(N1, F1), F is N * F1'),
    ];
    const vars = collectLogicalVars(steps, 'fact(3, X)');
    expect(vars).toContainEqual({ name: 'N', scope: 1 });
    expect(vars).toContainEqual({ name: 'N', scope: 2 });
  });
});

describe('computeLabels', () => {
  const vars: LogicalVar[] = [
    { name: 'X', scope: 'query' },
    { name: 'X', scope: 1 },     // false friend: clause X ≠ query X
    { name: 'Y', scope: 1 },
    { name: 'M', scope: 1 },
  ];

  it('auto: disambiguates only overloaded names', () => {
    const { label, overloaded } = computeLabels(vars, 'auto');
    expect(overloaded.has('X')).toBe(true);
    expect(overloaded.has('Y')).toBe(false);
    // Overloaded X: query bare, clause instance tagged.
    expect(label('X', 'query')).toBe('X');
    expect(label('X', 1)).toBe('X@1');
    // Non-overloaded names stay clean.
    expect(label('Y', 1)).toBe('Y');
    expect(label('M', 1)).toBe('M');
  });

  it('auto: recursion collision tags every clause instance', () => {
    const rec: LogicalVar[] = [
      { name: 'N', scope: 1 },
      { name: 'N', scope: 2 },
    ];
    const { label } = computeLabels(rec, 'auto');
    expect(label('N', 1)).toBe('N@1');
    expect(label('N', 2)).toBe('N@2');
  });

  it('source: never disambiguates', () => {
    const { label } = computeLabels(vars, 'source');
    expect(label('X', 'query')).toBe('X');
    expect(label('X', 1)).toBe('X');
  });

  it('full: always tags clause instances, query stays bare', () => {
    const { label } = computeLabels(vars, 'full');
    expect(label('X', 'query')).toBe('X');
    expect(label('X', 1)).toBe('X@1');
    expect(label('Y', 1)).toBe('Y@1');   // tagged even though not overloaded
    expect(label('M', 1)).toBe('M@1');
  });
});

describe('clauseCorefClasses', () => {
  it('finds variables shared across a clause\'s goals, with labels', () => {
    const s = sisterStep();
    const map = buildLabelMap([s], 'sister_of(alice, X)', 'auto');
    const byLabel = Object.fromEntries(clauseCorefClasses(s, map).map(v => [v.label, v.places]));
    expect(byLabel['X@1']).toEqual(['head', '[1.1]', '[1.2]']); // clause X, tagged
    expect(byLabel['Y']).toEqual(['head', '[1.3]']);
    expect(byLabel['M']).toEqual(['[1.2]', '[1.3]']);            // same mother
    expect(byLabel['F']).toEqual(['[1.2]', '[1.3]']);            // same father
  });

  it('omits variables that occur in only one place', () => {
    const s = step(1, 'p(X)', 'q(X), r(Y)', [], [
      { label: '[1.1]', goal: 'q(X)' },
      { label: '[1.2]', goal: 'r(Y)' },
    ]);
    const map = buildLabelMap([s], 'p(a)', 'auto');
    const labels = clauseCorefClasses(s, map).map(v => v.label);
    expect(labels).toContain('X');   // head + [1.1]
    expect(labels).not.toContain('Y'); // only [1.2]
  });
});

describe('queryHeadLinks', () => {
  it('identifies query variables with head variables positionally', () => {
    const s = sisterStep();
    const map = buildLabelMap([s], 'sister_of(alice, X)', 'auto');
    // query arg2 X ≡ head arg2 Y; arg1 is the ground atom alice, no link.
    expect(queryHeadLinks('sister_of(alice, X)', s, map)).toEqual([{ queryVar: 'X', clauseVar: 'Y' }]);
  });

  it('returns no links when the query argument is ground', () => {
    const s = sisterStep();
    const map = buildLabelMap([s], 'sister_of(alice, edward)', 'auto');
    expect(queryHeadLinks('sister_of(alice, edward)', s, map)).toEqual([]);
  });
});

describe('buildColoring (coreference classes)', () => {
  it('gives the query variable and the head variable it unifies with the SAME colour', () => {
    const s = sisterStep();
    const c = buildColoring([s], 'sister_of(alice, X)');
    // query X ≡ clause Y (unified through the head) → one coreference class.
    expect(c.classId('X', 'query')).not.toBeNull();
    expect(c.classId('X', 'query')).toBe(c.classId('Y', 1));
  });

  it('gives distinct variables distinct colours', () => {
    const s = sisterStep();
    const c = buildColoring([s], 'sister_of(alice, X)');
    const cX1 = c.classId('X', 1);   // clause X (the false friend)
    const cQ = c.classId('X', 'query');
    const cM = c.classId('M', 1);
    const cF = c.classId('F', 1);
    // all present and mutually distinct
    const ids = [cQ, cX1, cM, cF];
    expect(ids.every(v => v !== null)).toBe(true);
    expect(new Set(ids).size).toBe(4);
  });

  it('emits a theme-aware style block for the used classes and is not capped here', () => {
    const s = sisterStep();
    const c = buildColoring([s], 'sister_of(alice, X)');
    expect(c.capped).toBe(false);
    const css = c.css();
    expect(css).toContain('<style>');
    expect(css).toContain('.ptv-c0{color:');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
  });
});

describe('buildBindingEnvironment (substitution trail)', () => {
  it('groups coreferring variables into one row and harvests values', () => {
    const s = sisterStep();
    s.unifications = [{ variable: 'X', value: 'alice' }];   // clause X ← alice
    s.resultBindings = [{ variable: 'X', value: 'edward' }]; // query X ← edward (root)
    const query = 'sister_of(alice, X)';
    const labelMap = buildLabelMap([s], query, 'auto');
    const coloring = buildColoring([s], query);
    const rows = buildBindingEnvironment([s], query, labelMap, coloring);

    // The query X ≡ clause Y class resolves to edward, on a single row.
    const qRow = rows.find(r => r.labels.includes('X') && r.labels.includes('Y'));
    expect(qRow?.value).toBe('edward');
    // The clause's own X (the false friend) is a separate row bound to alice.
    const clauseX = rows.find(r => r.labels.length === 1 && r.labels[0] === 'X@1');
    expect(clauseX?.value).toBe('alice');
  });
});

describe('buildLabelMap (integration)', () => {
  it('flags the query-vs-clause X collision from a real-shaped trace', () => {
    const steps = [
      step(1, 'sister_of(X, Y)', 'female(X), parents(X, M, F), parents(Y, M, F)'),
    ];
    const { label, overloaded } = buildLabelMap(steps, 'sister_of(alice, X)', 'auto');
    expect(overloaded.has('X')).toBe(true);
    expect(label('X', 'query')).toBe('X');
    expect(label('X', 1)).toBe('X@1');
  });
});
