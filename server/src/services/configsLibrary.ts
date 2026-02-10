import { promises as fs } from 'fs';
import { join, relative } from 'path';
import { AppError, ErrorCode } from '../types/errors.js';
import { getConfigsDir } from '../configPaths.js';

/**
 * EQ Preset format (subset needed for server runtime)
 * Full schema definition lives in shared/eqPresetSchema.ts
 */
interface EqPresetV1 {
  presetType: 'eq';
  schemaVersion: 1;
  name: string;
  device: {
    category: 'headphones' | 'iems' | 'speakers' | 'unknown';
    manufacturer: string;
    model: string;
    variant?: string;
  };
  preampDb: number;
  bands: Array<{
    type: 'Peaking' | 'LowShelf' | 'HighShelf';
    freqHz: number;
    gainDb: number;
    q: number;
    enabled: boolean;
  }>;
  source: 'autoeq' | 'user';
  readOnly: boolean;
  sourceInfo?: {
    repo: string;
    commit?: string;
    path: string;
  };
}

/**
 * Type guard to check if config is an EQ preset
 */
function isEqPreset(config: unknown): config is EqPresetV1 {
  return (
    typeof config === 'object' &&
    config !== null &&
    'presetType' in config &&
    (config as any).presetType === 'eq'
  );
}

/**
 * Configuration for configs library
 */
export interface ConfigsLibraryConfig {
  /** Directory where config library is stored */
  configsDir?: string;
}

/**
 * Metadata for a saved config
 */
export interface ConfigMetadata {
  id: string; // filename without extension (kebab-case), includes subdirs for uniqueness
  configName: string; // human-readable name from JSON
  file: string; // relative path from configs dir (includes subdirs)
  mtimeMs: number; // last modified timestamp
  size: number; // file size in bytes
  
  // Extended metadata for AutoEQ presets
  presetType?: 'pipeline' | 'eq';
  source?: 'autoeq' | 'user';
  readOnly?: boolean;
  category?: string;
  manufacturer?: string;
  model?: string;
  variant?: string;
}

/**
 * Pipeline config format (canonical on-disk format for MVP-9+)
 * 
 * Legacy format (MVP-9):
 * - configName, accessKey, filterArray
 * 
 * Extended format (MVP-21+):
 * - configName, accessKey, filterArray (can be empty [])
 * - filters, mixers, processors, pipeline (optional)
 * - title, description (optional)
 */
export interface PipelineConfig {
  configName: string;
  accessKey?: string;
  filterArray: Array<Record<string, any>>;
  
  // Extended format for full pipeline support
  title?: string;
  description?: string;
  filters?: Record<string, any>;
  mixers?: Record<string, any>;
  processors?: Record<string, any>;
  pipeline?: any[];
}

/**
 * Union type for all supported config formats
 */
export type ConfigFormat = PipelineConfig | EqPresetV1;

/**
 * Configs library service for managing saved configurations
 */
export class ConfigsLibrary {
  private configsDir: string;

  constructor(config: ConfigsLibraryConfig = {}) {
    this.configsDir = config.configsDir || getConfigsDir();
  }

  /**
   * Get the configs directory path
   */
  getConfigsDir(): string {
    return this.configsDir;
  }

  /**
   * List all available configs with metadata (recursive)
   * Uses prebuilt AutoEQ manifest when available for performance
   */
  async listConfigs(): Promise<ConfigMetadata[]> {
    try {
      const configs: ConfigMetadata[] = [];
      
      // Try to load AutoEQ manifest for fast lookups
      const autoeqConfigs = await this.loadAutoEqManifest();
      
      if (autoeqConfigs.length > 0) {
        configs.push(...autoeqConfigs);
        
        // Scan all directories EXCEPT autoeq
        await this.scanDirectoryExcluding(this.configsDir, '', configs, ['autoeq']);
      } else {
        // Fallback: scan everything (no manifest found)
        await this.scanDirectory(this.configsDir, '', configs);
      }

      // Sort by name
      configs.sort((a, b) => a.configName.localeCompare(b.configName));

      return configs;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Directory doesn't exist, return empty array
        return [];
      }
      throw new AppError(
        ErrorCode.ERR_INTERNAL_SERVER,
        `Failed to list configs: ${(error as Error).message}`,
        500,
        { originalError: (error as Error).message }
      );
    }
  }

  /**
   * Load AutoEQ manifest if it exists
   * Returns empty array if manifest is missing or invalid
   */
  private async loadAutoEqManifest(): Promise<ConfigMetadata[]> {
    const manifestPath = join(this.configsDir, 'autoeq', 'index.json');
    
    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      const data = JSON.parse(content);
      
      // Validate manifest structure
      if (!data.configs || !Array.isArray(data.configs)) {
        console.warn('AutoEQ manifest has invalid structure, falling back to full scan');
        return [];
      }
      
      // Return configs array (already in ConfigMetadata format)
      return data.configs;
    } catch (error) {
      console.warn('AutoEQ manifest not found');
      return [];
    }
  }

  /**
   * Recursively scan directory for JSON config files, excluding specified subdirectories
   */
  private async scanDirectoryExcluding(
    absolutePath: string,
    relativePath: string,
    configs: ConfigMetadata[],
    excludeDirs: string[]
  ): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(absolutePath, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return; // Directory doesn't exist, skip
      }
      throw error;
    }

    for (const entry of entries) {
      const entryRelativePath = relativePath ? join(relativePath, entry.name) : entry.name;
      const entryAbsolutePath = join(absolutePath, entry.name);

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (excludeDirs.includes(entry.name)) {
          continue;
        }
        // Recurse into subdirectories
        await this.scanDirectoryExcluding(entryAbsolutePath, entryRelativePath, configs, excludeDirs);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        // Skip index.json files
        if (entry.name === 'index.json') {
          continue;
        }
        
        // Process JSON file
        try {
          const stats = await fs.stat(entryAbsolutePath);
          const content = await fs.readFile(entryAbsolutePath, 'utf-8');
          const data = JSON.parse(content);

          let metadata: ConfigMetadata;

          if (isEqPreset(data)) {
            // EQ Preset format
            metadata = this.buildEqPresetMetadata(data, entryRelativePath, stats);
          } else {
            // Pipeline config format
            metadata = this.buildPipelineConfigMetadata(data, entryRelativePath, stats);
          }

          configs.push(metadata);
        } catch (error) {
          // Skip malformed files
          console.warn(`Skipping malformed config: ${entryRelativePath}`);
        }
      }
    }
  }

  /**
   * Recursively scan directory for JSON config files
   */
  private async scanDirectory(
    absolutePath: string,
    relativePath: string,
    configs: ConfigMetadata[]
  ): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(absolutePath, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return; // Directory doesn't exist, skip
      }
      throw error;
    }

    for (const entry of entries) {
      const entryRelativePath = relativePath ? join(relativePath, entry.name) : entry.name;
      const entryAbsolutePath = join(absolutePath, entry.name);

      if (entry.isDirectory()) {
        // Recurse into subdirectories
        await this.scanDirectory(entryAbsolutePath, entryRelativePath, configs);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        // Skip index.json files
        if (entry.name === 'index.json') {
          continue;
        }
        
        // Process JSON file
        try {
          const stats = await fs.stat(entryAbsolutePath);
          const content = await fs.readFile(entryAbsolutePath, 'utf-8');
          const data = JSON.parse(content);

          let metadata: ConfigMetadata;

          if (isEqPreset(data)) {
            // EQ Preset format
            metadata = this.buildEqPresetMetadata(data, entryRelativePath, stats);
          } else {
            // Pipeline config format
            metadata = this.buildPipelineConfigMetadata(data, entryRelativePath, stats);
          }

          configs.push(metadata);
        } catch (error) {
          // Skip malformed files
          console.warn(`Skipping malformed config: ${entryRelativePath}`);
        }
      }
    }
  }

  /**
   * Build metadata for EqPresetV1 format
   */
  private buildEqPresetMetadata(
    preset: EqPresetV1,
    relativePath: string,
    stats: { mtimeMs: number; size: number }
  ): ConfigMetadata {
    // Generate stable ID from relative path
    const id = relativePath
      .replace('.json', '')
      .toLowerCase()
      .replace(/[\/\\]/g, '--')
      .replace(/\s+/g, '-');

    return {
      id,
      configName: preset.name,
      file: relativePath,
      mtimeMs: stats.mtimeMs,
      size: stats.size,
      presetType: 'eq',
      source: preset.source,
      readOnly: preset.readOnly,
      category: preset.device.category,
      manufacturer: preset.device.manufacturer,
      model: preset.device.model,
      variant: preset.device.variant,
    };
  }

  /**
   * Build metadata for PipelineConfig format
   */
  private buildPipelineConfigMetadata(
    config: PipelineConfig,
    relativePath: string,
    stats: { mtimeMs: number; size: number }
  ): ConfigMetadata {
    // Generate stable ID from relative path
    const id = relativePath
      .replace('.json', '')
      .toLowerCase()
      .replace(/[\/\\]/g, '--')
      .replace(/\s+/g, '-');

    const configName = config.configName || relativePath.replace('.json', '');

    return {
      id,
      configName,
      file: relativePath,
      mtimeMs: stats.mtimeMs,
      size: stats.size,
      presetType: 'pipeline',
      source: 'user',
      readOnly: false,
    };
  }

  /**
   * Get a specific config by ID
   * Returns PipelineConfig format (converts EqPresetV1 if needed)
   */
  async getConfig(id: string): Promise<PipelineConfig> {
    // Find matching file
    const configs = await this.listConfigs();
    const config = configs.find((c) => c.id === id);

    if (!config) {
      throw new AppError(
        ErrorCode.ERR_CONFIG_NOT_FOUND,
        `Config not found: ${id}`,
        404
      );
    }

    // Read file
    const filePath = join(this.configsDir, config.file);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      // Check if it's an EQ preset
      if (isEqPreset(data)) {
        // Convert EqPresetV1 to PipelineConfig (legacy filterArray format)
        return this.convertEqPresetToPipelineConfig(data);
      }

      // Validate PipelineConfig structure (strict type checks)
      if (typeof data.configName !== 'string' || data.configName.trim().length === 0) {
        throw new AppError(
          ErrorCode.ERR_CONFIG_INVALID_JSON,
          'Config is missing required field: configName (must be non-empty string)',
          400
        );
      }
      
      if (!Array.isArray(data.filterArray)) {
        throw new AppError(
          ErrorCode.ERR_CONFIG_INVALID_JSON,
          'Config is missing required field: filterArray (must be array)',
          400
        );
      }

      return data as PipelineConfig;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      
      throw new AppError(
        ErrorCode.ERR_CONFIG_INVALID_JSON,
        `Failed to parse config: ${(error as Error).message}`,
        400,
        { originalError: (error as Error).message }
      );
    }
  }

  /**
   * Convert EqPresetV1 to PipelineConfig format (runtime conversion)
   */
  private convertEqPresetToPipelineConfig(preset: EqPresetV1): PipelineConfig {
    const filterArray: Array<Record<string, any>> = [];

    // Add filters
    preset.bands.forEach((band, index) => {
      const filterNum = String(index + 1).padStart(2, '0');
      const filterName = `Filter${filterNum}`;

      // Normalize filter type casing for CamillaDSP compatibility
      // CamillaDSP expects: Lowshelf, Highshelf, Peaking (not LowShelf, HighShelf)
      let normalizedType: string = band.type;
      if (band.type === 'LowShelf') {
        normalizedType = 'Lowshelf';
      } else if (band.type === 'HighShelf') {
        normalizedType = 'Highshelf';
      }

      const filterDef: any = {
        type: normalizedType,
        freq: band.freqHz,
        q: band.q,
      };

      // Add gain for filter types that use it
      if (band.type === 'Peaking' || band.type === 'LowShelf' || band.type === 'HighShelf') {
        filterDef.gain = band.gainDb;
      }

      filterArray.push({
        [filterName]: filterDef,
      });
    });

    // Add preamp if non-zero
    if (preset.preampDb !== 0) {
      filterArray.push({
        Preamp: {
          gain: preset.preampDb,
        },
      });
    }

    // Add volume placeholder
    filterArray.push({
      Volume: {
        type: 'Volume',
        parameters: {},
      },
    });

    return {
      configName: preset.name,
      filterArray,
    };
  }

  /**
   * Save a config with the given ID
   * Enforces read-only protection for imported presets
   */
  async saveConfig(id: string, config: PipelineConfig): Promise<void> {
    // Check if ID matches a read-only preset
    const configs = await this.listConfigs();
    const existing = configs.find((c) => c.id === id);
    
    if (existing && existing.readOnly) {
      throw new AppError(
        ErrorCode.ERR_BAD_REQUEST,
        `Cannot overwrite read-only preset: ${existing.configName}. Please choose a different name or duplicate the preset.`,
        403
      );
    }

    // Validate input (strict type checks)
    if (typeof config.configName !== 'string' || config.configName.trim().length === 0) {
      throw new AppError(
        ErrorCode.ERR_BAD_REQUEST,
        'Config must include configName (non-empty string)',
        400
      );
    }
    
    if (!Array.isArray(config.filterArray)) {
      throw new AppError(
        ErrorCode.ERR_BAD_REQUEST,
        'Config must include filterArray (array)',
        400
      );
    }

    // Serialize to JSON
    let configJson: string;
    try {
      configJson = JSON.stringify(config, null, 2);
    } catch (error) {
      throw new AppError(
        ErrorCode.ERR_CONFIG_INVALID_JSON,
        'Config cannot be serialized to JSON',
        400,
        { originalError: (error as Error).message }
      );
    }

    // Check size (1MB limit)
    const configSize = Buffer.byteLength(configJson, 'utf-8');
    const MAX_SIZE = 1024 * 1024;
    if (configSize > MAX_SIZE) {
      throw new AppError(
        ErrorCode.ERR_CONFIG_TOO_LARGE,
        `Config size (${configSize} bytes) exceeds maximum allowed size (${MAX_SIZE} bytes)`,
        413
      );
    }

    // Ensure directory exists
    try {
      await fs.mkdir(this.configsDir, { recursive: true });
    } catch (error) {
      throw new AppError(
        ErrorCode.ERR_CONFIG_WRITE_FAILED,
        `Failed to create configs directory: ${(error as Error).message}`,
        500,
        { originalError: (error as Error).message }
      );
    }

    // Determine filename from ID (convert back to original case if possible)
    // For now, use ID with proper spacing
    const filename = `${id.replace(/-/g, ' ')}.json`;
    const filePath = join(this.configsDir, filename);
    const tempPath = `${filePath}.tmp`;

    try {
      // Write to temp file
      await fs.writeFile(tempPath, configJson, 'utf-8');

      // Atomic rename
      await fs.rename(tempPath, filePath);
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }

      throw new AppError(
        ErrorCode.ERR_CONFIG_WRITE_FAILED,
        `Failed to write config file: ${(error as Error).message}`,
        500,
        { originalError: (error as Error).message }
      );
    }
  }

  /**
   * Delete a config (for testing)
   */
  async deleteConfig(id: string): Promise<void> {
    const configs = await this.listConfigs();
    const config = configs.find((c) => c.id === id);

    if (!config) {
      throw new AppError(
        ErrorCode.ERR_CONFIG_NOT_FOUND,
        `Config not found: ${id}`,
        404
      );
    }

    const filePath = join(this.configsDir, config.file);
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
