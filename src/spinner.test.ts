/**
 * Spinner Tests
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { Spinner, SPINNER_FRAMES } from './spinner.js';

/** A fake write stream that records everything written to it. */
function fakeStream(isTTY: boolean): NodeJS.WriteStream & { writes: string[] } {
  const writes: string[] = [];
  return {
    isTTY,
    write: (chunk: string) => {
      writes.push(chunk);
      return true;
    },
    writes,
  } as unknown as NodeJS.WriteStream & { writes: string[] };
}

describe('Spinner', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes a non-empty set of animation frames', () => {
    expect(SPINNER_FRAMES.length).toBeGreaterThan(1);
  });

  it('reports the current frame from the frame set', () => {
    const spinner = new Spinner(fakeStream(true));
    expect(SPINNER_FRAMES).toContain(spinner.frame);
  });

  describe('non-TTY stream', () => {
    it('does not animate or write while spinning', () => {
      const stream = fakeStream(false);
      const spinner = new Spinner(stream);

      spinner.start('Working...');

      expect(spinner.isSpinning).toBe(false);
      expect(stream.writes).toHaveLength(0);
    });

    it('writes only the final status line on succeed', () => {
      const stream = fakeStream(false);
      const spinner = new Spinner(stream);

      spinner.start('Working...');
      spinner.succeed('Done');

      expect(stream.writes.join('')).toBe('✔ Done\n');
    });

    it('writes the failure mark on fail', () => {
      const stream = fakeStream(false);
      new Spinner(stream).start('Working...').fail('Broke');

      expect(stream.writes.join('')).toBe('✖ Broke\n');
    });
  });

  describe('TTY stream', () => {
    it('animates and advances frames over time', () => {
      vi.useFakeTimers();
      const stream = fakeStream(true);
      const spinner = new Spinner(stream);

      spinner.start('Loading');
      expect(spinner.isSpinning).toBe(true);
      const firstFrame = spinner.frame;

      vi.advanceTimersByTime(80);
      expect(spinner.frame).not.toBe(firstFrame);

      spinner.stop();
      expect(spinner.isSpinning).toBe(false);
    });

    it('renders the label and a success line on succeed', () => {
      vi.useFakeTimers();
      const stream = fakeStream(true);
      const spinner = new Spinner(stream);

      spinner.start('Loading');
      spinner.succeed('Finished');

      const output = stream.writes.join('');
      expect(output).toContain('Loading');
      expect(output).toContain('✔ Finished');
    });
  });
});
