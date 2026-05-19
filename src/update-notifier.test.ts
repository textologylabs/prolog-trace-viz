/**
 * Update Notifier Tests
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  CHECK_INTERVAL_MS,
  isCheckDue,
  readCache,
  writeCache,
  UpdateCache,
} from './update-notifier.js';

describe('isCheckDue', () => {
  const now = 1_000_000_000_000;

  it('is due when there is no cache', () => {
    expect(isCheckDue(null, now)).toBe(true);
  });

  it('is not due when the cache is fresh', () => {
    const cache: UpdateCache = { checkedAt: now - 1000, latest: '2.6.3' };
    expect(isCheckDue(cache, now)).toBe(false);
  });

  it('is due once the interval has elapsed', () => {
    const cache: UpdateCache = { checkedAt: now - CHECK_INTERVAL_MS, latest: '2.6.3' };
    expect(isCheckDue(cache, now)).toBe(true);
  });

  it('is due for a cache older than the interval', () => {
    const cache: UpdateCache = { checkedAt: now - CHECK_INTERVAL_MS * 3, latest: '2.6.3' };
    expect(isCheckDue(cache, now)).toBe(true);
  });
});

describe('readCache / writeCache', () => {
  const tmpFile = path.join(os.tmpdir(), `ptv-update-test-${process.pid}.json`);

  afterEach(() => {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // already gone
    }
  });

  it('round-trips a cache entry', () => {
    const cache: UpdateCache = { checkedAt: 123456, latest: '9.9.9' };
    writeCache(cache, tmpFile);
    expect(readCache(tmpFile)).toEqual(cache);
  });

  it('returns null when the cache file is missing', () => {
    expect(readCache(tmpFile)).toBeNull();
  });

  it('returns null when the cache file is corrupt', () => {
    fs.writeFileSync(tmpFile, 'not json', 'utf-8');
    expect(readCache(tmpFile)).toBeNull();
  });

  it('returns null when the cache file has the wrong shape', () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ latest: 5 }), 'utf-8');
    expect(readCache(tmpFile)).toBeNull();
  });
});
