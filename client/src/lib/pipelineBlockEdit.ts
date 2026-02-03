/**
 * Pipeline block add/remove helpers
 * Pure functions for adding and removing entire pipeline steps
 */

import type { CamillaDSPConfig, PipelineStep} from './camillaDSP';
import { normalizePipelineStep } from './camillaTypes';

/**
 * Insert a pipeline step at the specified index
 * @param config The config to modify
 * @param index Index to insert at (clamped to valid range)
 * @param step The pipeline step to insert
 */
export function insertPipelineStep(
  config: CamillaDSPConfig,
  index: number,
  step: PipelineStep
): CamillaDSPConfig {
  const updated = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  
  // Ensure pipeline exists
  if (!updated.pipeline) {
    updated.pipeline = [];
  }
  
  // Clamp index to valid range
  const clampedIndex = Math.max(0, Math.min(updated.pipeline.length, index));
  
  updated.pipeline.splice(clampedIndex, 0, step);
  
  return updated;
}

/**
 * Remove a pipeline step at the specified index
 * @param config The config to modify
 * @param stepIndex Index of the step to remove
 */
export function removePipelineStep(
  config: CamillaDSPConfig,
  stepIndex: number
): CamillaDSPConfig {
  const updated = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  
  if (!updated.pipeline || stepIndex < 0 || stepIndex >= updated.pipeline.length) {
    throw new Error(`Invalid step index: ${stepIndex}`);
  }
  
  updated.pipeline.splice(stepIndex, 1);
  
  return updated;
}

/**
 * Set bypass state for a pipeline step
 * @param config The config to modify
 * @param stepIndex Index of the step to modify
 * @param bypassed New bypass state
 */
export function setPipelineStepBypassed(
  config: CamillaDSPConfig,
  stepIndex: number,
  bypassed: boolean
): CamillaDSPConfig {
  const updated = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  
  if (!updated.pipeline || stepIndex < 0 || stepIndex >= updated.pipeline.length) {
    throw new Error(`Invalid step index: ${stepIndex}`);
  }
  
  (updated.pipeline[stepIndex] as any).bypassed = bypassed;
  
  return updated;
}

/**
 * Set channels for a Filter pipeline step
 * @param config The config to modify
 * @param stepIndex Index of the Filter step
 * @param channels Array of channel numbers
 */
export function setFilterStepChannels(
  config: CamillaDSPConfig,
  stepIndex: number,
  channels: number[]
): CamillaDSPConfig {
  const updated = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  
  if (!updated.pipeline || stepIndex < 0 || stepIndex >= updated.pipeline.length) {
    throw new Error(`Invalid step index: ${stepIndex}`);
  }
  
  const step = updated.pipeline[stepIndex];
  if (step.type !== 'Filter') {
    throw new Error('Step is not a Filter step');
  }
  
  // Sort channels for stable stepKey generation
  (step as any).channels = [...channels].sort((a, b) => a - b);
  
  return updated;
}

/**
 * Create a new Filter pipeline step
 * @param config The config (used to validate channels)
 * @param channels Array of channel numbers (defaults to [0])
 */
export function createNewFilterStep(config: CamillaDSPConfig, channels?: number[]): PipelineStep {
  // Use provided channels or default to [0]
  const stepChannels = channels && channels.length > 0 ? channels : [0];
  
  // Sort for consistency
  const sortedChannels = [...stepChannels].sort((a, b) => a - b);
  
  return {
    type: 'Filter',
    channels: sortedChannels,
    names: [],
    description: 'Filter Block',
    bypassed: false,
  };
}

/**
 * Generate a unique mixer name that doesn't collide with existing mixers
 */
function generateUniqueMixerName(config: CamillaDSPConfig): string {
  const existingNames = Object.keys(config.mixers || {});
  let counter = 1;
  let name = `mixer_${counter}`;
  
  while (existingNames.includes(name)) {
    counter++;
    name = `mixer_${counter}`;
  }
  
  return name;
}

/**
 * Create a new Mixer block (definition + pipeline step)
 * Returns both the mixer definition and the pipeline step
 * Mixer is a 2→2 passthrough by default
 */
export function createNewMixerBlock(config: CamillaDSPConfig): {
  mixerName: string;
  mixerDef: any;
  step: PipelineStep;
} {
  const mixerName = generateUniqueMixerName(config);
  
  // Create 2→2 passthrough mixer (same pattern as MVP-22 test config)
  const mixerDef = {
    description: 'Mixer',
    channels: { in: 2, out: 2 },
    mapping: [
      {
        dest: 0,
        sources: [
          { channel: 0, gain: 0, inverted: false, mute: false, scale: 'dB' },
        ],
        mute: false,
      },
      {
        dest: 1,
        sources: [
          { channel: 1, gain: 0, inverted: false, mute: false, scale: 'dB' },
        ],
        mute: false,
      },
    ],
  };
  
  const step: PipelineStep = {
    type: 'Mixer',
    name: mixerName,
    description: 'Mixer',
    bypassed: false,
  };
  
  return { mixerName, mixerDef, step };
}

/**
 * Generate a unique processor name that doesn't collide with existing processors
 */
function generateUniqueProcessorName(config: CamillaDSPConfig, baseName: string): string {
  const existingNames = Object.keys(config.processors || {});
  
  // If base name is available, use it
  if (!existingNames.includes(baseName)) {
    return baseName;
  }
  
  // Otherwise append counter
  let counter = 1;
  let name = `${baseName}_${counter}`;
  
  while (existingNames.includes(name)) {
    counter++;
    name = `${baseName}_${counter}`;
  }
  
  return name;
}

/**
 * Create a new Processor block (definition + pipeline step)
 * MVP-24: Now creates valid definitions for Compressor/NoiseGate
 * @param config The config
 * @param processorType The processor definition type (e.g. 'Compressor', 'NoiseGate')
 * @param baseName The base name for the processor (will be made unique)
 */
export function createNewProcessorBlock(
  config: CamillaDSPConfig,
  processorType: string,
  baseName: string
): {
  processorName: string;
  processorDef: any;
  step: PipelineStep;
} {
  const processorName = generateUniqueProcessorName(config, baseName);
  
  // MVP-24: Create valid processor definitions with required fields
  let processorDef: any;
  
  if (processorType === 'Compressor') {
    processorDef = {
      type: 'Compressor',
      parameters: {
        channels: 2,
        threshold: -20.0,
        factor: 2.0,
        attack: 0.01,
        release: 0.1,
        makeup_gain: 0.0,
      },
    };
  } else if (processorType === 'NoiseGate') {
    processorDef = {
      type: 'NoiseGate',
      parameters: {
        channels: 2,
        threshold: -50.0,
        attenuation: -60.0,
        attack: 0.01,
        release: 0.1,
      },
    };
  } else {
    // Unknown processor type: create minimal definition with type field
    processorDef = {
      type: processorType,
      parameters: {},
    };
  }
  
  const step: PipelineStep = {
    type: 'Processor',
    name: processorName,
    description: processorType,
    bypassed: false,
  };
  
  return { processorName, processorDef, step };
}

/**
 * Clean up orphaned definitions (mixers, processors, filters)
 * Removes definitions that are no longer referenced in the pipeline
 * @param config The config to clean
 */
export function cleanupOrphanDefinitions(config: CamillaDSPConfig): CamillaDSPConfig {
  const updated = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  
  // Track referenced mixers
  const referencedMixers = new Set<string>();
  if (updated.pipeline) {
    for (const step of updated.pipeline) {
      const normalized = normalizePipelineStep(step);
      if (normalized && normalized.type === 'Mixer' && normalized.name) {
        referencedMixers.add(normalized.name);
      }
    }
  }
  
  // Remove orphaned mixers
  if (updated.mixers) {
    for (const mixerName of Object.keys(updated.mixers)) {
      if (!referencedMixers.has(mixerName)) {
        delete updated.mixers[mixerName];
      }
    }
  }
  
  // Track referenced processors
  const referencedProcessors = new Set<string>();
  if (updated.pipeline) {
    for (const step of updated.pipeline) {
      const normalized = normalizePipelineStep(step);
      if (
        normalized &&
        normalized.type !== 'Filter' &&
        normalized.type !== 'Mixer' &&
        normalized.name
      ) {
        referencedProcessors.add(normalized.name);
      }
    }
  }
  
  // Remove orphaned processors
  if (updated.processors) {
    for (const procName of Object.keys(updated.processors)) {
      if (!referencedProcessors.has(procName)) {
        delete updated.processors[procName];
      }
    }
  }
  
  // Track referenced filters (across all Filter steps)
  const referencedFilters = new Set<string>();
  if (updated.pipeline) {
    for (const step of updated.pipeline) {
      const normalized = normalizePipelineStep(step);
      if (normalized && normalized.type === 'Filter' && normalized.names) {
        for (const filterName of normalized.names) {
          referencedFilters.add(filterName);
        }
      }
    }
  }
  
  // Remove orphaned filters
  if (updated.filters) {
    for (const filterName of Object.keys(updated.filters)) {
      if (!referencedFilters.has(filterName)) {
        delete updated.filters[filterName];
      }
    }
  }
  
  return updated;
}

/**
 * Get available channels from config
 * Returns array of channel numbers [0, 1, ...n-1]
 */
export function getAvailableChannels(config: CamillaDSPConfig): number[] {
  // Try playback channels first, then capture, default to 2
  const numChannels = 
    (config.devices?.playback as any)?.channels ?? 
    (config.devices?.capture as any)?.channels ?? 
    2;
  
  return Array.from({ length: numChannels }, (_, i) => i);
}
