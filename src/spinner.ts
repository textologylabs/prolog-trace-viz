/**
 * Spinner - a minimal terminal progress animation (the "turning thing").
 *
 * On an interactive terminal (TTY) it renders an animated spinner that updates
 * in place. On a non-TTY stream (pipe, file, CI logs) it degrades gracefully:
 * the animation is skipped and only the final status line is emitted, so piped
 * output stays clean.
 */

/** Animation frames, cycled in order. A classic rotating braille spinner. */
export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Delay between frames, in milliseconds. */
export const SPINNER_INTERVAL_MS = 80;

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const CLEAR_LINE = '\r\x1b[2K';

export class Spinner {
  private frameIndex = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private text = '';
  private readonly stream: NodeJS.WriteStream;
  private readonly isTTY: boolean;

  constructor(stream: NodeJS.WriteStream = process.stderr) {
    this.stream = stream;
    this.isTTY = Boolean(stream.isTTY);
  }

  /** The glyph for the current animation frame. */
  get frame(): string {
    return SPINNER_FRAMES[this.frameIndex % SPINNER_FRAMES.length];
  }

  /** Whether the spinner is currently animating. */
  get isSpinning(): boolean {
    return this.timer !== null;
  }

  /** Start the animation with the given label. */
  start(text: string): this {
    this.text = text;
    if (!this.isTTY) {
      return this;
    }
    this.stream.write(HIDE_CURSOR);
    this.render();
    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length;
      this.render();
    }, SPINNER_INTERVAL_MS);
    // Don't let the spinner timer keep the process alive on its own.
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
    return this;
  }

  /** Update the spinner label without interrupting the animation. */
  setText(text: string): this {
    this.text = text;
    if (this.isTTY && this.timer) {
      this.render();
    }
    return this;
  }

  /** Stop the animation, leaving the line cleared. */
  stop(): this {
    this.stopTimer();
    if (this.isTTY) {
      this.stream.write(CLEAR_LINE + SHOW_CURSOR);
    }
    return this;
  }

  /** Stop the animation with a success mark and final message. */
  succeed(text?: string): this {
    return this.finish('✔', text);
  }

  /** Stop the animation with a failure mark and final message. */
  fail(text?: string): this {
    return this.finish('✖', text);
  }

  private finish(symbol: string, text?: string): this {
    this.stopTimer();
    const message = text ?? this.text;
    if (this.isTTY) {
      this.stream.write(CLEAR_LINE);
    }
    this.stream.write(`${symbol} ${message}\n`);
    if (this.isTTY) {
      this.stream.write(SHOW_CURSOR);
    }
    return this;
  }

  private render(): void {
    this.stream.write(`${CLEAR_LINE}${this.frame} ${this.text}`);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
