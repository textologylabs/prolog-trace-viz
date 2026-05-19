/**
 * Prompt Tests
 */

import { describe, it, expect } from 'vitest';
import { interpretYesNo, promptYesNo } from './prompt.js';

describe('interpretYesNo', () => {
  it('treats "y" and "yes" as yes (case-insensitive, trimmed)', () => {
    expect(interpretYesNo('y', true)).toBe(true);
    expect(interpretYesNo('Y', true)).toBe(true);
    expect(interpretYesNo('yes', false)).toBe(true);
    expect(interpretYesNo('  YES  ', false)).toBe(true);
  });

  it('treats other non-empty answers as no', () => {
    expect(interpretYesNo('n', true)).toBe(false);
    expect(interpretYesNo('no', true)).toBe(false);
    expect(interpretYesNo('nope', true)).toBe(false);
  });

  it('uses the default for an empty answer', () => {
    expect(interpretYesNo('', true)).toBe(true);
    expect(interpretYesNo('   ', true)).toBe(true);
    expect(interpretYesNo('', false)).toBe(false);
  });
});

describe('promptYesNo', () => {
  it('returns the default without prompting on non-interactive stdin', async () => {
    const nonTTY = { isTTY: false } as NodeJS.ReadStream;

    await expect(promptYesNo('Install it now?', { defaultYes: true, input: nonTTY })).resolves.toBe(true);
    await expect(promptYesNo('Install it now?', { defaultYes: false, input: nonTTY })).resolves.toBe(false);
  });
});
