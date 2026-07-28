import { describe, it, expect } from 'vitest';
import { formatTreeAsMermaid, formatTimelineAsMermaid, TreeFormatterOptions } from './tree-formatter.js';
import { TreeNode } from './tree.js';
import { TimelineBuilder, TraceEvent, flattenTimeline } from './timeline.js';

describe('Tree Formatter', () => {
  // Helper to create a minimal tree node
  function createNode(overrides: Partial<TreeNode> = {}): TreeNode {
    return {
      id: 'A',
      goal: 't(1+0+1,_1234)',
      callStep: 1,
      status: 'success',
      children: [],
      clauseHead: 't(X+0+1, X+1+0)',
      clauseNumber: '27',
      ...overrides,
    };
  }

  describe('pattern output display', () => {
    it('shows full pattern X+1+0 instead of ellipsis in result', () => {
      const node = createNode({
        goal: 't(1+0+1,_1234)',
        clauseHead: 't(X+0+1, X+1+0)',
        finalBinding: '_1234=1+1+0',
      });

      const output = formatTreeAsMermaid(node, { debugFlags: new Set() });
      
      // Should show full pattern X+1+0, not X+... ellipsis
      expect(output).toContain('X+1+0=1+1+0');
      // Should NOT contain ellipsis
      expect(output).not.toContain('X+...');
    });

    it('shows simple variable Z when clause has simple output variable', () => {
      const node = createNode({
        goal: 't(1+0+1+1+1,_2008)',
        clauseHead: 't(X+1+1, Z)',
        clauseNumber: '28',
        finalBinding: '_2008=1+1+1+1+0',
      });

      const output = formatTreeAsMermaid(node, { debugFlags: new Set() });
      
      // Should use Z instead of internal variable
      expect(output).toContain('Z=1+1+1+1+0');
    });

    it('shows internal variable additively when debug:internal-vars is enabled', () => {
      const node = createNode({
        goal: 't(1+0+1,_1234)',
        clauseHead: 't(X+0+1, X+1+0)',
        finalBinding: '_1234=1+1+0',
      });

      const output = formatTreeAsMermaid(node, { debugFlags: new Set(['internal-vars']) });
      
      // Should show BOTH clause pattern and internal variable (additive)
      expect(output).toContain('X+1+0 (_1234)=1+1+0');
    });
  });

  describe('tree structure', () => {
    it('generates valid mermaid graph structure', () => {
      const node = createNode();
      const output = formatTreeAsMermaid(node);
      
      expect(output).toContain('graph TD');
      expect(output).toContain('%% Nodes');
      expect(output).toContain('%% Edges');
      expect(output).toContain('%% Styles');
    });

    it('handles null root gracefully', () => {
      const output = formatTreeAsMermaid(null);
      
      expect(output).toContain('No execution tree');
    });

    it('generates edges for child nodes', () => {
      const child = createNode({
        id: 'B',
        goal: 't(1+0+1,_5678)',
        callStep: 2,
      });

      const parent = createNode({
        id: 'A',
        goal: 't(1+0+1+1,_1234)',
        callStep: 1,
        children: [child],
        subgoals: [{ label: '[1.1]', goal: 't(X+1, X1)' }],
      });

      const output = formatTreeAsMermaid(parent);
      
      // Should have edge from parent to child
      expect(output).toContain('A -->');
      expect(output).toContain('B');
    });
  });

  describe('node styling', () => {
    it('applies root style to first node', () => {
      const node = createNode();
      const output = formatTreeAsMermaid(node);
      
      // Root should have blue styling
      expect(output).toContain('style A fill:#e1f5ff');
    });

    it('applies success style to successful child nodes', () => {
      const child = createNode({
        id: 'B',
        status: 'success',
      });

      const parent = createNode({
        children: [child],
        subgoals: [{ label: '[1.1]', goal: 't(X+1, X1)' }],
      });

      const output = formatTreeAsMermaid(parent);
      
      // Child should have green success styling
      expect(output).toContain('style B fill:#c8e6c9');
    });

    it('applies failure style to failed nodes', () => {
      const child = createNode({
        id: 'B',
        status: 'failure',
      });

      const parent = createNode({
        children: [child],
        subgoals: [{ label: '[1.1]', goal: 't(X+1, X1)' }],
      });

      const output = formatTreeAsMermaid(parent);
      
      // Failed node should have red styling
      expect(output).toContain('style B fill:#ffcdd2');
    });
  });
});

describe('formatTimelineAsMermaid - conjunctive backtracking', () => {
  // ?- likes(mary, X), likes(john, X).
  const events: TraceEvent[] = [
    { port: 'call', level: 31, goal: 'likes(mary,_1102)', predicate: 'likes/2' },
    {
      port: 'exit', level: 31, goal: 'likes(mary,food)', predicate: 'likes/2',
      clause: { head: 'likes(mary, food)', body: 'true', line: 12 },
    },
    { port: 'call', level: 31, goal: 'likes(john,food)', predicate: 'likes/2' },
    { port: 'fail', level: 31, goal: 'likes(john,food)', predicate: 'likes/2' },
    { port: 'redo', level: 31, goal: 'likes(mary,_788)', predicate: 'likes/2' },
    {
      port: 'exit', level: 31, goal: 'likes(mary,wine)', predicate: 'likes/2',
      clause: { head: 'likes(mary, wine)', body: 'true', line: 13 },
    },
    { port: 'call', level: 31, goal: 'likes(john,wine)', predicate: 'likes/2' },
    {
      port: 'exit', level: 31, goal: 'likes(john,wine)', predicate: 'likes/2',
      clause: { head: 'likes(john, wine)', body: 'true', line: 14 },
    },
  ];

  const query = 'likes(mary, X), likes(john, X)';
  const build = () => new TimelineBuilder(events, undefined, query).build();

  it('has a query root node holding the whole query', () => {
    const out = formatTimelineAsMermaid(build(), query);
    expect(out).toContain('graph TD');
    expect(out).toContain('likes(mary, X), likes(john, X)');
  });

  it('shows each goal as it was actually run, with the failure and the answer', () => {
    const out = formatTimelineAsMermaid(build(), query, 'X = wine');

    // Goals carry the bindings that reached them: john is tried with food, then wine
    expect(out).toContain('likes(mary, X)');
    expect(out).toContain('likes(john, food)');
    expect(out).toContain('likes(john, wine)');
    expect(out).toContain('✗ fail');
    expect(out).toContain('X = wine');
  });

  it('chains the goals in execution order rather than fanning from the query', () => {
    const out = formatTimelineAsMermaid(build(), query, 'X = wine');
    // A(query) -> B(step1) -> C(step2) -> D(fail); the query has a single child
    const flow = out.slice(out.indexOf('%% Flow'));
    expect((flow.match(/^A --> /gm) || []).length).toBe(1);
  });

  it('renders backtracking as a numbered loop: dead end back to the choice point, then the next solution', () => {
    const out = formatTimelineAsMermaid(build(), query, 'X = wine');
    expect(out).toMatch(/-\.->\|"backtrack to ①"\| /);
    expect(out).toMatch(/==>\|"next solution"\| /);
  });

  it('ends on a ✓ node carrying the answer', () => {
    const out = formatTimelineAsMermaid(build(), query, 'X = wine');
    expect(out).toContain('"✓ X = wine"');
  });

  it('omits the answer node when no answer is given', () => {
    const out = formatTimelineAsMermaid(build(), query);
    expect(out).not.toContain('✓ X = wine');
  });

  it('does not leak internal variables or the rejected binding into labels', () => {
    const out = formatTimelineAsMermaid(build(), query, 'X = wine');
    expect(out).not.toContain('_1102');
    expect(out).not.toContain('=food'); // bindings are spaced "X = food"; never "=food"
  });

  it('styles the failed node red and success nodes green', () => {
    const out = formatTimelineAsMermaid(build(), query);
    expect(out).toMatch(/fill:#ffcdd2/); // failure red
    expect(out).toMatch(/fill:#c8e6c9/); // success green
  });

  it('numbers nodes to match the timeline step numbers', () => {
    const timeline = flattenTimeline(build());
    const retry = timeline.find(s => s.isRetry)!;
    const out = formatTimelineAsMermaid(build(), query);
    const circled = String.fromCharCode(0x2460 + retry.stepNumber - 1);
    expect(out).toContain(`${circled}`);
  });

  it('returns a placeholder when there are no steps', () => {
    const out = formatTimelineAsMermaid([], query);
    expect(out).toContain('graph TD');
  });
});

describe('formatTimelineAsMermaid - multiple solutions (forest)', () => {
  const events: TraceEvent[] = [
    { port: 'call', level: 1, goal: 'likes(mary,_1)', predicate: 'likes/2' },
    {
      port: 'exit', level: 1, goal: 'likes(mary,food)', predicate: 'likes/2',
      clause: { head: 'likes(mary, food)', body: 'true', line: 12 },
    },
    { port: 'solution', level: 0, goal: '', predicate: '', bindings: [{ variable: 'X', value: 'food' }] },
    { port: 'redo', level: 1, goal: 'likes(mary,_2)', predicate: 'likes/2' },
    {
      port: 'exit', level: 1, goal: 'likes(mary,wine)', predicate: 'likes/2',
      clause: { head: 'likes(mary, wine)', body: 'true', line: 13 },
    },
    { port: 'solution', level: 0, goal: '', predicate: '', bindings: [{ variable: 'X', value: 'wine' }] },
  ];
  const query = 'likes(mary, X)';
  const build = () => {
    const b = new TimelineBuilder(events, undefined, query);
    return { steps: b.build(), solutions: b.getSolutions() };
  };

  it('hangs one ✓ leaf per solution off its own step', () => {
    const { steps, solutions } = build();
    const out = formatTimelineAsMermaid(steps, query, undefined, {}, solutions);
    expect(out).toContain('✓ solution 1: X = food');
    expect(out).toContain('✓ solution 2: X = wine');
  });

  it('draws a demand-driven backtrack loop: previous solution back to the choice point, then the next solution', () => {
    const { steps, solutions } = build();
    const out = formatTimelineAsMermaid(steps, query, undefined, {}, solutions);
    // A next-solution redo IS backtracking. The dotted loop unwinds from the
    // first solution's leaf back to the ① choice point; the thick edge carries on.
    expect(out).toMatch(/-\.->\|"backtrack to ①"\| /);
    expect(out).toMatch(/==>\|"next solution"\|/);
    // Never a self-loop.
    expect(out).not.toMatch(/([A-Z]+) -\.->\|[^|]*\| \1/);
  });
});

describe('formatTimelineAsMermaid - rule nodes show clause, fact nodes show binding', () => {
  // ?- grandparent(tom, GC). grandparent is a rule (clause 9); parent facts.
  const events: TraceEvent[] = [
    { port: 'call', level: 1, goal: 'grandparent(tom,_1)', predicate: 'grandparent/2' },
    { port: 'call', level: 2, goal: 'parent(tom,_2)', predicate: 'parent/2' },
    { port: 'exit', level: 2, goal: 'parent(tom,bob)', predicate: 'parent/2', clause: { head: 'parent(tom, bob)', body: 'true', line: 2 } },
    { port: 'call', level: 2, goal: 'parent(bob,_3)', predicate: 'parent/2' },
    { port: 'exit', level: 2, goal: 'parent(bob,ann)', predicate: 'parent/2', clause: { head: 'parent(bob, ann)', body: 'true', line: 4 } },
    { port: 'exit', level: 1, goal: 'grandparent(tom,ann)', predicate: 'grandparent/2', clause: { head: 'grandparent(G, C)', body: 'parent(G, P), parent(P, C)', line: 9 } },
  ];
  const query = 'grandparent(tom, GC)';

  it('a rule node shows only the clause it applied, not a result it did not make', () => {
    const b = new TimelineBuilder(events, undefined, query);
    const out = formatTimelineAsMermaid(b.build(), query, 'GC = ann', {}, b.getSolutions());
    // The grandparent node names its clause...
    expect(out).toMatch(/grandparent\(tom, GC\).*clause 9/s);
    // ...but does NOT pin GC = ann onto it (the subgoals produced ann, not the rule).
    const gpNode = out.split('\n').find(l => l.includes('grandparent(tom, GC)') && l.includes('clause 9'))!;
    expect(gpNode).not.toContain('GC = ann');
    // The answer still appears — on the ✓ leaf.
    expect(out).toContain('✓ GC = ann');
  });

  it('a fact node keeps the binding it genuinely made', () => {
    const b = new TimelineBuilder(events, undefined, query);
    const out = formatTimelineAsMermaid(b.build(), query, 'GC = ann', {}, b.getSolutions());
    expect(out).toMatch(/P = bob · fact 2/);
    expect(out).toMatch(/C = ann · fact 4/);
  });
});

describe('formatTimelineAsMermaid - arithmetic (is/2) results', () => {
  // p(N, R) :- R is N + 1.   ?- p(2, R).
  const events: TraceEvent[] = [
    { port: 'call', level: 1, goal: 'p(2,_1)', predicate: 'p/2' },
    { port: 'call', level: 2, goal: '_2 is 2+1', predicate: 'is/2' },
    { port: 'exit', level: 2, goal: '3 is 2+1', predicate: 'is/2' },
    { port: 'exit', level: 1, goal: 'p(2,3)', predicate: 'p/2', clause: { head: 'p(N, R)', body: 'R is N + 1', line: 1 } },
  ];
  const query = 'p(2, R)';

  it('shows the value an is/2 goal computed on its own node, named from the template', () => {
    const b = new TimelineBuilder(events, undefined, query);
    const out = formatTimelineAsMermaid(b.build(), query, 'R = 3', {}, b.getSolutions());
    // The is/2 node carries the computed result, not just the expression.
    const isNode = out.split('\n').find(l => /\bis\b/.test(l) && !l.includes('%%'))!;
    expect(isNode).toContain('R = 3');
    // The enclosing rule still shows only its clause (it did not produce the value).
    const ruleNode = out.split('\n').find(l => l.includes('p(2, R)') && l.includes('clause 1'))!;
    expect(ruleNode).not.toContain('R = 3');
  });
});

describe('formatTimelineAsMermaid - recursion', () => {
  const events: TraceEvent[] = [
    {
      port: 'call', level: 1, goal: 'append([1,2],[3,4],_R)', predicate: 'append/3',
      clause: { head: 'append([H|T], L, [H|R])', body: 'append(T, L, R)', line: 5 },
    },
    {
      port: 'call', level: 2, goal: 'append([2],[3,4],_R2)', predicate: 'append/3',
      clause: { head: 'append([H|T], L, [H|R])', body: 'append(T, L, R)', line: 5 },
    },
    {
      port: 'exit', level: 2, goal: 'append([2],[3,4],[2,3,4])', predicate: 'append/3',
      clause: { head: 'append([H|T], L, [H|R])', body: 'append(T, L, R)', line: 5 },
    },
    {
      port: 'exit', level: 1, goal: 'append([1,2],[3,4],[1,2,3,4])', predicate: 'append/3',
      clause: { head: 'append([H|T], L, [H|R])', body: 'append(T, L, R)', line: 5 },
    },
  ];

  it('chains the recursive call into the flow and shows the result', () => {
    const query = 'append([1,2], [3,4], X)';
    const out = formatTimelineAsMermaid(new TimelineBuilder(events, undefined, query).build(), query, 'X = [1,2,3,4]');

    expect(out).toMatch(/[A-Z]+ --> [A-Z]+/);
    expect(out).toContain('X = [1,2,3,4]');
    expect(out).toContain('"✓ X = [1,2,3,4]"');
  });
});
