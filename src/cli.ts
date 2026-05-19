import { createError, ErrorCode, ToolError } from './errors.js';
import { BUILD_INFO, COPYRIGHT_NOTICE } from './build-info.js';

/**
 * Available debug flags
 */
export type DebugFlag = 'internal-vars';

/**
 * All supported debug flags
 */
export const ALL_DEBUG_FLAGS: DebugFlag[] = ['internal-vars'];

export interface CLIOptions {
  prologFile: string;
  query: string;
  output?: string;
  depth: number;
  verbose: boolean;
  quiet: boolean;
  debugFlags: Set<DebugFlag>;
  showCallTree: boolean;
}

export interface CLIResult {
  type: 'options' | 'help' | 'version' | 'copyright' | 'error';
  options?: CLIOptions;
  error?: ToolError;
}

const HELP_TEXT = `
${BUILD_INFO.name} v${BUILD_INFO.version} - ${BUILD_INFO.description}

USAGE:
  prolog-trace-viz <prolog-file> <query> [options]

ARGUMENTS:
  <prolog-file>    Path to the Prolog source file
  <query>          Prolog query to trace (e.g., "t(1+0+1, X)")

OPTIONS:
  -o, --output <file>     Write output to file instead of stdout
  --depth <n>             Maximum trace depth (default: 100)
  --tree                  Include call tree diagram (Mermaid) in output
  --debug                 Enable all debug features
  --debug:<flag>          Enable specific debug flag (e.g., --debug:internal-vars)
  --debug:<f1>,<f2>       Enable multiple debug flags (comma-separated)
  --verbose               Display detailed processing information
  --quiet                 Suppress all non-error output except final result
  -h, --help              Show this help message
  -v, --version           Show version number
  --copyright             Show copyright and build information

ptv checks for a newer version automatically (at most once per day) and
offers to update; pass --quiet to suppress that check.

DEBUG FLAGS:
  internal-vars           Show Prolog's internal variable names alongside
                          clause variable names (e.g., "Z (_2008) = value")

EXAMPLES:
  prolog-trace-viz program.pl "append([1,2], [3,4], X)"
  prolog-trace-viz program.pl "member(X, [a,b,c])" -o trace.md
  prolog-trace-viz program.pl "factorial(5, X)" --depth 10 --verbose
  prolog-trace-viz program.pl "t(1+0+1, X)" --tree
  prolog-trace-viz program.pl "t(1+0+1, X)" --debug:internal-vars
`.trim();

export function parseArgs(argv: string[]): CLIResult {
  const args = argv.slice(2); // Skip node and script path
  
  // Check for help flag first
  if (args.includes('-h') || args.includes('--help')) {
    return { type: 'help' };
  }
  
  // Check for version flag
  if (args.includes('-v') || args.includes('--version')) {
    return { type: 'version' };
  }
  
  // Check for copyright flag
  if (args.includes('--copyright')) {
    return { type: 'copyright' };
  }
  
  const options: Partial<CLIOptions> = {
    depth: 100,
    verbose: false,
    quiet: false,
    debugFlags: new Set<DebugFlag>(),
    showCallTree: false,
  };
  
  const positionalArgs: string[] = [];
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '-o' || arg === '--output') {
      const nextArg = args[++i];
      if (!nextArg || nextArg.startsWith('-')) {
        return {
          type: 'error',
          error: createError(ErrorCode.INVALID_ARGS, `${arg} requires a file path argument`),
        };
      }
      options.output = nextArg;
    } else if (arg === '--depth') {
      const nextArg = args[++i];
      if (!nextArg || nextArg.startsWith('-')) {
        return {
          type: 'error',
          error: createError(ErrorCode.INVALID_ARGS, '--depth requires a numeric argument'),
        };
      }
      const depth = parseInt(nextArg, 10);
      if (isNaN(depth) || depth < 1) {
        return {
          type: 'error',
          error: createError(ErrorCode.INVALID_ARGS, `Invalid depth value: ${nextArg}. Must be a positive integer.`),
        };
      }
      options.depth = depth;
    } else if (arg === '--debug') {
      // Enable all debug flags
      for (const flag of ALL_DEBUG_FLAGS) {
        options.debugFlags!.add(flag);
      }
    } else if (arg.startsWith('--debug:')) {
      // Parse specific debug flags
      const flagsPart = arg.slice('--debug:'.length);
      const flagNames = flagsPart.split(',').map(f => f.trim());
      
      for (const flagName of flagNames) {
        if (flagName === '*' || flagName === 'all') {
          // --debug:* or --debug:all enables all flags
          for (const flag of ALL_DEBUG_FLAGS) {
            options.debugFlags!.add(flag);
          }
        } else if (ALL_DEBUG_FLAGS.includes(flagName as DebugFlag)) {
          options.debugFlags!.add(flagName as DebugFlag);
        } else {
          return {
            type: 'error',
            error: createError(
              ErrorCode.INVALID_ARGS,
              `Unknown debug flag: ${flagName}. Available flags: ${ALL_DEBUG_FLAGS.join(', ')}`
            ),
          };
        }
      }
    } else if (arg === '--tree') {
      options.showCallTree = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--quiet') {
      options.quiet = true;
    } else if (arg.startsWith('-')) {
      return {
        type: 'error',
        error: createError(ErrorCode.INVALID_ARGS, `Unknown option: ${arg}`),
      };
    } else {
      positionalArgs.push(arg);
    }
  }
  
  // Validate required positional arguments
  if (positionalArgs.length < 2) {
    const missing = positionalArgs.length === 0 
      ? 'prolog file and query' 
      : 'query';
    return {
      type: 'error',
      error: createError(
        ErrorCode.INVALID_ARGS,
        `Missing required argument: ${missing}`,
      ),
    };
  }
  
  if (positionalArgs.length > 2) {
    return {
      type: 'error',
      error: createError(
        ErrorCode.INVALID_ARGS,
        `Too many arguments. Expected 2 positional arguments, got ${positionalArgs.length}`,
      ),
    };
  }
  
  // Validate verbose and quiet aren't both set
  if (options.verbose && options.quiet) {
    return {
      type: 'error',
      error: createError(
        ErrorCode.INVALID_ARGS,
        'Cannot use both --verbose and --quiet',
      ),
    };
  }
  
  return {
    type: 'options',
    options: {
      prologFile: positionalArgs[0],
      query: positionalArgs[1],
      output: options.output,
      depth: options.depth!,
      verbose: options.verbose!,
      quiet: options.quiet!,
      debugFlags: options.debugFlags!,
      showCallTree: options.showCallTree!,
    },
  };
}

export function getHelpText(): string {
  return HELP_TEXT;
}

export function getVersion(): string {
  return `${BUILD_INFO.name} v${BUILD_INFO.version}`;
}

export function getCopyright(): string {
  return COPYRIGHT_NOTICE;
}

export function getBuildInfo() {
  return BUILD_INFO;
}
