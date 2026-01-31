/**
 * Pipeline UI identity management
 * Provides stable IDs for pipeline blocks across reorders
 */

import type { CamillaDSPConfig } from './camillaDSP';

/**
 * Stable ID provider for pipeline blocks
 * IDs are computed once per config load and remain stable during reorders
 */
class PipelineIdProvider {
  private lastConfigRef: CamillaDSPConfig | null = null;
  private blockIds = new WeakMap<object, string>();
  private reverseMap = new Map<string, object>();

  /**
   * Get stable ID for a pipeline step object
   * @param stepObj The actual pipeline step object from config.pipeline
   * @param indexAtLoad The index when this config was first loaded (used as tiebreaker)
   * @param config The parent config (used to detect config changes)
   */
  getBlockId(stepObj: object, indexAtLoad: number, config: CamillaDSPConfig): string {
    // Reset if config reference changed
    if (this.lastConfigRef !== config) {
      this.blockIds = new WeakMap();
      this.reverseMap = new Map();
      this.lastConfigRef = config;
    }

    // Return existing ID if already assigned
    const existingId = this.blockIds.get(stepObj);
    if (existingId) {
      return existingId;
    }

    // Generate new ID
    const step = stepObj as any;
    const type = step.type || 'Unknown';
    const name = step.name || '';
    const id = `${type}:${name}:${indexAtLoad}`;

    // Store bidirectional mapping
    this.blockIds.set(stepObj, id);
    this.reverseMap.set(id, stepObj);

    return id;
  }

  /**
   * Get the pipeline step object for a given blockId
   */
  getStepByBlockId(blockId: string): object | undefined {
    return this.reverseMap.get(blockId);
  }

  /**
   * Reset all mappings (useful for testing or forced refresh)
   */
  reset(): void {
    this.lastConfigRef = null;
    this.blockIds = new WeakMap();
    this.reverseMap = new Map();
  }
}

// Singleton instance
const idProvider = new PipelineIdProvider();

/**
 * Get stable block ID for a pipeline step
 */
export function getBlockId(stepObj: object, indexAtLoad: number, config: CamillaDSPConfig): string {
  return idProvider.getBlockId(stepObj, indexAtLoad, config);
}

/**
 * Get step object by block ID
 */
export function getStepByBlockId(blockId: string): object | undefined {
  return idProvider.getStepByBlockId(blockId);
}

/**
 * Reset ID provider (for testing)
 */
export function resetIdProvider(): void {
  idProvider.reset();
}
