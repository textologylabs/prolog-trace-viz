import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createError, ErrorCode, ToolError } from './errors.js';

export interface ExecutionResult {
  json: string;
  exitCode: number;
  stderr: string;
}

export interface DependencyStatus {
  swiplInstalled: boolean;
  swiplVersion?: string;
  error?: ToolError;
}

/**
 * Checks if SWI-Prolog is installed and gets its version.
 */
async function checkSwipl(): Promise<{ installed: boolean; version?: string }> {
  return new Promise((resolve) => {
    const proc = spawn('swipl', ['--version']);
    let stdout = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.on('error', () => resolve({ installed: false }));
    
    proc.on('close', (code) => {
      if (code === 0) {
        // Extract version from output like "SWI-Prolog version 8.4.3"
        const versionMatch = stdout.match(/version\s+(\d+\.\d+\.\d+)/i);
        resolve({ 
          installed: true, 
          version: versionMatch ? versionMatch[1] : undefined 
        });
      } else {
        resolve({ installed: false });
      }
    });
  });
}

/**
 * Checks if SWI-Prolog version is >= 7.0 (required for prolog_trace_interception/4).
 */
function checkSwiplVersion(version: string): boolean {
  const parts = version.split('.').map(Number);
  const major = parts[0] || 0;
  return major >= 7;
}

/**
 * Checks all required dependencies.
 */
export async function checkDependencies(): Promise<DependencyStatus> {
  const { installed, version } = await checkSwipl();
  
  if (!installed) {
    return {
      swiplInstalled: false,
      error: createError(ErrorCode.PROLOG_NOT_INSTALLED),
    };
  }
  
  if (version && !checkSwiplVersion(version)) {
    return {
      swiplInstalled: true,
      swiplVersion: version,
      error: createError(
        ErrorCode.PROLOG_VERSION_TOO_OLD,
        `SWI-Prolog version ${version} is too old. Version 7.0 or later is required for custom tracer support.`
      ),
    };
  }
  
  return {
    swiplInstalled: true,
    swiplVersion: version,
  };
}

/**
 * Executes the custom tracer with the given wrapper file and captures the JSON output.
 */
export async function executeTracer(
  wrapperPath: string,
  opts: { cwd?: string; jsonPath?: string } = {}
): Promise<ExecutionResult> {
  const wrapperDir = path.dirname(wrapperPath);
  const jsonPath = opts.jsonPath || path.join(wrapperDir, 'trace.json');
  const cwd = opts.cwd || wrapperDir;

  return new Promise((resolve, reject) => {
    const proc = spawn('swipl', [wrapperPath], {
      cwd,
    });
    
    let stderr = '';
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('error', (err) => {
      reject(createError(ErrorCode.PROLOG_NOT_INSTALLED, err.message));
    });
    
    proc.on('close', async (code) => {
      if (code !== 0) {
        resolve({
          json: '',
          exitCode: code ?? 1,
          stderr,
        });
        return;
      }
      
      // Read the generated trace.json file
      try {
        const json = await fs.readFile(jsonPath, 'utf-8');
        resolve({
          json,
          exitCode: 0,
          stderr,
        });
      } catch (err) {
        // trace.json file might not exist if tracer failed silently
        resolve({
          json: '',
          exitCode: 0,
          stderr: stderr || 'No JSON trace output generated',
        });
      }
    });
  });
}

/**
 * Legacy function for backward compatibility.
 * @deprecated Use executeTracer instead.
 */
export async function executeSldnfdraw(wrapperPath: string): Promise<ExecutionResult> {
  return executeTracer(wrapperPath);
}
