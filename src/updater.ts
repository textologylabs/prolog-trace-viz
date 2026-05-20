/**
 * Updater - npm registry primitives for the automatic update check.
 *
 * The orchestration (throttling, cache, the user-facing nudge) lives in
 * update-notifier.ts; this module just provides the building blocks.
 */

import { spawn } from 'node:child_process';
import { BUILD_INFO } from './build-info.js';
import { Spinner } from './spinner.js';

/** npm registry endpoint for the package's latest published version. */
export const REGISTRY_URL = `https://registry.npmjs.org/${BUILD_INFO.name}/latest`;

/** Default timeout for the registry request, in milliseconds. */
export const FETCH_TIMEOUT_MS = 3000;

/**
 * Compare two dotted version strings.
 * Returns 1 if a > b, -1 if a < b, 0 if equal. Non-numeric parts count as 0.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  const length = Math.max(pa.length, pb.length);
  for (let i = 0; i < length; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

/**
 * Fetch the latest published version string from the npm registry.
 * Aborts after `timeoutMs` so a slow network never stalls the CLI.
 */
export async function fetchLatestVersion(
  url: string = REGISTRY_URL,
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`npm registry returned HTTP ${response.status}`);
    }
    const data = (await response.json()) as { version?: string };
    if (!data.version) {
      throw new Error('npm registry response did not include a version');
    }
    return data.version;
  } finally {
    clearTimeout(timer);
  }
}

/** Run `npm install --global <packageSpec>`. Resolves on success. */
function runNpmInstall(packageSpec: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(npm, ['install', '--global', packageSpec], { stdio: 'ignore' });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm exited with code ${code}`));
      }
    });
  });
}

/**
 * Install the given version globally, showing a progress spinner.
 * Returns the process exit code (0 on success, 1 on failure).
 */
export async function installUpdate(latest: string): Promise<number> {
  const { name } = BUILD_INFO;
  const spinner = new Spinner();

  spinner.start(`Updating ptv to v${latest}...`);
  try {
    await runNpmInstall(`${name}@${latest}`);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    spinner.fail(`Update failed: ${reason}`);
    console.error(`  Try updating manually:  npm install --global ${name}@latest`);
    return 1;
  }

  spinner.succeed(`Updated ptv to v${latest}.`);
  return 0;
}
