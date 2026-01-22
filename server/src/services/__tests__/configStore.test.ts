import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ConfigStore } from '../configStore.js';
import { AppError, ErrorCode } from '../../types/errors.js';

describe('ConfigStore', () => {
  const testDir = join(process.cwd(), 'test-data');
  let configStore: ConfigStore;

  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
    
    // Initialize with test directory
    configStore = new ConfigStore({
      configDir: testDir,
      configFileName: 'test-config.json',
    });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('writeConfig', () => {
    it('should write a valid config', async () => {
      const config = { key: 'value', nested: { prop: 123 } };
      
      await configStore.writeConfig(config);
      
      const exists = await configStore.configExists();
      expect(exists).toBe(true);
    });

    it('should create directory if it does not exist', async () => {
      const newConfigStore = new ConfigStore({
        configDir: join(testDir, 'nested', 'path'),
        configFileName: 'config.json',
      });

      await newConfigStore.writeConfig({ test: true });
      
      const exists = await newConfigStore.configExists();
      expect(exists).toBe(true);
    });

    it('should reject null config', async () => {
      await expect(
        configStore.writeConfig(null)
      ).rejects.toThrow(AppError);

      try {
        await configStore.writeConfig(null);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.code).toBe(ErrorCode.ERR_BAD_REQUEST);
        expect(appError.statusCode).toBe(400);
      }
    });

    it('should reject undefined config', async () => {
      await expect(
        configStore.writeConfig(undefined)
      ).rejects.toThrow(AppError);
    });

    it('should reject config exceeding size limit', async () => {
      const smallConfigStore = new ConfigStore({
        configDir: testDir,
        configFileName: 'small.json',
        maxConfigSize: 50, // Very small limit
      });

      const largeConfig = {
        data: 'x'.repeat(1000),
      };

      await expect(
        smallConfigStore.writeConfig(largeConfig)
      ).rejects.toThrow(AppError);

      try {
        await smallConfigStore.writeConfig(largeConfig);
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.code).toBe(ErrorCode.ERR_CONFIG_TOO_LARGE);
        expect(appError.statusCode).toBe(413);
      }
    });

    it('should perform atomic write (no partial files on error)', async () => {
      const config = { test: 'data' };
      await configStore.writeConfig(config);

      // Verify no .tmp file exists after successful write
      const tempPath = `${configStore.getConfigPath()}.tmp`;
      await expect(fs.access(tempPath)).rejects.toThrow();
    });

    it('should overwrite existing config', async () => {
      const config1 = { version: 1 };
      const config2 = { version: 2 };

      await configStore.writeConfig(config1);
      await configStore.writeConfig(config2);

      const result = await configStore.readConfig();
      expect(result).toEqual(config2);
    });
  });

  describe('readConfig', () => {
    it('should read a valid config', async () => {
      const config = { key: 'value', number: 42 };
      await configStore.writeConfig(config);

      const result = await configStore.readConfig();
      expect(result).toEqual(config);
    });

    it('should throw ERR_CONFIG_NOT_FOUND if file does not exist', async () => {
      await expect(
        configStore.readConfig()
      ).rejects.toThrow(AppError);

      try {
        await configStore.readConfig();
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.code).toBe(ErrorCode.ERR_CONFIG_NOT_FOUND);
        expect(appError.statusCode).toBe(404);
      }
    });

    it('should throw ERR_CONFIG_INVALID_JSON if file contains invalid JSON', async () => {
      // Write invalid JSON directly
      const configPath = configStore.getConfigPath();
      await fs.writeFile(configPath, '{invalid json}', 'utf-8');

      await expect(
        configStore.readConfig()
      ).rejects.toThrow(AppError);

      try {
        await configStore.readConfig();
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        const appError = error as AppError;
        expect(appError.code).toBe(ErrorCode.ERR_CONFIG_INVALID_JSON);
        expect(appError.statusCode).toBe(400);
      }
    });
  });

  describe('configExists', () => {
    it('should return false if config does not exist', async () => {
      const exists = await configStore.configExists();
      expect(exists).toBe(false);
    });

    it('should return true if config exists', async () => {
      await configStore.writeConfig({ test: true });
      
      const exists = await configStore.configExists();
      expect(exists).toBe(true);
    });
  });

  describe('deleteConfig', () => {
    it('should delete existing config', async () => {
      await configStore.writeConfig({ test: true });
      expect(await configStore.configExists()).toBe(true);

      await configStore.deleteConfig();
      expect(await configStore.configExists()).toBe(false);
    });

    it('should not throw if config does not exist', async () => {
      await expect(configStore.deleteConfig()).resolves.not.toThrow();
    });
  });

  describe('atomic write behavior', () => {
    it('should not leave temp files on successful write', async () => {
      await configStore.writeConfig({ test: true });

      const tempPath = `${configStore.getConfigPath()}.tmp`;
      await expect(fs.access(tempPath)).rejects.toThrow();
    });

    it('should maintain config integrity during sequential writes', async () => {
      // Write two configs sequentially
      const config1 = { id: 1, data: 'first' };
      const config2 = { id: 2, data: 'second' };

      await configStore.writeConfig(config1);
      await configStore.writeConfig(config2);

      // Config should be the last one written
      const result = await configStore.readConfig() as any;
      expect(result.id).toBe(2);
      expect(result.data).toBe('second');
    });
  });
});
