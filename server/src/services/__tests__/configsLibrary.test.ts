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
    // Clean up test directory recursively
    try {
      await fs.rm(TEST_CONFIGS_DIR, { recursive: true, force: true });
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

    it('should list extended format configs', async () => {
      const extendedConfig: PipelineConfig = {
        configName: 'Extended Format',
        filterArray: [],
        filters: { test: { type: 'Biquad', parameters: {} } },
        mixers: { test: { channels: { in: 2, out: 2 }, mapping: [] } },
        pipeline: [{ type: 'Mixer', name: 'test' }],
        title: 'Test Title',
        description: 'Test Description',
      };

      await fs.writeFile(
        join(TEST_CONFIGS_DIR, 'Extended Format.json'),
        JSON.stringify(extendedConfig, null, 2)
      );

      const configs = await configsLibrary.listConfigs();

      expect(configs).toHaveLength(1);
      expect(configs[0].configName).toBe('Extended Format');
    });
  });

  describe('getConfig', () => {
    it('should convert EQ preset to pipeline config with correct filter type casing', async () => {
      // Create an EQ preset (AutoEQ format)
      const eqPreset = {
        presetType: 'eq',
        schemaVersion: 1,
        name: 'Test EQ Preset',
        device: {
          category: 'headphones',
          manufacturer: 'Test',
          model: 'Model',
        },
        preampDb: -3,
        bands: [
          { type: 'LowShelf', freqHz: 105, gainDb: 5.5, q: 0.7, enabled: true },
          { type: 'Peaking', freqHz: 1000, gainDb: 3, q: 1, enabled: true },
          { type: 'HighShelf', freqHz: 10000, gainDb: -2, q: 0.7, enabled: true },
        ],
        source: 'autoeq',
        readOnly: true,
      };

      await fs.writeFile(
        join(TEST_CONFIGS_DIR, 'Test EQ Preset.json'),
        JSON.stringify(eqPreset, null, 2)
      );

      const result = await configsLibrary.getConfig('test-eq-preset');

      // Verify conversion to pipeline config
      expect(result.configName).toBe('Test EQ Preset');
      expect(result.filterArray).toBeDefined();
      expect(result.filterArray).toHaveLength(5); // 3 bands + preamp + volume

      // Verify filter type casing matches CamillaDSP expectations
      const filter01 = result.filterArray[0].Filter01;
      expect(filter01.type).toBe('Lowshelf'); // Not LowShelf

      const filter02 = result.filterArray[1].Filter02;
      expect(filter02.type).toBe('Peaking'); // Unchanged

      const filter03 = result.filterArray[2].Filter03;
      expect(filter03.type).toBe('Highshelf'); // Not HighShelf

      // Verify preamp is included
      const preamp = result.filterArray[3].Preamp;
      expect(preamp.gain).toBe(-3);

      // Verify volume placeholder
      expect(result.filterArray[4].Volume).toBeDefined();
    });

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

    it('should throw NOT_FOUND for malformed config (skipped during list scan)', async () => {
      await fs.writeFile(join(TEST_CONFIGS_DIR, 'Bad Config.json'), 'invalid json');

      // Malformed configs are skipped by listConfigs(), so getConfig() won't find them
      await expect(configsLibrary.getConfig('bad-config')).rejects.toThrow(AppError);
      await expect(configsLibrary.getConfig('bad-config')).rejects.toMatchObject({
        code: ErrorCode.ERR_CONFIG_NOT_FOUND,
        statusCode: 404,
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

    it('should get extended format config with all fields', async () => {
      const extendedConfig: PipelineConfig = {
        configName: 'Extended Config',
        filterArray: [],
        filters: { test: { type: 'Biquad', parameters: { type: 'Peaking', freq: 1000, q: 1, gain: 3 } } },
        mixers: { test: { channels: { in: 2, out: 2 }, mapping: [] } },
        pipeline: [{ type: 'Mixer', name: 'test' }],
        title: 'Test Title',
        description: 'Test Description',
      };

      await fs.writeFile(
        join(TEST_CONFIGS_DIR, 'Extended Config.json'),
        JSON.stringify(extendedConfig, null, 2)
      );

      const result = await configsLibrary.getConfig('extended-config');

      expect(result.configName).toBe('Extended Config');
      expect(result.filterArray).toEqual([]);
      expect(result.filters).toBeDefined();
      expect(result.mixers).toBeDefined();
      expect(result.pipeline).toBeDefined();
      expect(result.title).toBe('Test Title');
      expect(result.description).toBe('Test Description');
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
      expect(defaultLibrary.getConfigsDir()).toBe('data/configs');
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

  describe('AutoEQ manifest fast-path', () => {
    it('should use manifest when present and skip scanning autoeq directory', async () => {
      // Create autoeq subdirectory with manifest
      const autoeqDir = join(TEST_CONFIGS_DIR, 'autoeq');
      await fs.mkdir(autoeqDir, { recursive: true });

      // Create manifest with 2 entries
      const manifest = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        source: { repo: 'https://github.com/jaakkopasanen/AutoEq.git' },
        configs: [
          {
            id: 'autoeq--headphones--test-headphones',
            configName: 'Test Headphones',
            file: 'autoeq/headphones/Test Headphones.json',
            mtimeMs: Date.now(),
            size: 1024,
            presetType: 'eq',
            source: 'autoeq',
            readOnly: true,
            category: 'headphones',
            manufacturer: 'Test',
            model: 'Headphones',
          },
          {
            id: 'autoeq--iems--test-iems',
            configName: 'Test IEMs',
            file: 'autoeq/iems/Test IEMs.json',
            mtimeMs: Date.now(),
            size: 2048,
            presetType: 'eq',
            source: 'autoeq',
            readOnly: true,
            category: 'iems',
            manufacturer: 'Test',
            model: 'IEMs',
          },
        ],
      };

      await fs.writeFile(
        join(autoeqDir, 'index.json'),
        JSON.stringify(manifest, null, 2)
      );

      // Create a malformed JSON file under autoeq/ (should be ignored by fast-path)
      await fs.writeFile(join(autoeqDir, 'should-be-ignored.json'), '{ invalid json');

      // Create a user preset at root
      const userConfig: PipelineConfig = {
        configName: 'User Config',
        filterArray: [],
      };
      await fs.writeFile(
        join(TEST_CONFIGS_DIR, 'User Config.json'),
        JSON.stringify(userConfig)
      );

      const configs = await configsLibrary.listConfigs();

      // Should return 3 configs (2 from manifest + 1 user)
      expect(configs).toHaveLength(3);

      // Verify manifest entries are present
      const autoeqConfigs = configs.filter((c) => c.source === 'autoeq');
      expect(autoeqConfigs).toHaveLength(2);
      expect(autoeqConfigs.find((c) => c.configName === 'Test Headphones')).toBeDefined();
      expect(autoeqConfigs.find((c) => c.configName === 'Test IEMs')).toBeDefined();

      // Verify user config is present
      const userConfigs = configs.filter((c) => c.source === 'user');
      expect(userConfigs).toHaveLength(1);
      expect(userConfigs[0].configName).toBe('User Config');

      // Verify malformed file was not scanned (fast-path skipped autoeq/)
      expect(configs.find((c) => c.file.includes('should-be-ignored'))).toBeUndefined();
    });

    it('should fallback to full scan when manifest is missing', async () => {
      // Create autoeq subdirectory with NO manifest
      const autoeqDir = join(TEST_CONFIGS_DIR, 'autoeq', 'headphones');
      await fs.mkdir(autoeqDir, { recursive: true });

      // Create a valid EQ preset
      const eqPreset = {
        presetType: 'eq',
        schemaVersion: 1,
        name: 'Fallback Test',
        device: {
          category: 'headphones',
          manufacturer: 'Test',
          model: 'Fallback',
        },
        preampDb: 0,
        bands: [{ type: 'Peaking', freqHz: 1000, gainDb: 3, q: 1, enabled: true }],
        source: 'autoeq',
        readOnly: true,
      };

      await fs.writeFile(
        join(autoeqDir, 'Fallback Test.json'),
        JSON.stringify(eqPreset, null, 2)
      );

      const configs = await configsLibrary.listConfigs();

      // Should find the preset via fallback full scan
      expect(configs).toHaveLength(1);
      expect(configs[0].configName).toBe('Fallback Test');
      expect(configs[0].source).toBe('autoeq');
      expect(configs[0].presetType).toBe('eq');
    });

    it('should fallback to full scan when manifest is invalid', async () => {
      // Create autoeq directory with invalid manifest
      const autoeqDir = join(TEST_CONFIGS_DIR, 'autoeq');
      await fs.mkdir(autoeqDir, { recursive: true });

      // Write invalid manifest (missing configs array)
      await fs.writeFile(
        join(autoeqDir, 'index.json'),
        JSON.stringify({ schemaVersion: 1 })
      );

      // Create a valid EQ preset
      const eqPreset = {
        presetType: 'eq',
        schemaVersion: 1,
        name: 'Invalid Manifest Fallback',
        device: { category: 'headphones', manufacturer: 'Test', model: 'Invalid' },
        preampDb: 0,
        bands: [],
        source: 'autoeq',
        readOnly: true,
      };

      await fs.writeFile(
        join(autoeqDir, 'Invalid Manifest Fallback.json'),
        JSON.stringify(eqPreset, null, 2)
      );

      const configs = await configsLibrary.listConfigs();

      // Should find the preset via fallback
      expect(configs).toHaveLength(1);
      expect(configs[0].configName).toBe('Invalid Manifest Fallback');
    });

    it('should skip index.json files when scanning', async () => {
      // Create directory with index.json at root (not autoeq/)
      await fs.writeFile(
        join(TEST_CONFIGS_DIR, 'index.json'),
        JSON.stringify({ test: 'data' })
      );

      // Create a normal config
      const config: PipelineConfig = { configName: 'Normal', filterArray: [] };
      await fs.writeFile(
        join(TEST_CONFIGS_DIR, 'Normal.json'),
        JSON.stringify(config)
      );

      const configs = await configsLibrary.listConfigs();

      // Should only find the normal config, not index.json
      expect(configs).toHaveLength(1);
      expect(configs[0].configName).toBe('Normal');
      expect(configs.find((c) => c.file === 'index.json')).toBeUndefined();
    });
  });
});
