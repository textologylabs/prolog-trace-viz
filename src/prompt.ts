/**
 * Prompt - a minimal interactive yes/no confirmation.
 *
 * On a non-interactive stdin (no TTY - e.g. piped input or CI) the prompt
 * cannot be answered, so the configured default is used instead.
 */

import * as readline from 'node:readline';

/**
 * Interpret a raw yes/no answer string.
 * An empty answer takes the default; otherwise "y"/"yes" mean yes.
 */
export function interpretYesNo(answer: string, defaultYes: boolean): boolean {
  const normalized = answer.trim().toLowerCase();
  if (normalized === '') {
    return defaultYes;
  }
  return normalized === 'y' || normalized === 'yes';
}

export interface PromptOptions {
  /** Answer used for an empty response and for non-interactive stdin. */
  defaultYes?: boolean;
  input?: NodeJS.ReadStream;
  output?: NodeJS.WriteStream;
}

/**
 * Ask a yes/no question and resolve to the user's choice.
 * The prompt suffix reflects the default: "(Y/n)" or "(y/N)".
 */
export async function promptYesNo(question: string, options: PromptOptions = {}): Promise<boolean> {
  const defaultYes = options.defaultYes ?? true;
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stderr;

  // Without an interactive terminal there is no way to ask - use the default.
  if (!input.isTTY) {
    return defaultYes;
  }

  const rl = readline.createInterface({ input, output });
  try {
    const suffix = defaultYes ? '(Y/n)' : '(y/N)';
    const answer = await new Promise<string>(resolve => {
      rl.question(`${question} ${suffix} `, resolve);
    });
    return interpretYesNo(answer, defaultYes);
  } finally {
    rl.close();
  }
}
