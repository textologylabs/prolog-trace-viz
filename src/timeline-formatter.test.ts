import { describe, it, expect } from 'vitest';
import { formatTimeline, TimelineFormatterOptions } from './timeline-formatter.js';
import { TimelineStep } from './timeline.js';

describe('Timeline Formatter', () => {
  // Helper to create a minimal timeline step
  function createStep(overrides: Partial<TimelineStep> = {}): TimelineStep {
    return {
      stepNumber: 1,
      port: 'merged',
      level: 1,
      goal: 't(1+0+1,_1234)',
      clause: {
        head: 't(X+0+1, X+1+0)',
        body: 'true',
        line: 27,
      },
      unifications: [{ variable: 'X', value: '1' }],
      subgoals: [],
      result: '1+1+0',
      children: [],
      ...overrides,
    };
  }

  describe('debugFlags option', () => {
    it('uses clause variable Z for output when clause has simple variable', () => {
      // This tests the case where clause head has a simple variable (Z) as output
      const step = createStep({
        goal: 't(1+0+1+1+1,_2008)',
        clause: {
          head: 't(X+1+1, Z)',
          body: 't(X+1, X1), t(X1+1, Z)',
          line: 28,
        },
        result: '1+1+1+1+0',
      });

      const output = formatTimeline([step], { debugFlags: new Set() });
      
      // Should use Z instead of _2008 in header
      expect(output).toContain('t(1+0+1+1+1, Z)');
      // Result should use Z
      expect(output).toContain('=> Z = 1+1+1+1+0');
    });

    it('shows internal variable names additively when debug:internal-vars is enabled', () => {
      const step = createStep({
        goal: 't(1+0+1+1+1,_2008)',
        clause: {
          head: 't(X+1+1, Z)',
          body: 't(X+1, X1), t(X1+1, Z)',
          line: 28,
        },
        result: '1+1+1+1+0',
      });

      const output = formatTimeline([step], { debugFlags: new Set(['internal-vars']) });
      
      // Should show BOTH clause var and internal var (additive)
      expect(output).toContain('Z(_2008)');
      // Result should show both
      expect(output).toContain('=> Z(_2008) = 1+1+1+1+0');
    });

    it('keeps internal var when clause output is a pattern not a variable', () => {
      // For facts like t(X+0+1, X+1+0), the output is a pattern, not a simple variable
      // In this case we can't substitute, so we keep the internal name
      const step = createStep({
        goal: 't(1+0+1,_1234)',
        clause: {
          head: 't(X+0+1, X+1+0)',
          body: 'true',
          line: 27,
        },
        result: '1+1+0',
      });

      const output = formatTimeline([step], { debugFlags: new Set() });
      
      // Since X+1+0 is not a simple variable, we keep the internal name
      // but the result line should still work
      expect(output).toContain('=> ');
      expect(output).toContain('= 1+1+0');
    });
  });

  describe('subgoal binding context', () => {
    it('shows where clause for bindings from sibling steps', () => {
      const step = createStep({
        stepNumber: 4,
        goal: 't(1+1+0+1,_1624)',
        subgoalLabel: '[2.2]',
        subgoalTemplate: 't(X1+1, Z)',
        subgoalBindings: [{ variable: 'X1', value: '1+1+0', fromStep: 3 }],
        clause: {
          head: 't(X+0+1, X+1+0)',
          body: 'true',
          line: 27,
        },
        result: '1+1+1+0',
      });

      const output = formatTimeline([step]);
      
      // Should show the binding context
      expect(output).toContain('where X1 = 1+1+0 (from Step 3)');
      // Should show template → instantiated form
      expect(output).toContain('t(X1+1, Z) →');
    });

    /**
     * Regression test for subgoalTemplate variable priority bug.
     * 
     * When a child step matches a fact like t(X+0+1, X+1+0), the output variable
     * in the clause head is a pattern (X+1+0), not a simple variable.
     * 
     * Previously, formatGoalDisplay would use this pattern as the display name,
     * resulting in confusing output like "t(1+0+1, X+1+0 (_1856))" when the
     * caller's subgoal template used a simple variable like X1.
     * 
     * The fix ensures subgoalTemplate variable names take priority over clause
     * head patterns, so the output shows "t(1+0+1, X1)" instead.
     */
    it('prefers subgoalTemplate variable over clause head pattern for goal display', () => {
      // This simulates Step 3 from the operators example:
      // - Parent's subgoal was: t(X+1, X1) → t(1+0+1, X1)
      // - Child matches fact: t(X+0+1, X+1+0) [line 27]
      // - The output arg in clause head is X+1+0 (a pattern)
      // - But the caller used X1 (a simple variable)
      // - We should display X1, not X+1+0
      const step = createStep({
        stepNumber: 3,
        goal: 't(1+0+1,_1856)',
        subgoalLabel: '[2.1]',
        subgoalTemplate: 't(X+1, X1)',  // Caller's template uses X1
        clause: {
          head: 't(X+0+1, X+1+0)',      // Clause head uses pattern X+1+0
          body: 'true',
          line: 27,
        },
        result: '1+1+0',
      });

      const output = formatTimeline([step], { debugFlags: new Set() });
      
      // Goal display should use X1 from subgoalTemplate, NOT X+1+0 from clause head
      expect(output).toContain('t(1+0+1, X1)');
      expect(output).not.toContain('t(1+0+1, X+1+0');
      
      // Result line should also use X1
      expect(output).toContain('=> X1 = 1+1+0');
      expect(output).not.toContain('=> X+1+0 = 1+1+0');
    });

    it('prefers subgoalTemplate variable in debug mode too', () => {
      const step = createStep({
        stepNumber: 3,
        goal: 't(1+0+1,_1856)',
        subgoalLabel: '[2.1]',
        subgoalTemplate: 't(X+1, X1)',
        clause: {
          head: 't(X+0+1, X+1+0)',
          body: 'true',
          line: 27,
        },
        result: '1+1+0',
      });

      const output = formatTimeline([step], { debugFlags: new Set(['internal-vars']) });
      
      // Should show X1 with internal var in parentheses
      expect(output).toContain('t(1+0+1, X1(_1856))');
      expect(output).toContain('=> X1(_1856) = 1+1+0');
    });

    it('falls back to clause head variable when no subgoalTemplate', () => {
      // Root-level steps don't have subgoalTemplate, so should use clause head
      const step = createStep({
        stepNumber: 1,
        goal: 't(0+1+1,_2008)',
        // No subgoalTemplate - this is a root step
        clause: {
          head: 't(X+1+1, Z)',
          body: 't(X+1, X1), t(X1+1, Z)',
          line: 28,
        },
        result: '1+1+0',
      });

      const output = formatTimeline([step], { debugFlags: new Set() });
      
      // Should use Z from clause head since no subgoalTemplate
      expect(output).toContain('t(0+1+1, Z)');
      expect(output).toContain('=> Z = 1+1+0');
    });
  });

  describe('nested steps', () => {
    it('formats nested children with proper indentation', () => {
      const child = createStep({
        stepNumber: 2,
        goal: 't(1+0+1,_1856)',
        subgoalLabel: '[1.1]',
      });

      const parent = createStep({
        stepNumber: 1,
        goal: 't(1+0+1+1,_1926)',
        children: [child],
        subgoals: [{ label: '[1.1]', goal: 't(X+1, X1) → t(1+0+1, X1)' }],
      });

      const output = formatTimeline([parent]);
      
      // Parent should be at root level
      expect(output).toContain('┌─ Step 1');
      // Child should be indented
      expect(output).toContain('│  ┌─ Step 2 [Goal 1.1]');
    });
  });

  describe('pattern output display', () => {
    it('shows full pattern X+1+0 instead of ellipsis for fact results', () => {
      // For facts like t(X+0+1, X+1+0), the result should show the full pattern
      const step = createStep({
        goal: 't(1+0+1,_1234)',
        clause: {
          head: 't(X+0+1, X+1+0)',
          body: 'true',
          line: 27,
        },
        result: '1+1+0',
      });

      const output = formatTimeline([step], { debugFlags: new Set() });
      
      // Should show full pattern X+1+0, not X+... ellipsis
      expect(output).toContain('=> X+1+0 = 1+1+0');
      // Should NOT contain ellipsis
      expect(output).not.toContain('X+...');
    });

    it('shows full pattern for complex arithmetic expressions', () => {
      const step = createStep({
        goal: 't(1+1+0+1,_5678)',
        clause: {
          head: 't(X+0+1, X+1+0)',
          body: 'true',
          line: 27,
        },
        unifications: [{ variable: 'X', value: '1+1' }],
        result: '1+1+1+0',
      });

      const output = formatTimeline([step], { debugFlags: new Set() });
      
      // Should show full pattern
      expect(output).toContain('=> X+1+0 = 1+1+1+0');
    });
  });

  describe('internal variable mapping (structural alignment)', () => {
    /**
     * Regression test: when a template variable is instantiated to a constant,
     * the constant is no longer a variable token. A token-counting alignment
     * then shifts and maps the trailing internal var to the wrong name —
     * e.g. gcd(X, Y1, D) → gcd(10, Y1, _3302) wrongly became gcd(10, Y1, Y1).
     */
    it('maps internal vars by argument position, not variable-token index', () => {
      const step = createStep({
        goal: 'gcd(10,16,_3302)',
        clause: {
          head: 'gcd(X, Y, D)',
          body: 'X < Y, Y1 is Y - X, gcd(X, Y1, D)',
          line: 9,
        },
        unifications: [
          { variable: 'X', value: '10' },
          { variable: 'Y', value: '16' },
        ],
        subgoals: [
          { label: '[1.3]', goal: 'gcd(X, Y1, D) → gcd(10, Y1, _3302)' },
        ],
        result: '2',
      });

      const output = formatTimeline([step], { debugFlags: new Set() });

      expect(output).toContain('gcd(10, Y1, D)');
      expect(output).not.toContain('gcd(10, Y1, Y1)');
      expect(output).not.toContain('_3302');
    });

    it('maps the output var of a predicate whose earlier args became constants', () => {
      // t(X1+1, Z) → t(1+0+1, _2008): the internal var must map to Z, not X1.
      const step = createStep({
        goal: 't(1+0+1,_2008)',
        clause: {
          head: 't(A+1+1, Z)',
          body: 't(A+1, X1), t(X1+1, Z)',
          line: 28,
        },
        unifications: [],
        subgoals: [
          { label: '[1.2]', goal: 't(X1+1, Z) → t(1+0+1, _2008)' },
        ],
        result: '1+1+0',
      });

      const output = formatTimeline([step], { debugFlags: new Set() });

      expect(output).toContain('t(1+0+1, Z)');
      expect(output).not.toContain('t(1+0+1, X1)');
      expect(output).not.toContain('_2008');
    });
  });

  describe('builtin goal result display', () => {
    it('shows the LHS variable for an is/2 subgoal result', () => {
      const step = createStep({
        stepNumber: 3,
        goal: '_3154 is 16-10',
        subgoalLabel: '[1.2]',
        subgoalTemplate: 'Y1 is Y - X',
        clause: undefined,
        unifications: [],
        result: '6',
      });

      const output = formatTimeline([step], { debugFlags: new Set() });

      expect(output).toContain('=> Y1 = 6');
      expect(output).not.toContain('?');
    });

    it('emits no result line for a comparison goal (empty result)', () => {
      const step = createStep({
        stepNumber: 2,
        goal: '10<16',
        subgoalLabel: '[1.1]',
        subgoalTemplate: 'X < Y',
        clause: undefined,
        unifications: [],
        result: '',
      });

      const output = formatTimeline([step], { debugFlags: new Set() });

      expect(output).not.toContain('=>');
    });
  });

  describe('retry (REDO) steps', () => {
    it('labels a merged retry as REDO and says what backtracking undid', () => {
      const step = createStep({
        stepNumber: 4,
        goal: 'likes(mary,_788)',
        subgoalTemplate: 'likes(mary, X)',
        clause: { head: 'likes(mary, wine)', body: 'true', line: 13 },
        unifications: [],
        result: 'wine',
        resultBindings: [{ variable: 'X', value: 'wine' }],
        isRetry: true,
        retryOfStep: 1,
        retryRejected: [{ variable: 'X', value: 'food' }],
      });

      const output = formatTimeline([step], { debugFlags: new Set() });

      // The goal is named after the query, not after the fact it happened to match
      expect(output).toContain('Step 4: REDO likes(mary, X)');
      expect(output).toContain('Retry of Step 1 — X = food led to failure; undone, seeking another solution');
      expect(output).toContain('Fact: likes(mary, wine) [line 13]');
      expect(output).toContain('=> X = wine');
    });

    it('does not duplicate the backtracking line for a retry that never exits', () => {
      const step = createStep({
        stepNumber: 4,
        port: 'redo',
        goal: 'likes(mary,_788)',
        clause: undefined,
        unifications: [],
        result: undefined,
        isRetry: true,
        retryOfStep: 1,
      });

      const output = formatTimeline([step], { debugFlags: new Set() });

      expect(output).toContain('Retry of Step 1 — seeking another solution');
      expect(output).not.toContain('Backtracking...');
    });
  });

  describe('result line', () => {
    it('names the bound variable even when the output is not the last argument', () => {
      const step = createStep({
        stepNumber: 1,
        goal: 'member(_1102,[a,b,c])',
        subgoalTemplate: 'member(X, [a,b,c])',
        exitGoal: 'member(a,[a,b,c])',
        clause: { head: 'member(X, [X|_])', body: 'true', line: 4 },
        unifications: [],
        result: '[a,b,c]',
        resultBindings: [{ variable: 'X', value: 'a' }],
      });

      const output = formatTimeline([step], { debugFlags: new Set() });

      expect(output).toContain('=> X = a');
      expect(output).not.toContain('[a,b,c] = [a,b,c]');
    });

    it('emits no result line when the goal bound nothing', () => {
      const step = createStep({
        stepNumber: 2,
        goal: 'q(3)',
        exitGoal: 'q(3)',
        clause: { head: 'q(3)', body: 'true', line: 4 },
        unifications: [],
        result: '3',
        resultBindings: [],
      });

      const output = formatTimeline([step], { debugFlags: new Set() });

      expect(output).not.toContain('=>');
    });
  });
});
