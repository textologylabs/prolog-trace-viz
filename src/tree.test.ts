/**
 * Tree Builder Tests
 */

import { describe, it, expect } from 'vitest';
import { TreeBuilder } from './tree.js';
import { TraceEvent } from './timeline.js';

describe('TreeBuilder - builtin goal display', () => {
  it('resolves internal vars in is/2 nodes using the EXIT goal', () => {
    const events: TraceEvent[] = [
      { port: 'call', level: 1, goal: 'p(_O)', predicate: 'p/1' },
      { port: 'call', level: 2, goal: '_154 is 1+1', predicate: 'is/2' },
      { port: 'exit', level: 2, goal: '2 is 1+1', predicate: 'is/2' },
      { port: 'exit', level: 1, goal: 'p(ok)', predicate: 'p/1' },
    ];

    const root = new TreeBuilder(events).build();

    // The is/2 child node should display the resolved goal, not "_154 is 1+1".
    expect(root?.children[0].goal).toBe('2 is 1+1');
  });
});

describe('TreeBuilder - backtracking', () => {
  it('discards the failed clause attempt subtree on REDO', () => {
    const events: TraceEvent[] = [
      { port: 'call', level: 1, goal: 'gcd(10,6,_O)', predicate: 'gcd/3' },
      { port: 'call', level: 2, goal: '10<6', predicate: '</2' },
      { port: 'fail', level: 2, goal: '10<6', predicate: '</2' },
      { port: 'redo', level: 1, goal: 'gcd(10,6,_O)', predicate: 'gcd/3' },
      { port: 'call', level: 2, goal: '6<10', predicate: '</2' },
      { port: 'exit', level: 2, goal: '6<10', predicate: '</2' },
      { port: 'exit', level: 1, goal: 'gcd(10,6,2)', predicate: 'gcd/3' },
    ];

    const root = new TreeBuilder(events).build();

    expect(root?.children).toHaveLength(1);
    expect(root?.children[0].goal).toBe('6<10');
  });
});
