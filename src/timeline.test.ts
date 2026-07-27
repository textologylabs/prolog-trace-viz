/**
 * Timeline Builder Tests
 * Tests for CALL/EXIT merging, especially for recursive predicates
 */

import { describe, it, expect } from 'vitest';
import { TimelineBuilder, TraceEvent, flattenTimeline } from './timeline.js';

describe('Timeline merging - non-recursive', () => {
  it('should merge CALL/EXIT pairs in correct order', () => {
    const events: TraceEvent[] = [
      { 
        port: 'call', 
        level: 33, 
        goal: 'fact(a, X)', 
        predicate: 'fact/2',
        clause: { head: 'fact(a, 1)', body: 'true', line: 1 }
      },
      { 
        port: 'exit', 
        level: 33, 
        goal: 'fact(a, 1)', 
        predicate: 'fact/2',
        clause: { head: 'fact(a, 1)', body: 'true', line: 1 }
      },
    ];
    
    const builder = new TimelineBuilder(events);
    const timeline = flattenTimeline(builder.build());
    
    expect(timeline).toHaveLength(1);
    expect(timeline[0].port).toBe('merged');
    expect(timeline[0].stepNumber).toBe(1);
    expect(timeline[0].result).toBe('1');
  });
});

describe('Timeline merging - recursive', () => {
  it('should preserve chronological order for recursive calls', () => {
    // Events for: append([1,2], [3,4], X)
    const events: TraceEvent[] = [
      { 
        port: 'call', 
        level: 33, 
        goal: 'append([1,2],[3,4],X)', 
        predicate: 'append/3',
        clause: { head: 'append([H|T], L, [H|R])', body: 'append(T, L, R)', line: 2 }
      },
      { 
        port: 'call', 
        level: 34, 
        goal: 'append([2],[3,4],R)', 
        predicate: 'append/3',
        clause: { head: 'append([H|T], L, [H|R])', body: 'append(T, L, R)', line: 2 }
      },
      { 
        port: 'call', 
        level: 35, 
        goal: 'append([],[3,4],R2)', 
        predicate: 'append/3',
        clause: { head: 'append([], L, L)', body: 'true', line: 1 }
      },
      { 
        port: 'exit', 
        level: 35, 
        goal: 'append([],[3,4],[3,4])', 
        predicate: 'append/3',
        clause: { head: 'append([], L, L)', body: 'true', line: 1 }
      },
      { 
        port: 'exit', 
        level: 34, 
        goal: 'append([2],[3,4],[2,3,4])', 
        predicate: 'append/3',
        clause: { head: 'append([H|T], L, [H|R])', body: 'append(T, L, R)', line: 2 }
      },
      { 
        port: 'exit', 
        level: 33, 
        goal: 'append([1,2],[3,4],[1,2,3,4])', 
        predicate: 'append/3',
        clause: { head: 'append([H|T], L, [H|R])', body: 'append(T, L, R)', line: 2 }
      },
    ];
    
    const builder = new TimelineBuilder(events);
    const timeline = flattenTimeline(builder.build());
    
    expect(timeline).toHaveLength(3);
    expect(timeline[0].stepNumber).toBe(1);
    expect(timeline[1].stepNumber).toBe(2);
    expect(timeline[2].stepNumber).toBe(3);
    expect(timeline[0].goal).toContain('append([1,2]');
    expect(timeline[1].goal).toContain('append([2]');
    expect(timeline[2].goal).toContain('append([]');
  });
});

describe('Timeline merging - multiple calls at same level', () => {
  it('should not lose steps when multiple calls occur at the same recursion level', () => {
    // Simplified events for: t(1+0+1+1, A)
    // This is the bug case - two calls at level 34
    const events: TraceEvent[] = [
      { 
        port: 'call', 
        level: 33, 
        goal: 't(1+0+1+1,A)', 
        predicate: 't/2',
        clause: { head: 't(X+1+1, Z)', body: 't(X+1, X1), t(X1+1, Z)', line: 28 }
      },
      { 
        port: 'call', 
        level: 34, 
        goal: 't(1+0+1,X1)', 
        predicate: 't/2',
        clause: { head: 't(X+0+1, X+1+0)', body: 'true', line: 27 }
      },
      { 
        port: 'exit', 
        level: 34, 
        goal: 't(1+0+1,1+1+0)', 
        predicate: 't/2',
        clause: { head: 't(X+0+1, X+1+0)', body: 'true', line: 27 }
      },
      { 
        port: 'call', 
        level: 34, 
        goal: 't(1+1+0+1,Z)', 
        predicate: 't/2',
        clause: { head: 't(X+0+1, X+1+0)', body: 'true', line: 27 }
      },
      { 
        port: 'exit', 
        level: 34, 
        goal: 't(1+1+0+1,1+1+1+0)', 
        predicate: 't/2',
        clause: { head: 't(X+0+1, X+1+0)', body: 'true', line: 27 }
      },
      { 
        port: 'exit', 
        level: 33, 
        goal: 't(1+0+1+1,1+1+1+0)', 
        predicate: 't/2',
        clause: { head: 't(X+1+1, Z)', body: 't(X+1, X1), t(X1+1, Z)', line: 28 }
      },
    ];
    
    const builder = new TimelineBuilder(events);
    const timeline = flattenTimeline(builder.build());
    
    // Should have 3 merged steps (not 2!)
    expect(timeline).toHaveLength(3);
    
    // Steps should be numbered continuously 1, 2, 3
    expect(timeline[0].stepNumber).toBe(1);
    expect(timeline[1].stepNumber).toBe(2);
    expect(timeline[2].stepNumber).toBe(3);
    
    // Step 1 should be t(1+0+1+1,A)
    expect(timeline[0].goal).toBe('t(1+0+1+1,A)');
    
    // Step 2 should be t(1+0+1,X1)
    expect(timeline[1].goal).toBe('t(1+0+1,X1)');
    
    // Step 3 should be t(1+1+0+1,Z)
    expect(timeline[2].goal).toBe('t(1+1+0+1,Z)');
  });
});

describe('Subgoal label assignment', () => {
  it('should assign correct subgoal labels', () => {
    const events: TraceEvent[] = [
      { 
        port: 'call', 
        level: 33, 
        goal: 't(1+0+1+1,A)', 
        predicate: 't/2',
        clause: { head: 't(X+1+1,Z)', body: 't(X+1,X1), t(X1+1,Z)', line: 28 }
      },
      { 
        port: 'call', 
        level: 34, 
        goal: 't(1+0+1,X1)', 
        predicate: 't/2',
        clause: { head: 't(X+0+1, X+1+0)', body: 'true', line: 27 }
      },
      { 
        port: 'exit', 
        level: 34, 
        goal: 't(1+0+1,1+1+0)', 
        predicate: 't/2',
        clause: { head: 't(X+0+1, X+1+0)', body: 'true', line: 27 }
      },
      { 
        port: 'call', 
        level: 34, 
        goal: 't(1+1+0+1,Z)', 
        predicate: 't/2',
        clause: { head: 't(X+0+1, X+1+0)', body: 'true', line: 27 }
      },
      { 
        port: 'exit', 
        level: 34, 
        goal: 't(1+1+0+1,1+1+1+0)', 
        predicate: 't/2',
        clause: { head: 't(X+0+1, X+1+0)', body: 'true', line: 27 }
      },
      { 
        port: 'exit', 
        level: 33, 
        goal: 't(1+0+1+1,1+1+1+0)', 
        predicate: 't/2',
        clause: { head: 't(X+1+1,Z)', body: 't(X+1,X1), t(X1+1,Z)', line: 28 }
      },
    ];
    
    const builder = new TimelineBuilder(events);
    const timeline = flattenTimeline(builder.build());
    
    // Step 1 should have subgoals [1.1] and [1.2]
    expect(timeline[0].subgoals).toHaveLength(2);
    expect(timeline[0].subgoals[0].label).toBe('[1.1]');
    expect(timeline[0].subgoals[1].label).toBe('[1.2]');
    
    // Step 2 should be solving [1.1]
    expect(timeline[1].subgoalLabel).toBe('[1.1]');
    
    // Step 3 should be solving [1.2]
    expect(timeline[2].subgoalLabel).toBe('[1.2]');
  });
});

describe('Instantiated subgoal display', () => {
  it('should show instantiated subgoals with variable substitution', () => {
    const events: TraceEvent[] = [
      { 
        port: 'call', 
        level: 33, 
        goal: 't(1+0+1+1,A)', 
        predicate: 't/2',
        clause: { head: 't(X+1+1,Z)', body: 't(X+1,X1), t(X1+1,Z)', line: 28 }
      },
      { 
        port: 'exit', 
        level: 33, 
        goal: 't(1+0+1+1,1+1+1+0)', 
        predicate: 't/2',
        clause: { head: 't(X+1+1,Z)', body: 't(X+1,X1), t(X1+1,Z)', line: 28 }
      },
    ];
    
    const builder = new TimelineBuilder(events);
    const timeline = flattenTimeline(builder.build());
    
    // Subgoal [1.1] should show instantiation with arrow
    expect(timeline[0].subgoals[0].goal).toContain('→');
    // The pattern matching extracts X = 1+0 (due to operator associativity)
    // So t(X+1,X1) becomes t(1+0+1,X1)
    expect(timeline[0].subgoals[0].goal).toContain('1+0+1');
    
    // Subgoal [1.2] should show: t(X1+1, Z) → t(X1+1, A) (Z is bound to A)
    expect(timeline[0].subgoals[1].goal).toContain('→');
    expect(timeline[0].subgoals[1].goal).toContain('t(X1+1,A)');
  });
});

describe('Builtin goal results', () => {
  it('extracts the LHS value as the result of an is/2 goal', () => {
    const events: TraceEvent[] = [
      { port: 'call', level: 1, goal: '_154 is 16-10', predicate: 'is/2' },
      { port: 'exit', level: 1, goal: '6 is 16-10', predicate: 'is/2' },
    ];
    const timeline = flattenTimeline(new TimelineBuilder(events).build());
    expect(timeline[0].result).toBe('6');
  });

  it('produces no result value for a comparison goal', () => {
    const events: TraceEvent[] = [
      { port: 'call', level: 1, goal: '10<16', predicate: '</2' },
      { port: 'exit', level: 1, goal: '10<16', predicate: '</2' },
    ];
    const timeline = flattenTimeline(new TimelineBuilder(events).build());
    expect(timeline[0].result).toBe('');
  });

  it('still extracts the last argument for a compound term', () => {
    const events: TraceEvent[] = [
      { port: 'call', level: 1, goal: 'gcd(2,2,_O)', predicate: 'gcd/3' },
      { port: 'exit', level: 1, goal: 'gcd(2,2,2)', predicate: 'gcd/3' },
    ];
    const timeline = flattenTimeline(new TimelineBuilder(events).build());
    expect(timeline[0].result).toBe('2');
  });
});

describe('Backtracking - REDO discards failed clause attempt', () => {
  // gcd(10, 6, D): clause #1 (X<Y) fails on 10<6, backtracks to clause #2 (Y<X).
  const events: TraceEvent[] = [
    { port: 'call', level: 1, goal: 'gcd(10,6,_O)', predicate: 'gcd/3' },
    { port: 'call', level: 2, goal: '10<6', predicate: '</2' },
    { port: 'fail', level: 2, goal: '10<6', predicate: '</2' },
    {
      port: 'redo', level: 1, goal: 'gcd(10,6,_O)', predicate: 'gcd/3',
      clause: { head: 'gcd(X, Y, D)', body: 'Y < X', line: 15 },
    },
    { port: 'call', level: 2, goal: '6<10', predicate: '</2' },
    { port: 'exit', level: 2, goal: '6<10', predicate: '</2' },
    {
      port: 'exit', level: 1, goal: 'gcd(10,6,2)', predicate: 'gcd/3',
      clause: { head: 'gcd(X, Y, D)', body: 'Y < X', line: 15 },
    },
  ];

  it('drops the failed clause attempt children', () => {
    const builder = new TimelineBuilder(events);
    const nested = builder.build();

    // Only the surviving clause attempt remains.
    expect(nested).toHaveLength(1);
    expect(nested[0].children).toHaveLength(1);
    expect(nested[0].children[0].goal).toBe('6<10');
  });

  it('does not leak the failed goal into the flattened timeline', () => {
    const builder = new TimelineBuilder(events);
    const timeline = flattenTimeline(builder.build());

    expect(timeline.some(s => s.goal === '10<6')).toBe(false);
    expect(timeline.some(s => s.port === 'fail')).toBe(false);
  });

  it('uses the clause the goal ultimately succeeded with', () => {
    const builder = new TimelineBuilder(events);
    const nested = builder.build();

    expect(nested[0].clause?.line).toBe(15);
    // Children align to the surviving clause's subgoals.
    expect(nested[0].children[0].subgoalLabel).toBe('[1.1]');
  });
});

describe('Backtracking - REDO into a goal that already succeeded', () => {
  // ?- likes(mary, X), likes(john, X).
  // Both conjuncts run at the same trace level. likes(john, food) fails, so
  // Prolog backtracks into likes(mary, X) for a second solution (wine).
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

  it('emits a visible step for the retry', () => {
    const timeline = flattenTimeline(new TimelineBuilder(events).build());

    const retry = timeline.find(s => s.isRetry);
    expect(retry).toBeDefined();
    expect(retry!.level).toBe(31);
  });

  it('attributes the second solution to the retried goal', () => {
    const timeline = flattenTimeline(new TimelineBuilder(events).build());
    const retry = timeline.find(s => s.isRetry)!;

    // The EXIT after the REDO belongs to likes(mary, X), not to a new goal.
    expect(retry.port).toBe('merged');
    expect(retry.clause?.line).toBe(13);
    expect(retry.result).toBe('wine');
  });

  it('points the retry back at the step it is re-entering', () => {
    const timeline = flattenTimeline(new TimelineBuilder(events).build());
    const first = timeline.find(s => s.clause?.line === 12)!;
    const retry = timeline.find(s => s.isRetry)!;

    expect(retry.retryOfStep).toBe(first.stepNumber);
    expect(retry.stepNumber).toBeGreaterThan(first.stepNumber);
  });

  it('keeps the first solution and the failed conjunct in the timeline', () => {
    const timeline = flattenTimeline(new TimelineBuilder(events).build());

    expect(timeline.some(s => s.clause?.line === 12)).toBe(true);
    expect(timeline.some(s => s.port === 'fail' && s.goal === 'likes(john,food)')).toBe(true);
    expect(timeline.some(s => s.clause?.line === 14)).toBe(true);
  });

  it('renders every solution in trace order', () => {
    const nested = new TimelineBuilder(events).build();

    expect(nested.map(s => s.clause?.line)).toEqual([12, undefined, 13, 14]);
  });

  it('re-enters a subgoal without disturbing its sibling labels', () => {
    // p :- q(X), r(X).  r fails on the first solution of q, so q is redone.
    const nestedEvents: TraceEvent[] = [
      {
        port: 'call', level: 1, goal: 'p(_A)', predicate: 'p/1',
        clause: { head: 'p(X)', body: 'q(X), r(X)', line: 1 },
      },
      { port: 'call', level: 2, goal: 'q(_A)', predicate: 'q/1' },
      {
        port: 'exit', level: 2, goal: 'q(a)', predicate: 'q/1',
        clause: { head: 'q(a)', body: 'true', line: 2 },
      },
      { port: 'call', level: 2, goal: 'r(a)', predicate: 'r/1' },
      { port: 'fail', level: 2, goal: 'r(a)', predicate: 'r/1' },
      { port: 'redo', level: 2, goal: 'q(_A)', predicate: 'q/1' },
      {
        port: 'exit', level: 2, goal: 'q(b)', predicate: 'q/1',
        clause: { head: 'q(b)', body: 'true', line: 3 },
      },
      { port: 'call', level: 2, goal: 'r(b)', predicate: 'r/1' },
      {
        port: 'exit', level: 2, goal: 'r(b)', predicate: 'r/1',
        clause: { head: 'r(b)', body: 'true', line: 4 },
      },
      { port: 'exit', level: 1, goal: 'p(b)', predicate: 'p/1',
        clause: { head: 'p(X)', body: 'q(X), r(X)', line: 1 } },
    ];

    const nested = new TimelineBuilder(nestedEvents).build();
    const children = nested[0].children;

    // q, r(fails), REDO q, r
    expect(children).toHaveLength(4);
    expect(children.map(c => c.subgoalLabel)).toEqual(['[1.1]', '[1.2]', '[1.1]', '[1.2]']);
    expect(children[2].isRetry).toBe(true);
  });
});

describe('Query variable names', () => {
  const events: TraceEvent[] = [
    { port: 'call', level: 31, goal: 'likes(mary,_1102)', predicate: 'likes/2' },
    {
      port: 'exit', level: 31, goal: 'likes(mary,food)', predicate: 'likes/2',
      clause: { head: 'likes(mary, food)', body: 'true', line: 12 },
    },
  ];

  it('names a top-level goal after the query conjunct it came from', () => {
    const timeline = flattenTimeline(
      new TimelineBuilder(events, undefined, 'likes(mary, X), likes(john, X)').build()
    );

    expect(timeline[0].subgoalTemplate).toBe('likes(mary, X)');
    // The bound argument is reported under the user's name, not the fact's constant
    expect(timeline[0].resultBindings).toEqual([{ variable: 'X', value: 'food' }]);
  });

  it('reports the bound variable when the output is not the last argument', () => {
    const memberEvents: TraceEvent[] = [
      { port: 'call', level: 1, goal: 'member(_1102,[a,b,c])', predicate: 'member/2' },
      {
        port: 'exit', level: 1, goal: 'member(a,[a,b,c])', predicate: 'member/2',
        clause: { head: 'member(X, [X|_])', body: 'true', line: 4 },
      },
    ];

    const timeline = flattenTimeline(
      new TimelineBuilder(memberEvents, undefined, 'member(X, [a,b,c])').build()
    );

    expect(timeline[0].resultBindings).toEqual([{ variable: 'X', value: 'a' }]);
  });

  it('reports no bindings for a goal that bound nothing', () => {
    const groundEvents: TraceEvent[] = [
      { port: 'call', level: 1, goal: 'q(3)', predicate: 'q/1' },
      {
        port: 'exit', level: 1, goal: 'q(3)', predicate: 'q/1',
        clause: { head: 'q(3)', body: 'true', line: 4 },
      },
    ];

    const timeline = flattenTimeline(
      new TimelineBuilder(groundEvents, undefined, 'q(3)').build()
    );

    expect(timeline[0].resultBindings).toEqual([]);
  });
});

describe('Backtracking - REDO through a nested choice point', () => {
  // ?- member(X, [1,2]), X > 1.  The second solution of the top-level member
  // comes from backtracking into its recursive subgoal, so the outer goal EXITs
  // a second time and must be re-entered along with it.
  const events: TraceEvent[] = [
    { port: 'call', level: 1, goal: 'member(_A,[1,2])', predicate: 'member/2' },
    {
      port: 'exit', level: 1, goal: 'member(1,[1,2])', predicate: 'member/2',
      clause: { head: 'member(X, [X|_])', body: 'true', line: 1 },
    },
    { port: 'call', level: 1, goal: '1>1', predicate: '>/2' },
    { port: 'fail', level: 1, goal: '1>1', predicate: '>/2' },
    {
      port: 'redo', level: 1, goal: 'member(_A,[1,2])', predicate: 'member/2',
      clause: { head: 'member(X, [_|T])', body: 'member(X, T)', line: 2 },
    },
    { port: 'call', level: 2, goal: 'member(_A,[2])', predicate: 'member/2' },
    {
      port: 'exit', level: 2, goal: 'member(2,[2])', predicate: 'member/2',
      clause: { head: 'member(X, [X|_])', body: 'true', line: 1 },
    },
    {
      port: 'exit', level: 1, goal: 'member(2,[1,2])', predicate: 'member/2',
      clause: { head: 'member(X, [_|T])', body: 'member(X, T)', line: 2 },
    },
    { port: 'redo', level: 2, goal: 'member(_A,[2])', predicate: 'member/2' },
    { port: 'call', level: 3, goal: 'member(_A,[])', predicate: 'member/2' },
    { port: 'fail', level: 3, goal: 'member(_A,[])', predicate: 'member/2' },
  ];

  it('re-enters the enclosing goal, not just the inner choice point', () => {
    const nested = new TimelineBuilder(events, undefined, 'member(X, [1,2]), X > 1').build();

    // Two re-entries of the outer goal: the first from its own choice point,
    // the second dragged along when its recursive subgoal was re-entered.
    const outerRetries = nested.filter(s => s.isRetry && s.level === 1);
    expect(outerRetries).toHaveLength(2);
    expect(outerRetries[1].children.some(c => c.isRetry && c.level === 2)).toBe(true);
  });

  it('records the second solution against the top-level goal', () => {
    const nested = new TimelineBuilder(events, undefined, 'member(X, [1,2]), X > 1').build();
    const outerRetry = nested.find(s => s.isRetry)!;

    expect(outerRetry.exitGoal).toBe('member(2,[1,2])');
    expect(outerRetry.resultBindings).toEqual([{ variable: 'X', value: '2' }]);
  });

  it('traces every retry in the cascade back to the failure that triggered it', () => {
    const timeline = flattenTimeline(
      new TimelineBuilder(events, undefined, 'member(X, [1,2]), X > 1').build()
    );

    // The one failure that set backtracking off is 1 > 1.
    const failStep = timeline.find(s => s.port === 'fail' && s.goal === '1>1')!;
    const retries = timeline.filter(s => s.isRetry);

    expect(retries.length).toBeGreaterThanOrEqual(2);
    // Both the outer re-entry and the inner one point at the real dead end,
    // not at each other (the old stepNumber-1 heuristic pointed one at the other).
    for (const retry of retries) {
      expect(retry.backtrackFromStep).toBe(failStep.stepNumber);
    }
  });
});

describe('Multiple solutions', () => {
  // ?- likes(mary, X). enumerated: food, then wine (findnsols asks for more).
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

  it('collects each solution with its bindings', () => {
    const builder = new TimelineBuilder(events, undefined, 'likes(mary, X)');
    builder.build();
    expect(builder.getSolutions()).toEqual([
      { index: 1, bindings: [{ variable: 'X', value: 'food' }] },
      { index: 2, bindings: [{ variable: 'X', value: 'wine' }] },
    ]);
  });

  it('tags each step with the solution it belongs to', () => {
    const timeline = flattenTimeline(new TimelineBuilder(events, undefined, 'likes(mary, X)').build());
    const first = timeline.find(s => s.clause?.line === 12)!;
    const second = timeline.find(s => s.clause?.line === 13)!;
    expect(first.solutionIndex).toBe(1);
    expect(second.solutionIndex).toBe(2);
    // The second solution came from enumeration, not a failure.
    expect(second.isRetry).toBe(true);
    expect(second.backtrackFromStep).toBeUndefined();
  });
});

describe('Nested timeline structure', () => {
  it('should nest children inside parent steps', () => {
    const events: TraceEvent[] = [
      { 
        port: 'call', 
        level: 33, 
        goal: 't(1+0+1+1,A)', 
        predicate: 't/2',
        clause: { head: 't(X+1+1, Z)', body: 't(X+1, X1), t(X1+1, Z)', line: 28 }
      },
      { 
        port: 'call', 
        level: 34, 
        goal: 't(1+0+1,X1)', 
        predicate: 't/2',
        clause: { head: 't(X+0+1, X+1+0)', body: 'true', line: 27 }
      },
      { 
        port: 'exit', 
        level: 34, 
        goal: 't(1+0+1,1+1+0)', 
        predicate: 't/2',
        clause: { head: 't(X+0+1, X+1+0)', body: 'true', line: 27 }
      },
      { 
        port: 'call', 
        level: 34, 
        goal: 't(1+1+0+1,Z)', 
        predicate: 't/2',
        clause: { head: 't(X+0+1, X+1+0)', body: 'true', line: 27 }
      },
      { 
        port: 'exit', 
        level: 34, 
        goal: 't(1+1+0+1,1+1+1+0)', 
        predicate: 't/2',
        clause: { head: 't(X+0+1, X+1+0)', body: 'true', line: 27 }
      },
      { 
        port: 'exit', 
        level: 33, 
        goal: 't(1+0+1+1,1+1+1+0)', 
        predicate: 't/2',
        clause: { head: 't(X+1+1, Z)', body: 't(X+1, X1), t(X1+1, Z)', line: 28 }
      },
    ];
    
    const builder = new TimelineBuilder(events);
    const nestedTimeline = builder.build();
    
    // Root level should have 1 step
    expect(nestedTimeline).toHaveLength(1);
    
    // Root step should have 2 children
    expect(nestedTimeline[0].children).toHaveLength(2);
    
    // Children should be the two subgoal calls
    expect(nestedTimeline[0].children[0].goal).toBe('t(1+0+1,X1)');
    expect(nestedTimeline[0].children[1].goal).toBe('t(1+1+0+1,Z)');
  });
});

describe('Backtracking - ancestor re-exit is not a choice point', () => {
  // ?- grandparent(tom, GC).  Two solutions (ann, pat). Only parent(bob, C)
  // gets a REDO — grandparent has a single clause and merely re-EXITs as a
  // consequence, so it must NOT be treated as a choice point that backtracked.
  const events: TraceEvent[] = [
    { port: 'call', level: 38, goal: 'grandparent(tom,_1)', predicate: 'grandparent/2' },
    { port: 'call', level: 39, goal: 'parent(tom,_2)', predicate: 'parent/2' },
    { port: 'exit', level: 39, goal: 'parent(tom,bob)', predicate: 'parent/2', clause: { head: 'parent(tom, bob)', body: 'true', line: 2 } },
    { port: 'call', level: 39, goal: 'parent(bob,_3)', predicate: 'parent/2' },
    { port: 'exit', level: 39, goal: 'parent(bob,ann)', predicate: 'parent/2', clause: { head: 'parent(bob, ann)', body: 'true', line: 4 } },
    { port: 'exit', level: 38, goal: 'grandparent(tom,ann)', predicate: 'grandparent/2', clause: { head: 'grandparent(G, C)', body: 'parent(G, P), parent(P, C)', line: 9 } },
    { port: 'redo', level: 39, goal: 'parent(bob,_4)', predicate: 'parent/2' },
    { port: 'exit', level: 39, goal: 'parent(bob,pat)', predicate: 'parent/2', clause: { head: 'parent(bob, pat)', body: 'true', line: 5 } },
    { port: 'exit', level: 38, goal: 'grandparent(tom,pat)', predicate: 'grandparent/2', clause: { head: 'grandparent(G, C)', body: 'parent(G, P), parent(P, C)', line: 9 } },
  ];

  it('flags the grandparent re-exit as an ancestor re-entry, not the parent redo', () => {
    const timeline = flattenTimeline(new TimelineBuilder(events).build());
    const gpReentry = timeline.find(s => s.isRetry && s.goal.startsWith('grandparent'));
    const parentRetry = timeline.find(s => s.isRetry && s.goal.startsWith('parent'));

    expect(gpReentry).toBeDefined();
    expect(gpReentry!.isAncestorReentry).toBe(true);   // consequential re-success
    expect(parentRetry).toBeDefined();
    expect(parentRetry!.isAncestorReentry).toBeFalsy(); // the real choice point
  });
});
