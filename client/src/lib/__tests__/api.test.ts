/**
 * API module tests
 * Verifies API boundary functions handle success and error cases
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getLatestState,
  putLatestState,
  getVersion,
  listConfigs,
  getConfig,
  putConfig,
  ApiError,
} from '../api';

describe('API module', () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('getLatestState', () => {
    it('should fetch and return config on success', async () => {
      const mockConfig = { devices: {}, filters: {}, mixers: {}, pipeline: [] };
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig,
      });

      const result = await getLatestState();

      expect(result).toEqual(mockConfig);
      expect(fetchSpy).toHaveBeenCalledWith('/api/state/latest');
    });

    it('should throw ApiError on HTTP error', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      try {
        await getLatestState();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(404);
        expect((error as ApiError).message).toContain('Failed to fetch latest state');
      }
    });
  });

  describe('putLatestState', () => {
    it('should PUT config successfully', async () => {
      const mockConfig = { devices: {}, filters: {}, mixers: {}, pipeline: [] };
      fetchSpy.mockResolvedValueOnce({ ok: true });

      await putLatestState(mockConfig as any);

      expect(fetchSpy).toHaveBeenCalledWith('/api/state/latest', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockConfig),
      });
    });

    it('should throw ApiError on HTTP error', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(putLatestState({} as any)).rejects.toThrow(ApiError);
    });
  });

  describe('getVersion', () => {
    it('should fetch version info', async () => {
      const mockVersion = { version: '1.0.0' };
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockVersion,
      });

      const result = await getVersion();

      expect(result).toEqual(mockVersion);
      expect(fetchSpy).toHaveBeenCalledWith('/api/version');
    });
  });

  describe('listConfigs', () => {
    it('should fetch config list with metadata', async () => {
      const mockConfigs = [
        { id: 'preset1', configName: 'Preset 1', file: 'preset1.json', mtimeMs: 123456, size: 1024 },
        { id: 'preset2', configName: 'Preset 2', file: 'preset2.json', mtimeMs: 123457, size: 2048 },
      ];
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfigs,
      });

      const result = await listConfigs();

      expect(result).toEqual(mockConfigs);
      expect(fetchSpy).toHaveBeenCalledWith('/api/configs');
    });
  });

  describe('getConfig', () => {
    it('should fetch specific config', async () => {
      const mockConfig = { configName: 'test', filterArray: [] };
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig,
      });

      const result = await getConfig('test-id');

      expect(result).toEqual(mockConfig);
      expect(fetchSpy).toHaveBeenCalledWith('/api/configs/test-id');
    });

    it('should throw ApiError with config ID on error', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(getConfig('missing')).rejects.toThrow("Failed to fetch config 'missing'");
    });
  });

  describe('putConfig', () => {
    it('should save config', async () => {
      const mockConfig = { configName: 'test', filterArray: [] };
      fetchSpy.mockResolvedValueOnce({ ok: true });

      await putConfig('test-id', mockConfig);

      expect(fetchSpy).toHaveBeenCalledWith('/api/configs/test-id', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mockConfig),
      });
    });
  });

  describe('ApiError', () => {
    it('should include status and message', () => {
      const error = new ApiError(404, 'Not found');

      expect(error.status).toBe(404);
      expect(error.message).toBe('Not found');
      expect(error.name).toBe('ApiError');
    });
  });
});
