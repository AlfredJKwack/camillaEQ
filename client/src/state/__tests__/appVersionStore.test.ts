import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { appVersion, loadAppVersion } from '../appVersionStore';

describe('appVersionStore', () => {
  beforeEach(() => {
    // Reset store
    appVersion.set(null);
    
    // Clear any mocked fetch
    vi.restoreAllMocks();
  });

  it('should start with null version', () => {
    const version = get(appVersion);
    expect(version).toBeNull();
  });

  it('should load version from API successfully', async () => {
    const mockVersion = {
      version: '0.1.0',
      buildHash: 'abc123',
      buildTime: '2026-01-30T22:00:00.000Z',
    };

    // Mock successful fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockVersion,
    } as Response);

    await loadAppVersion();

    const version = get(appVersion);
    expect(version).toEqual(mockVersion);
    expect(fetch).toHaveBeenCalledWith('/api/version');
  });

  it('should handle API failure gracefully', async () => {
    // Mock failed fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Not Found',
    } as Response);

    await loadAppVersion();

    const version = get(appVersion);
    expect(version).toBeNull(); // Should remain null on failure
  });

  it('should handle network error gracefully', async () => {
    // Mock network error
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    await loadAppVersion();

    const version = get(appVersion);
    expect(version).toBeNull(); // Should remain null on error
  });
});
