import { promises as fs } from 'fs';
import { join } from 'path';
import { AppError, ErrorCode } from '../types/errors.js';

/**
 * Configuration for configs library
 */
export interface ConfigsLibraryConfig {
  /** Directory where config library is stored */
  configsDir?: string;
}

const DEFAULT_CONFIGS_DIR = './data/configs';

/**
 * Metadata for a saved config
 */
export interface ConfigMetadata {
  id: string; // filename without extension (kebab-case)
  configName: string; // human-readable name from JSON
  file: string; // original filename
  mtimeMs: number; // last modified timestamp
  size: number; // file size in bytes
}

/**
 * Pipeline config format (canonical on-disk format for MVP-9)
 */
export interface PipelineConfig {
  configName: string;
  accessKey?: string;
  filterArray: Array<Record<string, any>>;
}

/**
 * Configs library service for managing saved configurations
 */
export class ConfigsLibrary {
  private configsDir: string;

  constructor(config: ConfigsLibraryConfig = {}) {
    this.configsDir = config.configsDir || process.env.CONFIGS_DIR || DEFAULT_CONFIGS_DIR;
  }

  /**
   * Get the configs directory path
   */
  getConfigsDir(): string {
    return this.configsDir;
  }

  /**
   * List all available configs with metadata
   */
  async listConfigs(): Promise<ConfigMetadata[]> {
    try {
      // Read directory
      const files = await fs.readdir(this.configsDir);
      
      // Filter for .json files only
      const jsonFiles = files.filter((f) => f.endsWith('.json'));

      // Read each file to get metadata
      const configs = await Promise.all(
        jsonFiles.map(async (file) => {
          const filePath = join(this.configsDir, file);
          const stats = await fs.stat(filePath);
          
          // Read file to get configName
          let configName = file.replace('.json', ''); // fallback
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const data = JSON.parse(content) as PipelineConfig;
            if (data.configName) {
              configName = data.configName;
            }
          } catch {
            // Use filename as fallback
          }

          // Generate ID (kebab-case from filename)
          const id = file.replace('.json', '').toLowerCase().replace(/\s+/g, '-');

          return {
            id,
            configName,
            file,
            mtimeMs: stats.mtimeMs,
            size: stats.size,
          };
        })
      );

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
   * Get a specific config by ID
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
      const data = JSON.parse(content) as PipelineConfig;
      
      // Validate structure
      if (!data.configName || !data.filterArray) {
        throw new AppError(
          ErrorCode.ERR_CONFIG_INVALID_JSON,
          'Config is missing required fields (configName, filterArray)',
          400
        );
      }

      return data;
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
   * Save a config with the given ID
   */
  async saveConfig(id: string, config: PipelineConfig): Promise<void> {
    // Validate input
    if (!config.configName || !config.filterArray) {
      throw new AppError(
        ErrorCode.ERR_BAD_REQUEST,
        'Config must include configName and filterArray',
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
