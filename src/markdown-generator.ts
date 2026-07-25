/**
 * Markdown Output Generator - Generates complete markdown document
 */

import { TimelineStep } from './timeline.js';
import { TreeNode } from './tree.js';
import { formatTimeline, TimelineFormatterOptions } from './timeline-formatter.js';
import { formatTimelineAsMermaid, TreeFormatterOptions } from './tree-formatter.js';

import { DebugFlag } from './cli.js';

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
  truncated?: boolean;
  maxDepth?: number;
  formatterOptions?: FormatterOptions;
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
  
  // Timeline
  sections.push(generateTimelineSection(context));
  sections.push('');
  
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
  };
  
  lines.push(formatTimeline(context.timeline, formatterOptions));
  
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

  const formatterOptions: TreeFormatterOptions = {
    debugFlags: context.formatterOptions?.debugFlags ?? new Set(),
  };

  const query = context.originalQuery || context.query;
  lines.push('```mermaid');
  lines.push(formatTimelineAsMermaid(context.timeline, query, context.finalAnswer, formatterOptions));
  lines.push('```');

  return lines.join('\n');
}

/**
 * Generate final answer section
 */
function generateFinalAnswerSection(context: MarkdownContext): string {
  const lines: string[] = [];
  
  lines.push('## Final Answer');
  lines.push('');
  
  if (context.finalAnswer) {
    lines.push('```');
    lines.push(context.finalAnswer);
    lines.push('```');
  } else {
    lines.push('Query succeeded with no bindings.');
  }
  
  // Add notes about truncation or first solution
  if (context.truncated && context.maxDepth) {
    lines.push('');
    lines.push(`_Note: Trace truncated at depth ${context.maxDepth}_`);
  }
  
  lines.push('');
  lines.push('_Showing first solution only._');
  
  return lines.join('\n');
}
