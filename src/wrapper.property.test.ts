import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { generateWrapper, parseWrapper, WrapperConfig } from './wrapper.js';

describe('Wrapper Generator - Property Tests', () => {
  /**
   * **Feature: custom-tracer-integration, Property 8: Code preservation**
   * **Validates: Requirements 3.2**
   * 
   * For any Prolog file, the content loaded by the tracer should be identical to the 
   * original file content (no instrumentation markers added).
   */
  it('Property 8: Code preservation', () => {
    // Generate arbitrary Prolog-like content
    const arbitraryPrologContent = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_(),. \n:-'),
      { minLength: 1, maxLength: 200 }
    ).filter(s => s.trim().length > 0);

    const arbitraryQuery = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_(),. '),
      { minLength: 1, maxLength: 100 }
    ).filter(s => s.trim().length > 0);

    const arbitraryTracerPath = fc.constantFrom(
      'tracer.pl',
      '/path/to/tracer.pl',
      './tracer.pl',
      '../tracer.pl'
    );

    fc.assert(
      fc.property(
        arbitraryPrologContent,
        arbitraryQuery,
        arbitraryTracerPath,
        (prologContent, query, tracerPath) => {
          const config: WrapperConfig = { prologContent, query, tracerPath };
          const wrapper = generateWrapper(config);

          // Verify the prolog content appears in the wrapper exactly as provided
          // (no instrumentation markers like trace_call/3 or clause_marker/2)
          expect(wrapper).toContain(prologContent.trim());
          
          // Verify no instrumentation markers are present
          expect(wrapper).not.toContain('trace_call');
          expect(wrapper).not.toContain('clause_marker');
          expect(wrapper).not.toContain('begin_program');
          expect(wrapper).not.toContain('end_program');
          
          // Verify the wrapper uses the custom tracer
          expect(wrapper).toContain('install_tracer');
          expect(wrapper).toContain('export_trace_json');
          expect(wrapper).toContain('remove_tracer');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Wrapper structure validation
   * 
   * For any Prolog file content and query string, the generated wrapper file SHALL contain
   * the tracer loading, user code, and query execution with proper error handling.
   */
  it('Wrapper structure validation', () => {
    // Generate arbitrary Prolog-like content (avoiding special regex chars for simplicity)
    const arbitraryPrologContent = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_(),. \n'),
      { minLength: 1, maxLength: 200 }
    ).filter(s => s.trim().length > 0);

    const arbitraryQuery = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_(),. '),
      { minLength: 1, maxLength: 100 }
    ).filter(s => s.trim().length > 0);

    const arbitraryTracerPath = fc.constantFrom(
      'tracer.pl',
      '/path/to/tracer.pl',
      './tracer.pl'
    );

    fc.assert(
      fc.property(
        arbitraryPrologContent,
        arbitraryQuery,
        arbitraryTracerPath,
        (prologContent, query, tracerPath) => {
          const config: WrapperConfig = { prologContent, query, tracerPath };
          const wrapper = generateWrapper(config);

          // Verify tracer is loaded
          expect(wrapper).toContain(`:- ['${tracerPath}'].`);

          // Verify the prolog content is included
          expect(wrapper).toContain(prologContent.trim());

          // Verify run_trace predicate exists
          expect(wrapper).toContain('run_trace :-');
          
          // Verify tracer lifecycle
          expect(wrapper).toContain('install_tracer');
          expect(wrapper).toContain('export_trace_json');
          expect(wrapper).toContain('remove_tracer');
          
          // Verify error handling
          expect(wrapper).toContain('catch(');
          
          // Verify query is included
          expect(wrapper).toContain(query.trim());
          
          // Verify execution directives
          expect(wrapper).toContain(':- run_trace.');
          expect(wrapper).toContain(':- halt.');
        }
      ),
      { numRuns: 100 }
    );
  });

  it('round-trip: parseWrapper recovers original config', () => {
    const arbitraryPrologContent = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_(),. \n'),
      { minLength: 1, maxLength: 200 }
    ).filter(s => s.trim().length > 0);

    const arbitraryQuery = fc.stringOf(
      fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_(),. '),
      { minLength: 1, maxLength: 100 }
    ).filter(s => s.trim().length > 0);

    const arbitraryTracerPath = fc.constantFrom(
      'tracer.pl',
      '/path/to/tracer.pl',
      './tracer.pl'
    );

    fc.assert(
      fc.property(
        arbitraryPrologContent,
        arbitraryQuery,
        arbitraryTracerPath,
        (prologContent, query, tracerPath) => {
          const config: WrapperConfig = { prologContent, query, tracerPath };
          const wrapper = generateWrapper(config);
          const parsed = parseWrapper(wrapper);

          expect(parsed).not.toBeNull();
          expect(parsed!.prologContent).toBe(prologContent.trim());
          expect(parsed!.query).toBe(query.trim().replace(/\.\s*$/, ''));
          expect(parsed!.tracerPath).toBe(tracerPath);
        }
      ),
      { numRuns: 100 }
    );
  });
});
