/**
 * Parser Tests - event normalization
 */

import { describe, it, expect } from 'vitest';
import { parseEvents } from './parser.js';

describe('parseEvents - REDO port normalization', () => {
  it('normalizes redo(N) ports to a plain "redo" port', () => {
    const json = JSON.stringify([
      { port: 'redo(0)', level: 5, goal: 'gcd(10,6,_X)', predicate: 'gcd/3' },
    ]);

    const events = parseEvents(json);

    expect(events).toHaveLength(1);
    expect(events[0].port).toBe('redo');
  });

  it('keeps clause info attached to a redo event', () => {
    const json = JSON.stringify([
      {
        port: 'redo(0)',
        level: 5,
        goal: 'gcd(10,6,_X)',
        predicate: 'gcd/3',
        clause: { head: 'gcd(X,Y,D)', body: 'Y < X', line: 8 },
      },
    ]);

    const events = parseEvents(json);

    expect(events[0].port).toBe('redo');
    expect(events[0].clause?.head).toBe('gcd(X,Y,D)');
  });

  it('still rejects genuinely invalid ports', () => {
    const json = JSON.stringify([
      { port: 'bogus', level: 1, goal: 'x', predicate: 'x/0' },
    ]);

    expect(parseEvents(json)).toHaveLength(0);
  });
});
