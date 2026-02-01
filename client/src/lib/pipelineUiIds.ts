/**
 * Pipeline UI identity management
 * Provides stable IDs for pipeline blocks across reorders and config clones
 */

import type { CamillaDSPConfig } from './camillaDSP';
import { getDisabledFiltersForStep, getStepKey } from './disabledFiltersOverlay';

/**
 * Generate a stable signature for a pipeline step
 * This signature is used to identify the same logical step across config clones
 * 
 * For Filter steps, includes both enabled and disabled filters to ensure
 * blockId stability when toggling filters on/off
 */
function getStepSignature(step: any, stepIndex: number): string {
  const type = step.type || 'Unknown';
  
  if (type === 'Mixer') {
    // Mixer: identify by name
    return `Mixer:${step.name || 'unnamed'}`;
  } else if (type === 'Filter') {
    // Filter: identify by channels + all filters (enabled + disabled, sorted for stability)
    const channels = (step.channels || []).slice().sort((a: number, b: number) => a - b);
    const channelsStr = channels.join(',');
    
    // Get enabled filters from step.names
    const enabledNames = (step.names || []).slice();
    
    // Get disabled filters from overlay
    const stepKey = getStepKey(channels, stepIndex);
    const disabledFilters = getDisabledFiltersForStep(stepKey);
    const disabledNames = disabledFilters.map(f => f.filterName);
    
    // Union of enabled + disabled (sorted for stable signature)
    const allNames = [...enabledNames, ...disabledNames].sort().join(',');
    
    return `Filter:${channelsStr}:${allNames}`;
  } else {
    // Other processors: identify by type + name
    const name = step.name || '';
    return `${type}:${name}`;
  }
}

/**
 * Stable ID provider for pipeline blocks
 * IDs remain stable across config clones and reorders by using step signatures
 */
class PipelineIdProvider {
  // Map from signature to stable ID
  private signatureToId = new Map<string, string>();
  
  // Map from ID to current step object (refreshed on each getBlockId call)
  private idToStep = new Map<string, object>();
  
  // Counter for generating unique IDs when signatures collide
  private idCounter = 0;

  /**
   * Get stable ID for a pipeline step object
   * @param stepObj The actual pipeline step object from config.pipeline
   * @param indexAtLoad The index when this config was first loaded (used as tiebreaker)
   * @param config The parent config (used to detect config changes)
   */
  getBlockId(stepObj: object, indexAtLoad: number, config: CamillaDSPConfig): string {
    const signature = getStepSignature(stepObj, indexAtLoad);
    
    // Check if we've seen this signature before
    let id = this.signatureToId.get(signature);
    
    if (!id) {
      // Generate new ID for this signature
      id = `block_${this.idCounter++}_${signature}`;
      this.signatureToId.set(signature, id);
    }
    
    // Update reverse mapping to current step object
    this.idToStep.set(id, stepObj);
    
    return id;
  }

  /**
   * Get the pipeline step object for a given blockId
   */
  getStepByBlockId(blockId: string): object | undefined {
    return this.idToStep.get(blockId);
  }

  /**
   * Reset all mappings (useful for testing or forced refresh)
   */
  reset(): void {
    this.signatureToId.clear();
    this.idToStep.clear();
    this.idCounter = 0;
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
