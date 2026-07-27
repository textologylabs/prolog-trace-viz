/**
 * Markdown Output Generator - Generates complete markdown document
 */

import { TimelineStep, Solution } from './timeline.js';
import { TreeNode } from './tree.js';
import { formatTimeline, TimelineFormatterOptions } from './timeline-formatter.js';
import { formatTimelineAsMermaid, TreeFormatterOptions } from './tree-formatter.js';

import { DebugFlag } from './cli.js';
import { LabelMode, buildColoring, buildLabelMap, buildBindingEnvironment } from './coref.js';

export interface ClauseDefinition {
  line: number;
  text: string;
}

export interface FormatterOptions {
  debugFlags?: Set<DebugFlag>;
  showCallTree?: boolean;
}

export interface MarkdownContext {
  query: string;
  originalQuery?: string;
  timeline: TimelineStep[];
  tree: TreeNode | null;
  clauses: ClauseDefinition[];
  finalAnswer?: string;
  solutions?: Solution[];
  /** Footer label for a single-solution doc (e.g. a split file): "Solution 2 of 4". */
  singleSolutionLabel?: string;
  truncated?: boolean;
  maxDepth?: number;
  formatterOptions?: FormatterOptions;
  /** Variable-labeling mode (auto/source/full). */
  labelMode?: LabelMode;
  /** Coreference detail level (0 off … 3). */
  corefLevel?: number;
}

/** True when the trace enumerated more than one solution. */
function isMultiSolution(context: MarkdownContext): boolean {
  return (context.solutions?.length ?? 0) > 1;
}

/**
 * Generate complete markdown document
 */
export function generateMarkdown(context: MarkdownContext): string {
  const sections: string[] = [];
  
  // Title
  sections.push(generateTitle(context));
  sections.push('');
  
  // Original query
  sections.push(generateQuerySection(context));
  sections.push('');
  
  // Clause definitions
  sections.push(generateClausesSection(context));
  sections.push('');

  // Solutions summary (only when more than one solution was enumerated)
  if (isMultiSolution(context)) {
    sections.push(generateSolutionsSection(context));
    sections.push('');
  }

  // Timeline
  sections.push(generateTimelineSection(context));
  sections.push('');

  // Binding-environment panel (--coref:3): the substitution trail.
  if ((context.corefLevel ?? 0) >= 3 && context.query && context.labelMode) {
    sections.push(generateBindingPanel(context));
    sections.push('');
  }

  // Tree (only if showCallTree is enabled)
  if (context.formatterOptions?.showCallTree) {
    sections.push(generateTreeSection(context));
    sections.push('');
  }
  
  // Final answer
  sections.push(generateFinalAnswerSection(context));
  
  return sections.join('\n');
}

/**
 * Generate document title
 */
function generateTitle(context: MarkdownContext): string {
  const query = context.originalQuery || context.query;
  return `# Prolog Execution Trace: ${query}`;
}

/**
 * Generate query section
 */
function generateQuerySection(context: MarkdownContext): string {
  const query = context.originalQuery || context.query;
  return [
    '## Query',
    '',
    '```',
    query,
    '```',
  ].join('\n');
}

/**
 * Generate clauses section
 */
function generateClausesSection(context: MarkdownContext): string {
  const lines: string[] = [];
  
  lines.push('## Clause Definitions');
  lines.push('');
  
  if (context.clauses.length === 0) {
    lines.push('_No clauses found._');
    return lines.join('\n');
  }
  
  // Table header
  lines.push('| Line # | Clause |');
  lines.push('|--------|--------|');
  
  // Table rows
  for (const clause of context.clauses) {
    lines.push(`| ${clause.line} | \`${clause.text}\` |`);
  }
  
  return lines.join('\n');
}

/**
 * Generate timeline section
 */
function generateTimelineSection(context: MarkdownContext): string {
  const lines: string[] = [];
  
  lines.push('## Execution Timeline');
  lines.push('');
  
  if (context.timeline.length === 0) {
    lines.push('_No execution steps recorded._');
    return lines.join('\n');
  }
  
  const formatterOptions: TimelineFormatterOptions = {
    debugFlags: context.formatterOptions?.debugFlags ?? new Set(),
    solutionCount: context.solutions?.length,
    labelMode: context.labelMode,
    query: context.query,
    corefLevel: context.corefLevel,
  };

  // Emit the box-drawing timeline as a raw <pre> with a tightened line-height
  // baked in. A plain ``` fence renders monospace but inherits the viewer's
  // loose code line-height, so the │ ┌ └ rails break into gappy/dotted lines.
  // Baking line-height here makes the fix travel inside the .md itself — no
  // reader-side CSS needed. (GitHub sanitizes the style attribute and falls
  // back to a normal monospace block; MPE and article HTML honor it.)
  // <pre> is a CommonMark HTML block, so the blank lines between steps are
  // preserved. Escape HTML metacharacters since goals can contain < > &.
  const timelineText = formatTimeline(context.timeline, formatterOptions);
  const colourActive = (context.corefLevel ?? 0) >= 2 && !!context.labelMode && !!context.query;

  if (colourActive) {
    // Colour layer (--coref:2): the formatter already emitted HTML-escaped text
    // with variable <span>s, so do not re-escape. Emit the theme-aware <style>
    // first (outside the <pre>).
    const coloring = buildColoring(context.timeline, context.query);
    lines.push(coloring.css());
    lines.push('<pre style="line-height: 1.15">');
    lines.push(timelineText);
    lines.push('</pre>');
    if (coloring.capped) {
      lines.push('');
      lines.push('_Some coreference classes are left uncoloured (palette exhausted); their names still disambiguate them._');
    }
  } else {
    lines.push('<pre style="line-height: 1.15">');
    lines.push(escapeHtml(timelineText));
    lines.push('</pre>');
  }

  return lines.join('\n');
}

/**
 * Escape HTML metacharacters for safe embedding inside a raw <pre> block.
 * Prolog goals legitimately contain <, >, and & (e.g. `N > 0`, `X =< Y`).
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Generate the binding-environment panel (--coref:3): the substitution trail,
 * one row per coreference class with the value it resolved to. Coreferring
 * variables share a row (joined by ≡) and the class colour.
 */
function generateBindingPanel(context: MarkdownContext): string {
  const labelMap = buildLabelMap(context.timeline, context.query, context.labelMode!);
  const coloring = buildColoring(context.timeline, context.query);
  const rows = buildBindingEnvironment(context.timeline, context.query, labelMap, coloring);

  const lines: string[] = ['## Variable Bindings', ''];
  if (rows.length === 0) {
    lines.push('_No variables were bound._');
    return lines.join('\n');
  }
  lines.push('| Variable | Binding | Bound at |');
  lines.push('|----------|---------|----------|');
  for (const row of rows) {
    const names = row.labels.join(' ≡ ');
    const cell = row.colourId !== null ? `<span class="ptv-c${row.colourId}">${names}</span>` : names;
    lines.push(`| ${cell} | \`${row.value}\` | Step ${row.whereStep} |`);
  }
  return lines.join('\n');
}

/**
 * Generate the solutions summary table (multi-solution traces only).
 */
function generateSolutionsSection(context: MarkdownContext): string {
  const lines: string[] = [];
  const solutions = context.solutions ?? [];

  lines.push(`## Solutions (${solutions.length})`);
  lines.push('');
  lines.push('| # | Bindings |');
  lines.push('|---|----------|');
  for (const sol of solutions) {
    const bindings = sol.bindings.length
      ? sol.bindings.map(b => `\`${b.variable} = ${b.value}\``).join(', ')
      : '_(no variables — succeeded)_';
    lines.push(`| ${sol.index} | ${bindings} |`);
  }

  return lines.join('\n');
}

/**
 * Generate tree section
 */
function generateTreeSection(context: MarkdownContext): string {
  const lines: string[] = [];

  lines.push('## Call Tree');
  lines.push('');

  if (context.timeline.length === 0) {
    lines.push('_No call tree available._');
    return lines.join('\n');
  }

  const query = context.originalQuery || context.query;
  const formatterOptions: TreeFormatterOptions = {
    debugFlags: context.formatterOptions?.debugFlags ?? new Set(),
    labelMode: context.labelMode,
    query,
  };

  lines.push('```mermaid');
  lines.push(formatTimelineAsMermaid(context.timeline, query, context.finalAnswer, formatterOptions, context.solutions));
  lines.push('```');

  return lines.join('\n');
}

/**
 * Generate final answer section
 */
function generateFinalAnswerSection(context: MarkdownContext): string {
  const lines: string[] = [];

  // Multi-solution: the Solutions table above already lists every answer, so
  // just close with a count note rather than repeating a single "final answer".
  if (isMultiSolution(context)) {
    if (context.truncated && context.maxDepth) {
      lines.push(`_Note: Trace truncated at depth ${context.maxDepth}_`);
      lines.push('');
    }
    lines.push(`_Showing ${context.solutions!.length} solutions._`);
    return lines.join('\n');
  }

  lines.push('## Final Answer');
  lines.push('');

  if (context.finalAnswer) {
    lines.push('```');
    lines.push(context.finalAnswer);
    lines.push('```');
  } else if ((context.solutions?.length ?? 0) > 0) {
    // A ground query that succeeded: no query variables, so there are no
    // bindings to report. This is Prolog's plain "yes".
    lines.push("**Yes** — the query is true. _(No variables in the query, so there are no bindings to report.)_");
  } else {
    // No solution was recorded: the query could not be proved. Prolog's "no".
    lines.push('**No** — the query is not provable.');
  }

  // Add notes about truncation or first solution
  if (context.truncated && context.maxDepth) {
    lines.push('');
    lines.push(`_Note: Trace truncated at depth ${context.maxDepth}_`);
  }

  // Closing note. Three cases:
  //  - split per-solution file: keep the explicit "Solution N of M" label.
  //  - single successful solution (default): point the reader at how to see
  //    the rest — there may be more solutions the trace didn't pursue.
  //  - failure (no solution recorded): say nothing. "Showing first solution
  //    only" is nonsense when there is no solution.
  if (context.singleSolutionLabel) {
    lines.push('');
    lines.push(`_${context.singleSolutionLabel}._`);
  } else if ((context.solutions?.length ?? 0) > 0) {
    lines.push('');
    lines.push('_Showing the first solution only — re-run with `-n <count>` or `--all` to see more._');
  }

  return lines.join('\n');
}
