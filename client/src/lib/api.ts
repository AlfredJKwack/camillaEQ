/**
 * API client module - single boundary for all server HTTP calls
 * Encapsulates fetch logic and error handling
 */

import type { CamillaDSPConfig } from './camillaDSP';

/**
 * API error with status code and message
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Preset config structure (library format)
 * 
 * Legacy format:
 * - configName, accessKey, filterArray
 * 
 * Extended format:
 * - configName, accessKey, filterArray (can be empty [])
 * - filters, mixers, processors, pipeline (optional)
 * - title, description (optional)
 */
export interface PresetConfig {
  configName: string;
  accessKey?: string;
  filterArray: Array<Record<string, any>>;
  
  // Extended format fields
  title?: string;
  description?: string;
  filters?: Record<string, any>;
  mixers?: Record<string, any>;
  processors?: Record<string, any>;
  pipeline?: any[];
}

/**
 * Config metadata from server
 */
export interface ConfigMetadata {
  id: string;
  configName: string;
  file: string;
  mtimeMs: number;
  size: number;
}

/**
 * Server version response
 */
export interface VersionInfo {
  version: string;
}

/**
 * Fetch latest CamillaDSP state from server
 */
export async function getLatestState(): Promise<CamillaDSPConfig> {
  const response = await fetch('/api/state/latest');
  
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `Failed to fetch latest state: ${response.status} ${response.statusText}`
    );
  }
  
  return await response.json();
}

/**
 * Save latest CamillaDSP state to server (write-through)
 */
export async function putLatestState(config: CamillaDSPConfig): Promise<void> {
  const response = await fetch('/api/state/latest', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `Failed to save latest state: ${response.status} ${response.statusText}`
    );
  }
}

/**
 * Get server version info
 */
export async function getVersion(): Promise<VersionInfo> {
  const response = await fetch('/api/version');
  
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `Failed to fetch version: ${response.status} ${response.statusText}`
    );
  }
  
  return await response.json();
}

/**
 * List all saved preset configs with metadata
 */
export async function listConfigs(): Promise<ConfigMetadata[]> {
  const response = await fetch('/api/configs');
  
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `Failed to list configs: ${response.status} ${response.statusText}`
    );
  }
  
  return await response.json();
}

/**
 * Get a specific preset config by ID
 */
export async function getConfig(id: string): Promise<PresetConfig> {
  const response = await fetch(`/api/configs/${id}`);
  
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `Failed to fetch config '${id}': ${response.status} ${response.statusText}`
    );
  }
  
  return await response.json();
}

/**
 * Save a preset config by ID
 */
export async function putConfig(id: string, config: PresetConfig): Promise<void> {
  const response = await fetch(`/api/configs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  
  if (!response.ok) {
    throw new ApiError(
      response.status,
      `Failed to save config '${id}': ${response.status} ${response.statusText}`
    );
  }
}
