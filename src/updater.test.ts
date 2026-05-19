/**
 * Updater Tests
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { compareVersions, fetchLatestVersion } from './updater.js';

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('2.6.3', '2.6.3')).toBe(0);
  });

  it('returns 1 when the first version is newer', () => {
    expect(compareVersions('2.6.4', '2.6.3')).toBe(1);
    expect(compareVersions('2.7.0', '2.6.9')).toBe(1);
    expect(compareVersions('3.0.0', '2.9.9')).toBe(1);
  });

  it('returns -1 when the first version is older', () => {
    expect(compareVersions('2.6.2', '2.6.3')).toBe(-1);
    expect(compareVersions('2.5.9', '2.6.0')).toBe(-1);
  });

  it('treats missing components as zero', () => {
    expect(compareVersions('2.6', '2.6.0')).toBe(0);
    expect(compareVersions('2.6.1', '2.6')).toBe(1);
  });
});

describe('fetchLatestVersion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the version field from the registry response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '9.9.9' }),
    })));

    await expect(fetchLatestVersion('https://example.test')).resolves.toBe('9.9.9');
  });

  it('throws when the registry responds with an error status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    })));

    await expect(fetchLatestVersion('https://example.test')).rejects.toThrow('HTTP 503');
  });

  it('throws when the response has no version field', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({}),
    })));

    await expect(fetchLatestVersion('https://example.test')).rejects.toThrow('did not include a version');
  });
});
