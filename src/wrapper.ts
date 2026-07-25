import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { extractQueryVariables } from './query.js';

export interface WrapperConfig {
  prologContent: string;
  query: string;
  depth?: number;
  tracerPath: string;
  /** Absolute path for the trace.json output. Defaults to 'trace.json' (cwd-relative). */
  tracePath?: string;
  /** How many solutions to enumerate (default 1). */
  solutions?: number;
}

export interface TempFile {
  path: string;
  cleanup: () => Promise<void>;
}

/**
 * Generates the custom tracer wrapper file content.
 * The wrapper includes:
 * - Custom tracer import
 * - User's Prolog code (loaded without instrumentation)
 * - Query execution with tracer installed
 * - JSON export after query
 * - Tracer cleanup
 */
export function generateWrapper(config: WrapperConfig): string {
  const { prologContent, query, depth, tracerPath, tracePath } = config;
  const maxDepth = depth || 100; // Default to 100 if not specified
  const solutions = Math.max(1, config.solutions ?? 1);
  // Strip trailing '.' from the query - it's a clause terminator that breaks
  // when the query is inlined as a sub-goal of run_trace.
  const cleanQuery = query.trim().replace(/\.\s*$/, '');
  const traceOutPath = (tracePath || 'trace.json').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  // Enumerate up to N solutions under trace. findnsols/4 backtracks through the
  // query collecting up to N solutions, so the trace captures the inter-solution
  // backtracking, then stops. record_solution/1 injects a boundary marker with
  // the query variables' bindings at each solution.
  const queryVars = extractQueryVariables(cleanQuery);
  const varList = `[${queryVars.map(v => `'${v}'=${v}`).join(', ')}]`;
  const tracedGoal =
    `findnsols(${solutions}, _, (${cleanQuery}, record_solution(${varList})), _)`;
  
  const lines: string[] = [
    `% Load custom tracer`,
    `:- ['${tracerPath}'].`,
    '',
    `% User's Prolog code (no instrumentation)`,
  ];
  
  // Add user content and track line mapping
  const userLines = prologContent.trim().split('\n');
  const wrapperStartLine = lines.length + 1; // +1 for 1-based indexing
  
  lines.push(...userLines);
  lines.push('');
  lines.push('% Run trace with error handling');
  lines.push('run_trace :-');
  lines.push(`    install_tracer(${maxDepth}),`);
  lines.push('    catch(');
  lines.push(`        (${tracedGoal}, export_trace_json('${traceOutPath}')),`);
  lines.push('        Error,');
  lines.push(`        (format('Error: ~w~n', [Error]), export_trace_json('${traceOutPath}'))`);
  lines.push('    ),');
  lines.push('    remove_tracer.');
  lines.push('');
  lines.push(':- run_trace.');
  lines.push(':- halt.');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Calculates the line offset between wrapper file and original source file.
 * This is needed because the tracer reports line numbers from the wrapper file,
 * but we need to map them back to the original source file line numbers.
 */
export function calculateLineOffset(prologContent: string): number {
  // The wrapper adds 4 lines before the user content:
  // Line 1: % Load custom tracer
  // Line 2: :- ['tracerPath'].
  // Line 3: (empty)
  // Line 4: % User's Prolog code (no instrumentation)
  // Line 5+: User content starts here

  // generateWrapper() calls prologContent.trim(), which strips leading blank lines.
  // We must account for those stripped lines so wrapper line numbers map back correctly.
  const leadingWhitespace = prologContent.slice(0, prologContent.length - prologContent.trimStart().length);
  const strippedLeadingLines = (leadingWhitespace.match(/\n/g) || []).length;

  return 4 - strippedLeadingLines;
}

/**
 * Maps a line number from the wrapper file back to the original source file.
 */
export function mapWrapperLineToSource(wrapperLine: number, prologContent: string): number {
  const offset = calculateLineOffset(prologContent);
  
  // Simple mapping: wrapper line - offset = source line
  // The wrapper includes all source lines as-is, so no need to skip empty lines or comments
  return wrapperLine - offset;
}
export async function createTempWrapper(
  config: WrapperConfig & { tempDir?: string }
): Promise<TempFile> {
  const content = generateWrapper(config);
  const tempDir = config.tempDir ?? await fs.mkdtemp(path.join(os.tmpdir(), 'prolog-trace-viz-'));
  const wrapperPath = path.join(tempDir, 'wrapper.pl');
  
  await fs.writeFile(wrapperPath, content, 'utf-8');
  
  return {
    path: wrapperPath,
    cleanup: async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Serializes a wrapper back to its component parts (for testing round-trips).
 * Returns null if the content doesn't match expected wrapper format.
 */
export function parseWrapper(content: string): WrapperConfig | null {
  // Extract tracer path
  const tracerMatch = content.match(/:-\s*\['([^']+)'\]\./);
  if (!tracerMatch) {
    return null;
  }
  const tracerPath = tracerMatch[1];
  
  // Extract the query from the findnsols enumeration goal:
  //   findnsols(N, _, (QUERY, record_solution([...])), _)
  const queryMatch = content.match(/findnsols\([^,]+,\s*_,\s*\(([\s\S]*?),\s*record_solution\(/);
  if (!queryMatch) {
    return null;
  }
  const query = queryMatch[1].trim();
  
  // Extract user's Prolog content (between tracer load and run_trace)
  const contentMatch = content.match(/:-\s*\['[^']+'\]\.\s*\n\s*%\s*User's Prolog code[^\n]*\n([\s\S]*?)\n\s*%\s*Run trace/);
  if (!contentMatch) {
    return null;
  }
  const prologContent = contentMatch[1].trim();
  
  return {
    prologContent,
    query,
    tracerPath,
  };
}
