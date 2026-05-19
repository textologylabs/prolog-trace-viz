/**
 * Update notifier - the automatic, throttled "is a newer ptv available?"
 * check that runs after a normal command and nudges the user to update.
 *
 * Design goals:
 * - Never disrupt the actual command: every failure here is swallowed.
 * - Don't hammer the npm registry: a real network check runs at most once
 *   per day; in between, a cached result is reused.
 * - Stay quiet when there is no human to nudge (non-TTY) or when asked
 *   to be quiet.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { BUILD_INFO } from './build-info.js';
import { compareVersions, fetchLatestVersion, installUpdate } from './updater.js';
import { promptYesNo } from './prompt.js';

/** How long a registry check result stays fresh: once per day. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Where the throttling cache lives. */
export const CACHE_FILE = path.join(os.tmpdir(), 'ptv-update-check.json');

export interface UpdateCache {
  /** Epoch milliseconds of the last successful registry check. */
  checkedAt: number;
  /** Latest version string seen at that check. */
  latest: string;
}

/** Read the throttling cache. Returns null if missing or unreadable. */
export function readCache(file: string = CACHE_FILE): UpdateCache | null {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
    if (typeof data?.checkedAt === 'number' && typeof data?.latest === 'string') {
      return { checkedAt: data.checkedAt, latest: data.latest };
    }
  } catch {
    // Missing or corrupt cache - treated as "no cache".
  }
  return null;
}

/** Write the throttling cache. Best-effort: failures are ignored. */
export function writeCache(cache: UpdateCache, file: string = CACHE_FILE): void {
  try {
    fs.writeFileSync(file, JSON.stringify(cache), 'utf-8');
  } catch {
    // A non-writable temp dir must not break anything.
  }
}

/** Whether a fresh network check is due, given the cache and current time. */
export function isCheckDue(
  cache: UpdateCache | null,
  now: number,
  intervalMs: number = CHECK_INTERVAL_MS
): boolean {
  if (!cache) return true;
  return now - cache.checkedAt >= intervalMs;
}

/**
 * Resolve the latest known version: reuse the cache when a check isn't due,
 * otherwise query npm and refresh the cache. Returns null if undetermined.
 */
async function resolveLatestVersion(now: number): Promise<string | null> {
  const cache = readCache();
  if (!isCheckDue(cache, now)) {
    return cache!.latest;
  }
  try {
    const latest = await fetchLatestVersion();
    writeCache({ checkedAt: now, latest });
    return latest;
  } catch {
    // Offline or registry trouble: fall back to whatever we last saw.
    return cache?.latest ?? null;
  }
}

export interface NotifyOptions {
  /** Suppress the nudge entirely (mirrors the CLI --quiet flag). */
  quiet: boolean;
}

/**
 * Automatic update nudge. Intended to run once, after the main command.
 * Checks (at most once per day) whether a newer ptv exists and, if so,
 * offers to install it. Silent and non-fatal on any error.
 */
export async function notifyAndMaybeUpdate(options: NotifyOptions): Promise<void> {
  try {
    if (options.quiet) return;
    // Only nudge a real interactive session - we need stdout to show the
    // message and stdin to read the answer.
    if (!process.stdout.isTTY || !process.stdin.isTTY) return;

    const latest = await resolveLatestVersion(Date.now());
    if (!latest) return;
    if (compareVersions(latest, BUILD_INFO.version) <= 0) return;

    process.stderr.write(
      `\nA new version of ptv is available:  v${BUILD_INFO.version} → v${latest}\n`
    );
    const proceed = await promptYesNo('Update now?', { defaultYes: true });
    if (!proceed) {
      process.stderr.write('Skipped - you will be reminded again later.\n');
      return;
    }

    await installUpdate(latest);
  } catch {
    // An update nudge must never disrupt or fail the actual command.
  }
}
