import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { AppError, ErrorCode } from '../types/errors.js';

/**
 * Configuration for config storage
 */
export interface ConfigStoreConfig {
  /** Directory where config file is stored */
  configDir?: string;
  /** Config file name */
  configFileName?: string;
  /** Maximum config file size in bytes */
  maxConfigSize?: number;
}

const DEFAULT_CONFIG_DIR = './data';
const DEFAULT_CONFIG_FILE = 'config.json';
const DEFAULT_MAX_SIZE = 1024 * 1024; // 1MB

/**
 * Config storage service with atomic write operations
 */
export class ConfigStore {
  private configDir: string;
  private configFileName: string;
  private maxConfigSize: number;

  constructor(config: ConfigStoreConfig = {}) {
    this.configDir = config.configDir || process.env.CONFIG_DIR || DEFAULT_CONFIG_DIR;
    this.configFileName = config.configFileName || DEFAULT_CONFIG_FILE;
    this.maxConfigSize = config.maxConfigSize || DEFAULT_MAX_SIZE;
  }

  /**
   * Get the full path to the config file
   */
  getConfigPath(): string {
    return join(this.configDir, this.configFileName);
  }

  /**
   * Ensure the config directory exists
   */
  private async ensureConfigDir(): Promise<void> {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
    } catch (error) {
      throw new AppError(
        ErrorCode.ERR_CONFIG_WRITE_FAILED,
        `Failed to create config directory: ${(error as Error).message}`,
        500,
        { originalError: (error as Error).message }
      );
    }
  }

  /**
   * Read config from disk
   * @returns The config object
   */
  async readConfig(): Promise<unknown> {
    const configPath = this.getConfigPath();

    try {
      const data = await fs.readFile(configPath, 'utf-8');
      
      // Validate JSON parse
      try {
        return JSON.parse(data);
      } catch (parseError) {
        throw new AppError(
          ErrorCode.ERR_CONFIG_INVALID_JSON,
          'Config file contains invalid JSON',
          400,
          { originalError: (parseError as Error).message }
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new AppError(
          ErrorCode.ERR_CONFIG_NOT_FOUND,
          'Config file not found',
          404
        );
      }
      
      // If it's already an AppError, re-throw it
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        ErrorCode.ERR_CONFIG_WRITE_FAILED,
        `Failed to read config file: ${(error as Error).message}`,
        500,
        { originalError: (error as Error).message }
      );
    }
  }

  /**
   * Write config to disk with atomic operation
   * @param config - The config object to write
   */
  async writeConfig(config: unknown): Promise<void> {
    // Validate input
    if (config === null || config === undefined) {
      throw new AppError(
        ErrorCode.ERR_BAD_REQUEST,
        'Config cannot be null or undefined',
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

    // Check size
    const configSize = Buffer.byteLength(configJson, 'utf-8');
    if (configSize > this.maxConfigSize) {
      throw new AppError(
        ErrorCode.ERR_CONFIG_TOO_LARGE,
        `Config size (${configSize} bytes) exceeds maximum allowed size (${this.maxConfigSize} bytes)`,
        413
      );
    }

    // Ensure directory exists
    await this.ensureConfigDir();

    const configPath = this.getConfigPath();
    const tempPath = `${configPath}.tmp`;

    try {
      // Write to temp file
      await fs.writeFile(tempPath, configJson, 'utf-8');

      // Atomic rename
      await fs.rename(tempPath, configPath);
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
   * Check if config file exists
   */
  async configExists(): Promise<boolean> {
    try {
      await fs.access(this.getConfigPath());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete config file (for testing)
   */
  async deleteConfig(): Promise<void> {
    try {
      await fs.unlink(this.getConfigPath());
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
