import { describe, it, expect } from 'vitest';
import {
  splitConjuncts,
  matchGoalToConjunct,
  extractQueryBindings,
  extractQueryVariables,
  parseSolutionBindings,
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

describe('extractQueryVariables', () => {
  it('collects distinct variables in order of appearance', () => {
    expect(extractQueryVariables('likes(mary, X), likes(john, X)')).toEqual(['X']);
    expect(extractQueryVariables('append(A, B, [1,2])')).toEqual(['A', 'B']);
  });

  it('drops the anonymous variable', () => {
    expect(extractQueryVariables('member(X, [_|T])')).toEqual(['X', 'T']);
  });

  it('returns [] for a ground query', () => {
    expect(extractQueryVariables('likes(john, mary)')).toEqual([]);
  });
});

describe('parseSolutionBindings', () => {
  it('parses a marker binding term into pairs', () => {
    expect(parseSolutionBindings('[X=food]')).toEqual([{ variable: 'X', value: 'food' }]);
  });

  it('handles multiple, list-valued bindings', () => {
    expect(parseSolutionBindings('[A=[1,2],B=[3]]')).toEqual([
      { variable: 'A', value: '[1,2]' },
      { variable: 'B', value: '[3]' },
    ]);
  });

  it('returns [] for a ground solution', () => {
    expect(parseSolutionBindings('[]')).toEqual([]);
  });
});
