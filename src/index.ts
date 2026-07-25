#!/usr/bin/env node

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { parseArgs, getHelpText, getVersion, getCopyright, CLIOptions, ALL_SOLUTIONS_CAP } from './cli.js';
import { formatError } from './errors.js';
import { createTempWrapper } from './wrapper.js';
import { executeTracer, checkDependencies } from './executor.js';
import * as path from 'node:path';
import { writeOutput, logVerbose, logInfo, logError } from './output.js';
import { parsePrologFile, buildSourceClauseMap } from './clauses.js';
import { TimelineBuilder, TraceEvent, TimelineStep, flattenTimeline } from './timeline.js';
import { splitConjuncts, matchGoalToConjunct, extractQueryBindings } from './query.js';
import { TreeBuilder } from './tree.js';
import { generateMarkdown, ClauseDefinition } from './markdown-generator.js';

/**
 * Read the query's variables out of the finished derivation.
 *
 * Each top-level timeline step is one conjunct of the query, so pairing the
 * conjunct's arguments with the goal as it stood at EXIT gives the bindings in
 * the user's own variable names. Later steps win: a goal that was backtracked
 * into and re-solved supersedes its earlier solution.
 *
 * Returns undefined when nothing could be read, so the caller can fall back.
 */
function extractFinalAnswer(timeline: TimelineStep[], query: string): string | undefined {
  const conjuncts = splitConjuncts(query);
  if (conjuncts.length === 0) return undefined;

  // Insertion order preserved, so variables read in the order first bound.
  const bindings = new Map<string, string>();

  for (const step of timeline) {
    if (!step.exitGoal) continue;
    // Only conjuncts of the query carry the user's variable names; a step
    // rendered at the top level may still be a subgoal re-entered by
    // backtracking, and its clause-local names are not the answer.
    const conjunct = step.subgoalTemplate && conjuncts.includes(step.subgoalTemplate)
      ? step.subgoalTemplate
      : matchGoalToConjunct(step.goal, conjuncts);
    if (!conjunct || !conjuncts.includes(conjunct)) continue;

    for (const { variable, value } of extractQueryBindings(conjunct, step.exitGoal)) {
      bindings.set(variable, value);
    }
  }

  if (bindings.size === 0) return undefined;

  return [...bindings].map(([variable, value]) => `${variable} = ${value}`).join(', ');
}

/**
 * Extract variable names from original query
 * e.g., "factorial(3, X)" -> ["X"]
 */
function extractQueryVariables(query: string): string[] {
  const match = query.match(/\((.*)\)$/);
  if (!match) return [];
  
  const args = match[1].split(',').map(a => a.trim());
  return args.filter(arg => /^[A-Z_]/.test(arg));
}

/**
 * Map internal variable binding to original query variable
 * e.g., "_1606=6" with query "factorial(3, X)" -> "X = 6"
 */
function mapBindingToOriginalQuery(
  binding: string,
  goalWithInternalVars: string,
  originalQuery: string,
  queryVars: string[]
): string {
  // Parse binding: "_1606=6" -> ["_1606", "6"]
  const [internalVar, value] = binding.split('=').map(s => s.trim());
  
  // Parse goals to find position of internal variable
  const goalMatch = goalWithInternalVars.match(/\((.*)\)$/);
  const queryMatch = originalQuery.match(/\((.*)\)$/);
  
  if (!goalMatch || !queryMatch) return binding;
  
  const goalArgs = goalMatch[1].split(',').map(a => a.trim());
  const queryArgs = queryMatch[1].split(',').map(a => a.trim());
  
  // Find which position has the internal variable
  const position = goalArgs.findIndex(arg => arg === internalVar);
  
  if (position >= 0 && position < queryArgs.length) {
    const originalVar = queryArgs[position];
    if (/^[A-Z_]/.test(originalVar)) {
      return `${originalVar} = ${value}`;
    }
  }
  
  return binding;
}

async function main(): Promise<void> {
  const result = parseArgs(process.argv);
  
  if (result.type === 'help') {
    console.log(getHelpText());
    process.exit(0);
  }
  
  if (result.type === 'version') {
    console.log(getVersion());
    process.exit(0);
  }
  
  if (result.type === 'copyright') {
    console.log(getCopyright());
    process.exit(0);
  }

  if (result.type === 'error') {
    logError(formatError(result.error!));
    process.exit(1);
  }
  
  const options = result.options!;

  // Nudge for updates *before* the command. If the user accepts, the notifier
  // installs the new version and re-execs ptv with the same arguments, so
  // the user's command runs transparently on the freshly installed binary.
  // Throttled (once/day) and silent on non-TTY, so the delay is typically zero.
  const { notifyAndMaybeUpdate } = await import('./update-notifier.js');
  await notifyAndMaybeUpdate({ quiet: options.quiet });

  try {
    await run(options);
  } catch (err) {
    logError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

async function run(options: CLIOptions): Promise<void> {
  logVerbose(`Processing ${options.prologFile} with query: ${options.query}`, options);
  
  // Check dependencies
  logVerbose('Checking dependencies...', options);
  const deps = await checkDependencies();
  if (deps.error) {
    logError(formatError(deps.error));
    process.exit(1);
  }
  
  // Read Prolog file
  logVerbose(`Reading ${options.prologFile}...`, options);
  let prologContent: string;
  try {
    prologContent = await fs.readFile(options.prologFile, 'utf-8');
  } catch (err) {
    const { createError, ErrorCode } = await import('./errors.js');
    logError(formatError(createError(ErrorCode.FILE_NOT_FOUND, options.prologFile)));
    process.exit(1);
  }
  
  // Parse Prolog clauses (for display purposes)
  logVerbose('Parsing Prolog clauses...', options);
  const clauses = parsePrologFile(prologContent);
  
  // Build source clause map for preserving original variable names
  const sourceClauseMap = buildSourceClauseMap(prologContent);
  
  // Get absolute path to tracer.pl from package installation
  const tracerPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'tracer.pl');

  // Resolve the source file's directory so relative consult() paths in the
  // user's code work the same as if they ran swipl directly on the file.
  const sourceAbsPath = path.resolve(options.prologFile);
  const sourceDir = path.dirname(sourceAbsPath);

  // Pre-create the temp dir so we can compute an absolute trace.json path
  // and bake it into the wrapper. cwd will be the source dir (so relative
  // consult() paths resolve), so trace.json needs an absolute path.
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prolog-trace-viz-'));
  const absTraceJson = path.join(tempDir, 'trace.json');

  // Create wrapper (no instrumentation needed)
  logVerbose('Creating tracer wrapper...', options);
  const effectiveSolutions = options.allSolutions ? ALL_SOLUTIONS_CAP : options.solutions;

  const tempFile = await createTempWrapper({
    prologContent,
    query: options.query,
    depth: options.depth,
    tracerPath,
    tracePath: absTraceJson,
    tempDir,
    solutions: effectiveSolutions,
  });

  try {
    // Execute custom tracer
    logVerbose('Executing custom tracer...', options);
    const execResult = await executeTracer(tempFile.path, {
      cwd: sourceDir,
      jsonPath: absTraceJson,
    });
    
    logVerbose(`Tracer exit code: ${execResult.exitCode}`, options);
    logVerbose(`JSON length: ${execResult.json?.length || 0}`, options);
    logVerbose(`Stderr: ${execResult.stderr}`, options);
    
    if (execResult.exitCode !== 0 || !execResult.json) {
      logError('Custom tracer execution failed');
      if (execResult.stderr) {
        logError(execResult.stderr);
      }
      process.exit(1);
    }
    
    // Determine output paths based on Prolog file location
    const prologDir = options.prologFile.includes('/') 
      ? options.prologFile.substring(0, options.prologFile.lastIndexOf('/'))
      : '.';
    const prologBasename = options.prologFile.includes('/')
      ? options.prologFile.substring(options.prologFile.lastIndexOf('/') + 1)
      : options.prologFile;
    const nameWithoutExt = prologBasename.replace(/\.pl$/, '');
    
    // Parse JSON trace output
    logVerbose('Parsing JSON trace output...', options);
    const { parseEvents } = await import('./parser.js');
    const traceEvents = parseEvents(execResult.json, prologContent);
    
    // Build timeline
    logVerbose('Building execution timeline...', options);
    const timelineBuilder = new TimelineBuilder(traceEvents, sourceClauseMap, options.query);
    const timeline = timelineBuilder.build();
    const flatTimeline = flattenTimeline(timeline);
    const solutions = timelineBuilder.getSolutions();

    // Build tree (legacy; only for the final-answer fallback). Solution markers
    // aren't goals, so keep them out of its level bookkeeping.
    logVerbose('Building call tree...', options);
    const treeBuilder = new TreeBuilder(traceEvents.filter(e => e.port !== 'solution'), sourceClauseMap, flatTimeline);
    const tree = treeBuilder.build();
    
    // Prepare clause definitions
    const clauseDefinitions: ClauseDefinition[] = clauses.map(c => ({
      line: c.number,
      text: c.text,
    }));
    
    // Generate markdown
    logVerbose('Generating markdown output...', options);
    
    // Read the answer off the top-level goals of the derivation. Falls back to
    // the call tree's root binding, which only ever sees the first conjunct.
    let finalAnswer: string | undefined = extractFinalAnswer(timeline, options.query);
    if (!finalAnswer && tree && tree.finalBinding) {
      // Parse original query to get variable names
      const queryVars = extractQueryVariables(options.query);
      // Map internal variable to original query variable
      finalAnswer = mapBindingToOriginalQuery(tree.finalBinding, tree.goal, options.query, queryVars);
    }
    
    const formatterOptions = {
      debugFlags: options.debugFlags,
      showCallTree: options.showCallTree,
    };

    const markdown = generateMarkdown({
      query: options.query,
      originalQuery: options.query,
      timeline,
      tree,
      clauses: clauseDefinitions,
      finalAnswer,
      solutions,
      formatterOptions,
    });

    // Write output - default to source file location if not specified
    const outputPath = options.output || `${prologDir}/${nameWithoutExt}-output.md`;
    await writeOutput({
      content: markdown,
      outputPath,
      verbose: options.verbose,
      quiet: options.quiet,
    });

    // --split: one file per solution, each a self-contained single-solution
    // trace of that solution's segment of the derivation.
    if (options.split && solutions.length > 0) {
      for (const sol of solutions) {
        const solTimeline = timeline.filter(s => s.solutionIndex === sol.index);
        const solAnswer = sol.bindings.length
          ? sol.bindings.map(b => `${b.variable} = ${b.value}`).join(', ')
          : undefined;
        const solMarkdown = generateMarkdown({
          query: options.query,
          originalQuery: options.query,
          timeline: solTimeline,
          tree,
          clauses: clauseDefinitions,
          finalAnswer: solAnswer,
          solutions: [sol], // length 1 -> single-solution layout
          singleSolutionLabel: `Solution ${sol.index} of ${solutions.length}`,
          formatterOptions,
        });
        await writeOutput({
          content: solMarkdown,
          outputPath: `${prologDir}/${nameWithoutExt}-soln${sol.index}.md`,
          verbose: options.verbose,
          quiet: options.quiet,
        });
      }
    }

    logInfo('Done!', options);
  } finally {
    // Cleanup
    await tempFile.cleanup();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
