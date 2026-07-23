import { describe, it, expect } from 'vitest';
import {
  splitConjuncts,
  matchGoalToConjunct,
  extractQueryBindings,
} from './query.js';

describe('splitConjuncts', () => {
  it('splits a conjunctive query at the top level', () => {
    expect(splitConjuncts('likes(mary, X), likes(john, X)')).toEqual([
      'likes(mary, X)',
      'likes(john, X)',
    ]);
  });

  it('does not split inside arguments or lists', () => {
    expect(splitConjuncts('append([1,2], [3,4], X)')).toEqual(['append([1,2], [3,4], X)']);
  });

  it('tolerates a trailing full stop', () => {
    expect(splitConjuncts('member(X, [a,b]).')).toEqual(['member(X, [a,b])']);
  });
});

describe('matchGoalToConjunct', () => {
  const conjuncts = ['likes(mary, X)', 'likes(john, X)'];

  it('picks the conjunct whose ground arguments agree', () => {
    expect(matchGoalToConjunct('likes(mary,_1102)', conjuncts)).toBe('likes(mary, X)');
    expect(matchGoalToConjunct('likes(john,food)', conjuncts)).toBe('likes(john, X)');
  });

  it('returns nothing when no conjunct can match', () => {
    expect(matchGoalToConjunct('hates(mary,_1)', conjuncts)).toBeUndefined();
    expect(matchGoalToConjunct('likes(mary,_1,_2)', conjuncts)).toBeUndefined();
  });
});

describe('extractQueryBindings', () => {
  it('reads query variables out of the solved goal', () => {
    expect(extractQueryBindings('likes(mary, X)', 'likes(mary,wine)')).toEqual([
      { variable: 'X', value: 'wine' },
    ]);
  });

  it('ignores arguments that are still unbound', () => {
    expect(extractQueryBindings('likes(mary, X)', 'likes(mary,_998)')).toEqual([]);
  });

  it('handles a variable in any argument position', () => {
    expect(extractQueryBindings('member(X, [a,b,c])', 'member(a,[a,b,c])')).toEqual([
      { variable: 'X', value: 'a' },
    ]);
  });
});
