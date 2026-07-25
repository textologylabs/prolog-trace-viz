import { describe, it, expect } from 'vitest';
import { generateWrapper, parseWrapper, calculateLineOffset, mapWrapperLineToSource, WrapperConfig } from './wrapper.js';
import { buildSourceClauseMap } from './clauses.js';

describe('Wrapper Generator - Unit Tests', () => {
  describe('generateWrapper', () => {
    it('should generate wrapper with tracer loading', () => {
      const config: WrapperConfig = {
        prologContent: 'factorial(0, 1).',
        query: 'factorial(3, X)',
        tracerPath: '/path/to/tracer.pl',
      };

      const wrapper = generateWrapper(config);

      expect(wrapper).toContain(":- ['/path/to/tracer.pl'].");
    });

    it('should include user Prolog content without instrumentation', () => {
      const config: WrapperConfig = {
        prologContent: 'factorial(0, 1).\nfactorial(N, F) :- N > 0.',
        query: 'factorial(3, X)',
        tracerPath: 'tracer.pl',
      };

      const wrapper = generateWrapper(config);

      expect(wrapper).toContain('factorial(0, 1).');
      expect(wrapper).toContain('factorial(N, F) :- N > 0.');
      expect(wrapper).not.toContain('trace_call');
      expect(wrapper).not.toContain('clause_marker');
    });

    it('should include query in catch block', () => {
      const config: WrapperConfig = {
        prologContent: 'test(X).',
        query: 'test(Y)',
        tracerPath: 'tracer.pl',
      };

      const wrapper = generateWrapper(config);

      expect(wrapper).toContain('catch(');
      expect(wrapper).toContain('test(Y)');
      expect(wrapper).toContain("export_trace_json('trace.json')");
    });

    it('enumerates one solution by default via findnsols', () => {
      const config: WrapperConfig = {
        prologContent: 'likes(mary, food).',
        query: 'likes(mary, X)',
        tracerPath: 'tracer.pl',
      };

      const wrapper = generateWrapper(config);

      expect(wrapper).toContain('findnsols(1, _, (likes(mary, X), record_solution(');
      // The query's variables are snapshotted as Name=Var pairs.
      expect(wrapper).toContain("record_solution(['X'=X])");
    });

    it('enumerates N solutions and captures all query variables', () => {
      const config: WrapperConfig = {
        prologContent: 'append([], L, L).',
        query: 'append(A, B, [1,2])',
        tracerPath: 'tracer.pl',
        solutions: 5,
      };

      const wrapper = generateWrapper(config);

      expect(wrapper).toContain('findnsols(5, _,');
      expect(wrapper).toContain("record_solution(['A'=A, 'B'=B])");
    });

    it('should include tracer lifecycle calls', () => {
      const config: WrapperConfig = {
        prologContent: 'test.',
        query: 'test',
        tracerPath: 'tracer.pl',
      };

      const wrapper = generateWrapper(config);

      expect(wrapper).toContain('install_tracer');
      expect(wrapper).toContain('remove_tracer');
    });

    it('should include error handling', () => {
      const config: WrapperConfig = {
        prologContent: 'test.',
        query: 'test',
        tracerPath: 'tracer.pl',
      };

      const wrapper = generateWrapper(config);

      expect(wrapper).toContain('catch(');
      expect(wrapper).toContain('Error');
      expect(wrapper).toContain("format('Error: ~w~n', [Error])");
    });

    it('should include execution directives', () => {
      const config: WrapperConfig = {
        prologContent: 'test.',
        query: 'test',
        tracerPath: 'tracer.pl',
      };

      const wrapper = generateWrapper(config);

      expect(wrapper).toContain(':- run_trace.');
      expect(wrapper).toContain(':- halt.');
    });

    it('should handle queries with commas', () => {
      const config: WrapperConfig = {
        prologContent: 'test(X, Y).',
        query: 'test(1, 2), test(3, 4)',
        tracerPath: 'tracer.pl',
      };

      const wrapper = generateWrapper(config);

      expect(wrapper).toContain('test(1, 2), test(3, 4)');
    });

    it('should handle empty Prolog content', () => {
      const config: WrapperConfig = {
        prologContent: '',
        query: 'true',
        tracerPath: 'tracer.pl',
      };

      const wrapper = generateWrapper(config);

      expect(wrapper).toContain('install_tracer');
      expect(wrapper).toContain('true');
    });
  });

  describe('parseWrapper', () => {
    it('should parse valid wrapper back to config', () => {
      const original: WrapperConfig = {
        prologContent: 'factorial(0, 1).',
        query: 'factorial(3, X)',
        tracerPath: '/path/to/tracer.pl',
      };

      const wrapper = generateWrapper(original);
      const parsed = parseWrapper(wrapper);

      expect(parsed).not.toBeNull();
      expect(parsed!.prologContent).toBe(original.prologContent);
      expect(parsed!.query).toBe(original.query);
      expect(parsed!.tracerPath).toBe(original.tracerPath);
    });

    it('should handle multi-line Prolog content', () => {
      const original: WrapperConfig = {
        prologContent: 'factorial(0, 1).\nfactorial(N, F) :- N > 0, N1 is N - 1.',
        query: 'factorial(5, X)',
        tracerPath: 'tracer.pl',
      };

      const wrapper = generateWrapper(original);
      const parsed = parseWrapper(wrapper);

      expect(parsed).not.toBeNull();
      expect(parsed!.prologContent).toBe(original.prologContent);
    });

    it('should handle queries with commas', () => {
      const original: WrapperConfig = {
        prologContent: 'test(X).',
        query: 'test(1), test(2), test(3)',
        tracerPath: 'tracer.pl',
      };

      const wrapper = generateWrapper(original);
      const parsed = parseWrapper(wrapper);

      expect(parsed).not.toBeNull();
      expect(parsed!.query).toBe(original.query);
    });

    it('should return null for invalid wrapper format', () => {
      const invalidWrapper = 'This is not a valid wrapper';
      const parsed = parseWrapper(invalidWrapper);

      expect(parsed).toBeNull();
    });

    it('should return null for wrapper missing tracer path', () => {
      const invalidWrapper = `
% User's Prolog code (no instrumentation)
test.

% Run trace with error handling
run_trace :-
    install_tracer.
`;
      const parsed = parseWrapper(invalidWrapper);

      expect(parsed).toBeNull();
    });
  });

  describe('calculateLineOffset', () => {
    it('should return 4 when content has no leading blank lines', () => {
      const content = 'factorial(0, 1).\nfactorial(N, F) :- N > 0.';
      expect(calculateLineOffset(content)).toBe(4);
    });

    it('should account for leading blank lines stripped by trim()', () => {
      // Content with one leading blank line (like 3_4_arithmetic.pl)
      const content = '\nfactorial(0, 1).\nfactorial(N, F) :- N > 0.';
      expect(calculateLineOffset(content)).toBe(3);
    });

    it('should account for multiple leading blank lines', () => {
      const content = '\n\n\nfactorial(0, 1).';
      expect(calculateLineOffset(content)).toBe(1);
    });

    it('should handle content with only whitespace on leading lines', () => {
      // Lines with spaces/tabs before content are still stripped by trim()
      const content = '  \n\nfactorial(0, 1).';
      expect(calculateLineOffset(content)).toBe(2);
    });
  });

  describe('mapWrapperLineToSource', () => {
    it('should map correctly when content has no leading blank lines', () => {
      const content = 'factorial(0, 1).\nfactorial(N, F) :- N > 0.';
      // Source line 1 → wrapper line 5, so wrapper 5 → source 1
      expect(mapWrapperLineToSource(5, content)).toBe(1);
    });

    it('should map correctly when content has leading blank lines', () => {
      // With one leading blank line: source line 2 → wrapper line 5
      // So wrapper 5 → source 2 (offset = 3)
      const content = '\nfactorial(0, 1).';
      expect(mapWrapperLineToSource(5, content)).toBe(2);
    });
  });

  describe('line mapping with source clause map (regression)', () => {
    it('should map wrapper lines to correct source clauses when file has leading blank lines', () => {
      // Reproduces the 3_4_arithmetic.pl bug: leading blank line caused
      // recursive clause (line 23) to be looked up as base case (line 22)
      const content = '\nllength([], 0).\nllength([_|T], N) :-\n    llength(T, N1),\n    N is N1 + 1.\n';
      const clauseMap = buildSourceClauseMap(content);

      // Source clause map should have line 2 (fact) and line 3 (rule)
      expect(clauseMap[2]?.head).toBe('llength([], 0)');
      expect(clauseMap[3]?.head).toBe('llength([_|T], N)');

      // Wrapper embeds trimmed content starting at wrapper line 5.
      // With 1 leading blank line stripped, source line 2 → wrapper line 5.
      // So tracer reporting wrapper line 5 should map to source line 2 (fact),
      // and wrapper line 6 should map to source line 3 (recursive clause).
      const factSourceLine = mapWrapperLineToSource(5, content);
      const ruleSourceLine = mapWrapperLineToSource(6, content);

      expect(clauseMap[factSourceLine]?.head).toBe('llength([], 0)');
      expect(clauseMap[ruleSourceLine]?.head).toBe('llength([_|T], N)');
    });
  });

  describe('tracer path resolution', () => {
    it('should handle absolute tracer paths', () => {
      const config: WrapperConfig = {
        prologContent: 'test.',
        query: 'test',
        tracerPath: '/absolute/path/to/tracer.pl',
      };

      const wrapper = generateWrapper(config);

      expect(wrapper).toContain(":- ['/absolute/path/to/tracer.pl'].");
    });

    it('should handle relative tracer paths', () => {
      const config: WrapperConfig = {
        prologContent: 'test.',
        query: 'test',
        tracerPath: './tracer.pl',
      };

      const wrapper = generateWrapper(config);

      expect(wrapper).toContain(":- ['./tracer.pl'].");
    });

    it('should handle parent directory tracer paths', () => {
      const config: WrapperConfig = {
        prologContent: 'test.',
        query: 'test',
        tracerPath: '../tracer.pl',
      };

      const wrapper = generateWrapper(config);

      expect(wrapper).toContain(":- ['../tracer.pl'].");
    });
  });
});
