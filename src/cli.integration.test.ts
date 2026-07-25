import { describe, it, expect, afterEach } from 'vitest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * CLI Integration Tests
 * 
 * These tests run the actual CLI and verify output behaviour.
 */
describe('CLI Integration Tests', () => {
  const CLI_PATH = 'node dist/index.js';
  
  /**
   * Helper to run CLI and capture output
   */
  function runCLI(args: string): { stdout: string; stderr: string; exitCode: number } {
    try {
      const stdout = execSync(`${CLI_PATH} ${args}`, { 
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (error: any) {
      return { 
        stdout: error.stdout || '', 
        stderr: error.stderr || '', 
        exitCode: error.status || 1 
      };
    }
  }

  describe('help and version flags', () => {
    it('--help shows usage information', () => {
      const result = runCLI('--help');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE:');
      expect(result.stdout).toContain('prolog-trace-viz');
      expect(result.stdout).toContain('OPTIONS:');
      expect(result.stdout).toContain('--debug');
    });

    it('-h shows usage information', () => {
      const result = runCLI('-h');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('USAGE:');
    });

    it('--version shows version number', () => {
      const result = runCLI('--version');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/prolog-trace-viz v\d+\.\d+\.\d+/);
    });

    it('-v shows version number', () => {
      const result = runCLI('-v');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/v\d+\.\d+\.\d+/);
    });

    it('--copyright shows copyright and build info', () => {
      const result = runCLI('--copyright');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('prolog-trace-viz');
      expect(result.stdout).toContain('Copyright');
    });
  });

  describe('error handling', () => {
    it('shows error when no arguments provided', () => {
      const result = runCLI('');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Missing');
    });

    it('shows error when only prolog file provided', () => {
      const result = runCLI('test.pl');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('query');
    });

    it('shows error for unknown flag', () => {
      const result = runCLI('test.pl "query" --unknown-flag');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown option');
    });

    it('shows error for invalid debug flag', () => {
      const result = runCLI('test.pl "query" --debug:invalid-flag');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown debug flag');
    });

    it('shows error for non-existent prolog file', () => {
      const result = runCLI('nonexistent.pl "query"');
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('not found');
    });
  });

  describe('debug flags', () => {
    const tempOutput = '/tmp/ptv-test-output.md';
    
    afterEach(() => {
      // Clean up temp file
      if (fs.existsSync(tempOutput)) {
        fs.unlinkSync(tempOutput);
      }
    });

    it('--debug enables internal-vars flag', () => {
      const result = runCLI(`examples/factorial.pl "factorial(3, X)" -o ${tempOutput}`);
      expect(result.exitCode).toBe(0);
      
      // Run with --debug and check output contains internal vars
      const debugResult = runCLI(`examples/factorial.pl "factorial(3, X)" --debug -o ${tempOutput}`);
      expect(debugResult.exitCode).toBe(0);
      
      const content = fs.readFileSync(tempOutput, 'utf-8');
      // With debug, should show internal var names in parentheses
      expect(content).toMatch(/_\d+/); // Should contain internal var like _1234
    });

    it('--debug:internal-vars enables specific flag', () => {
      const result = runCLI(`examples/factorial.pl "factorial(3, X)" --debug:internal-vars -o ${tempOutput}`);
      expect(result.exitCode).toBe(0);
      
      const content = fs.readFileSync(tempOutput, 'utf-8');
      expect(content).toMatch(/_\d+/); // Should contain internal var
    });

    it('--show-internal-vars is no longer supported', () => {
      const result = runCLI(`examples/factorial.pl "factorial(3, X)" --show-internal-vars -o ${tempOutput}`);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown option');
    });

    it('default output uses clean variable names', () => {
      const result = runCLI(`examples/3_3_operators.pl "t(1+0+1, X)" -o ${tempOutput}`);
      expect(result.exitCode).toBe(0);
      
      const content = fs.readFileSync(tempOutput, 'utf-8');
      // Should use clause variable names like Z, X, not internal names
      expect(content).toContain('X+1+0');
      // Timeline section should not have standalone internal vars (but may have them in debug mode)
      const timelineSection = content.split('## Execution Timeline')[1]?.split('## Call Tree')[0] || '';
      // In clean mode, internal vars should not appear standalone in result lines
      expect(timelineSection).not.toMatch(/=> _\d+ =/);
    });
  });

  describe('output options', () => {
    const tempOutput = '/tmp/ptv-test-output.md';
    
    afterEach(() => {
      if (fs.existsSync(tempOutput)) {
        fs.unlinkSync(tempOutput);
      }
    });

    it('-o writes output to specified file', () => {
      const result = runCLI(`examples/factorial.pl "factorial(3, X)" -o ${tempOutput}`);
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(tempOutput)).toBe(true);
      
      const content = fs.readFileSync(tempOutput, 'utf-8');
      expect(content).toContain('# Prolog Execution Trace');
      expect(content).toContain('factorial(3, X)');
    });

    it('--output writes output to specified file', () => {
      const result = runCLI(`examples/factorial.pl "factorial(3, X)" --output ${tempOutput}`);
      expect(result.exitCode).toBe(0);
      expect(fs.existsSync(tempOutput)).toBe(true);
    });

    it('--depth limits trace depth', () => {
      const result = runCLI(`examples/factorial.pl "factorial(5, X)" --depth 3 -o ${tempOutput}`);
      expect(result.exitCode).toBe(0);
      // Should complete without error even with limited depth
    });
  });

  describe('output format', () => {
    const tempOutput = '/tmp/ptv-test-output.md';
    
    afterEach(() => {
      if (fs.existsSync(tempOutput)) {
        fs.unlinkSync(tempOutput);
      }
    });

    it('generates markdown with required sections (no call tree by default)', () => {
      const result = runCLI(`examples/factorial.pl "factorial(3, X)" -o ${tempOutput}`);
      expect(result.exitCode).toBe(0);
      
      const content = fs.readFileSync(tempOutput, 'utf-8');
      expect(content).toContain('# Prolog Execution Trace');
      expect(content).toContain('## Query');
      expect(content).toContain('## Clause Definitions');
      expect(content).toContain('## Execution Timeline');
      expect(content).not.toContain('## Call Tree');
      expect(content).toContain('## Final Answer');
    });

    it('--tree includes call tree section with mermaid diagram', () => {
      const result = runCLI(`examples/factorial.pl "factorial(3, X)" --tree -o ${tempOutput}`);
      expect(result.exitCode).toBe(0);
      
      const content = fs.readFileSync(tempOutput, 'utf-8');
      expect(content).toContain('## Call Tree');
      expect(content).toContain('```mermaid');
      expect(content).toContain('graph TD');
    });
  });

  describe('multiple solutions', () => {
    const tempOutput = '/tmp/ptv-test-multi.md';
    const splitFiles = ['examples/append-soln1.md', 'examples/append-soln2.md',
                        'examples/append-soln3.md', 'examples/append-soln4.md'];

    afterEach(() => {
      for (const f of [tempOutput, ...splitFiles]) {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
    });

    it('-n enumerates several solutions with a summary table', () => {
      const result = runCLI(`examples/append.pl "append(A, B, [1,2,3])" -n 4 -o ${tempOutput}`);
      expect(result.exitCode).toBe(0);

      const content = fs.readFileSync(tempOutput, 'utf-8');
      expect(content).toContain('## Solutions (4)');
      expect(content).toContain('`A = []`');
      expect(content).toContain('`A = [1,2,3]`');
      expect(content).toContain('Solution 1');
      expect(content).toContain('_Showing 4 solutions._');
    });

    it('default run is still single-solution', () => {
      const result = runCLI(`examples/append.pl "append(A, B, [1,2,3])" -o ${tempOutput}`);
      expect(result.exitCode).toBe(0);

      const content = fs.readFileSync(tempOutput, 'utf-8');
      expect(content).not.toContain('## Solutions (');
      expect(content).toContain('_Showing first solution only._');
    });

    it('--split writes one file per solution', () => {
      const result = runCLI(`examples/append.pl "append(A, B, [1,2,3])" -n 4 --split -o ${tempOutput}`);
      expect(result.exitCode).toBe(0);

      expect(fs.existsSync('examples/append-soln1.md')).toBe(true);
      expect(fs.existsSync('examples/append-soln4.md')).toBe(true);
      const soln4 = fs.readFileSync('examples/append-soln4.md', 'utf-8');
      expect(soln4).toContain('_Solution 4 of 4._');
    });
  });
});
