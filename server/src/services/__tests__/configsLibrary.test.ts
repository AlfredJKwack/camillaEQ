import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ConfigsLibrary, type PipelineConfig } from '../configsLibrary';
import { AppError, ErrorCode } from '../../types/errors';

const TEST_CONFIGS_DIR = './test-configs-lib';

describe('ConfigsLibrary', () => {
  let configsLibrary: ConfigsLibrary;

  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(TEST_CONFIGS_DIR, { recursive: true });
    configsLibrary = new ConfigsLibrary({ configsDir: TEST_CONFIGS_DIR });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      const files = await fs.readdir(TEST_CONFIGS_DIR);
      await Promise.all(files.map((file) => fs.unlink(join(TEST_CONFIGS_DIR, file))));
      await fs.rmdir(TEST_CONFIGS_DIR);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('listConfigs', () => {
    it('should return empty array when directory is empty', async () => {
      const configs = await configsLibrary.listConfigs();
      expect(configs).toEqual([]);
    });

    it('should return empty array when directory does not exist', async () => {
      const nonExistentLibrary = new ConfigsLibrary({ configsDir: './non-existent-dir' });
      const configs = await nonExistentLibrary.listConfigs();
      expect(configs).toEqual([]);
    });

    it('should list all JSON configs with metadata', async () => {
      // Create test configs
      const config1: PipelineConfig = {
        configName: 'Test Config 1',
        filterArray: [{ Filter01: { type: 'Peaking', freq: 1000, gain: 3, q: 1 } }],
      };
      const config2: PipelineConfig = {
        configName: 'Test Config 2',
        filterArray: [{ Filter01: { type: 'Peaking', freq: 2000, gain: 5, q: 2 } }],
      };

      await fs.writeFile(
        join(TEST_CONFIGS_DIR, 'Test Config 1.json'),
        JSON.stringify(config1, null, 2)
      );
      await fs.writeFile(
        join(TEST_CONFIGS_DIR, 'Test Config 2.json'),
        JSON.stringify(config2, null, 2)
      );

      const configs = await configsLibrary.listConfigs();

      expect(configs).toHaveLength(2);
      expect(configs[0].id).toBe('test-config-1');
      expect(configs[0].configName).toBe('Test Config 1');
      expect(configs[0].file).toBe('Test Config 1.json');
      expect(configs[0].mtimeMs).toBeGreaterThan(0);
      expect(configs[0].size).toBeGreaterThan(0);

      expect(configs[1].id).toBe('test-config-2');
      expect(configs[1].configName).toBe('Test Config 2');
    });

    it('should sort configs by name', async () => {
      const configB: PipelineConfig = {
        configName: 'B Config',
        filterArray: [],
      };
      const configA: PipelineConfig = {
        configName: 'A Config',
        filterArray: [],
      };

      await fs.writeFile(join(TEST_CONFIGS_DIR, 'B Config.json'), JSON.stringify(configB));
      await fs.writeFile(join(TEST_CONFIGS_DIR, 'A Config.json'), JSON.stringify(configA));

      const configs = await configsLibrary.listConfigs();

      expect(configs[0].configName).toBe('A Config');
      expect(configs[1].configName).toBe('B Config');
    });

    it('should ignore non-JSON files', async () => {
      await fs.writeFile(join(TEST_CONFIGS_DIR, 'readme.txt'), 'Some text');
      await fs.writeFile(
        join(TEST_CONFIGS_DIR, 'config.json'),
        JSON.stringify({ configName: 'Test', filterArray: [] })
      );

      const configs = await configsLibrary.listConfigs();

      expect(configs).toHaveLength(1);
      expect(configs[0].configName).toBe('Test');
    });

    it('should use filename as fallback if configName is missing', async () => {
      await fs.writeFile(join(TEST_CONFIGS_DIR, 'Fallback Name.json'), '{}');

      const configs = await configsLibrary.listConfigs();

      expect(configs).toHaveLength(1);
      expect(configs[0].configName).toBe('Fallback Name');
    });
  });

  describe('getConfig', () => {
    it('should get config by ID', async () => {
      const config: PipelineConfig = {
        configName: 'My Config',
        filterArray: [{ Filter01: { type: 'Peaking', freq: 1000, gain: 3, q: 1 } }],
      };

      await fs.writeFile(
        join(TEST_CONFIGS_DIR, 'My Config.json'),
        JSON.stringify(config, null, 2)
      );

      const result = await configsLibrary.getConfig('my-config');

      expect(result.configName).toBe('My Config');
      expect(result.filterArray).toHaveLength(1);
    });

    it('should throw NOT_FOUND for non-existent config', async () => {
      await expect(configsLibrary.getConfig('non-existent')).rejects.toThrow(AppError);
      await expect(configsLibrary.getConfig('non-existent')).rejects.toMatchObject({
        code: ErrorCode.ERR_CONFIG_NOT_FOUND,
        statusCode: 404,
      });
    });

    it('should throw INVALID_JSON for malformed config', async () => {
      await fs.writeFile(join(TEST_CONFIGS_DIR, 'Bad Config.json'), 'invalid json');

      await expect(configsLibrary.getConfig('bad-config')).rejects.toThrow(AppError);
      await expect(configsLibrary.getConfig('bad-config')).rejects.toMatchObject({
        code: ErrorCode.ERR_CONFIG_INVALID_JSON,
        statusCode: 400,
      });
    });

    it('should throw INVALID_JSON for config missing required fields', async () => {
      await fs.writeFile(join(TEST_CONFIGS_DIR, 'Incomplete.json'), JSON.stringify({}));

      await expect(configsLibrary.getConfig('incomplete')).rejects.toThrow(AppError);
      await expect(configsLibrary.getConfig('incomplete')).rejects.toMatchObject({
        code: ErrorCode.ERR_CONFIG_INVALID_JSON,
        statusCode: 400,
      });
    });
  });

  describe('saveConfig', () => {
    it('should save config with atomic write', async () => {
      const config: PipelineConfig = {
        configName: 'New Config',
        filterArray: [{ Filter01: { type: 'Peaking', freq: 1000, gain: 3, q: 1 } }],
      };

      await configsLibrary.saveConfig('new-config', config);

      // Verify file exists
      const files = await fs.readdir(TEST_CONFIGS_DIR);
      expect(files).toContain('new config.json');

      // Verify no temp file remains
      expect(files.filter((f) => f.endsWith('.tmp'))).toHaveLength(0);

      // Verify content
      const content = await fs.readFile(join(TEST_CONFIGS_DIR, 'new config.json'), 'utf-8');
      const saved = JSON.parse(content);
      expect(saved.configName).toBe('New Config');
    });

    it('should throw BAD_REQUEST for missing configName', async () => {
      const invalidConfig = { filterArray: [] } as any;

      await expect(configsLibrary.saveConfig('test', invalidConfig)).rejects.toThrow(AppError);
      await expect(configsLibrary.saveConfig('test', invalidConfig)).rejects.toMatchObject({
        code: ErrorCode.ERR_BAD_REQUEST,
        statusCode: 400,
      });
    });

    it('should throw BAD_REQUEST for missing filterArray', async () => {
      const invalidConfig = { configName: 'Test' } as any;

      await expect(configsLibrary.saveConfig('test', invalidConfig)).rejects.toThrow(AppError);
      await expect(configsLibrary.saveConfig('test', invalidConfig)).rejects.toMatchObject({
        code: ErrorCode.ERR_BAD_REQUEST,
        statusCode: 400,
      });
    });

    it('should throw TOO_LARGE for oversized config', async () => {
      const largeConfig: PipelineConfig = {
        configName: 'Large',
        filterArray: Array(100000)
          .fill(null)
          .map(() => ({ Filter: { type: 'Peaking', freq: 1000, gain: 3, q: 1 } })),
      };

      await expect(configsLibrary.saveConfig('large', largeConfig)).rejects.toThrow(AppError);
      await expect(configsLibrary.saveConfig('large', largeConfig)).rejects.toMatchObject({
        code: ErrorCode.ERR_CONFIG_TOO_LARGE,
        statusCode: 413,
      });
    });

    it('should create directory if it does not exist', async () => {
      // Remove directory
      await fs.rmdir(TEST_CONFIGS_DIR);

      const config: PipelineConfig = {
        configName: 'Test',
        filterArray: [],
      };

      await configsLibrary.saveConfig('test', config);

      // Verify directory was created
      const stats = await fs.stat(TEST_CONFIGS_DIR);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('deleteConfig', () => {
    it('should delete config by ID', async () => {
      const config: PipelineConfig = {
        configName: 'Delete Me',
        filterArray: [],
      };

      await fs.writeFile(
        join(TEST_CONFIGS_DIR, 'Delete Me.json'),
        JSON.stringify(config)
      );

      await configsLibrary.deleteConfig('delete-me');

      const files = await fs.readdir(TEST_CONFIGS_DIR);
      expect(files).not.toContain('Delete Me.json');
    });

    it('should throw NOT_FOUND for non-existent config', async () => {
      await expect(configsLibrary.deleteConfig('non-existent')).rejects.toThrow(AppError);
      await expect(configsLibrary.deleteConfig('non-existent')).rejects.toMatchObject({
        code: ErrorCode.ERR_CONFIG_NOT_FOUND,
        statusCode: 404,
      });
    });
  });

  describe('getConfigsDir', () => {
    it('should return configured directory', () => {
      expect(configsLibrary.getConfigsDir()).toBe(TEST_CONFIGS_DIR);
    });

    it('should use default directory when not configured', () => {
      const defaultLibrary = new ConfigsLibrary();
      expect(defaultLibrary.getConfigsDir()).toBe('./data/configs');
    });

    it('should respect environment variable', () => {
      const originalEnv = process.env.CONFIGS_DIR;
      process.env.CONFIGS_DIR = '/custom/configs';

      const envLibrary = new ConfigsLibrary();
      expect(envLibrary.getConfigsDir()).toBe('/custom/configs');

      // Restore
      if (originalEnv) {
        process.env.CONFIGS_DIR = originalEnv;
      } else {
        delete process.env.CONFIGS_DIR;
      }
    });
  });
});
