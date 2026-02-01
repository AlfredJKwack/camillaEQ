/**
 * Pipeline block add/remove helpers
 * Pure functions for adding and removing entire pipeline steps
 */

import type { CamillaDSPConfig, PipelineStep } from './camillaDSP';
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
  
  if (stepIndex < 0 || stepIndex >= updated.pipeline.length) {
    throw new Error(`Invalid step index: ${stepIndex}`);
  }
  
  updated.pipeline.splice(stepIndex, 1);
  
  return updated;
}

/**
 * Create a new Filter pipeline step
 * Uses channel 0 by default (first available channel)
 * @param config The config (used to determine available channels)
 */
export function createNewFilterStep(config: CamillaDSPConfig): PipelineStep {
  // Use first available channel (channel 0)
  // Could be extended to check devices.capture.channels if needed
  const channels = [0];
  
  return {
    type: 'Filter',
    channels,
    names: [],
    description: 'Filter Block',
    bypassed: false,
  };
}

/**
 * Generate a unique mixer name that doesn't collide with existing mixers
 */
function generateUniqueMixerName(config: CamillaDSPConfig): string {
  const existingNames = Object.keys(config.mixers);
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
 * @param config The config
 * @param type The processor type (e.g. 'Processor', 'Limiter', 'Compressor')
 * @param baseName The base name for the processor (will be made unique)
 */
export function createNewProcessorBlock(
  config: CamillaDSPConfig,
  type: string,
  baseName: string
): {
  processorName: string;
  processorDef: any;
  step: PipelineStep;
} {
  const processorName = generateUniqueProcessorName(config, baseName);
  
  // Create minimal processor definition (empty object)
  // User must configure externally
  const processorDef = {};
  
  const step: PipelineStep = {
    type,
    name: processorName,
    description: type,
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
  for (const step of updated.pipeline) {
    const normalized = normalizePipelineStep(step);
    if (normalized && normalized.type === 'Mixer' && normalized.name) {
      referencedMixers.add(normalized.name);
    }
  }
  
  // Remove orphaned mixers
  for (const mixerName of Object.keys(updated.mixers)) {
    if (!referencedMixers.has(mixerName)) {
      delete updated.mixers[mixerName];
    }
  }
  
  // Track referenced processors
  const referencedProcessors = new Set<string>();
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
  for (const step of updated.pipeline) {
    const normalized = normalizePipelineStep(step);
    if (normalized && normalized.type === 'Filter' && normalized.names) {
      for (const filterName of normalized.names) {
        referencedFilters.add(filterName);
      }
    }
  }
  
  // Remove orphaned filters
  for (const filterName of Object.keys(updated.filters)) {
    if (!referencedFilters.has(filterName)) {
      delete updated.filters[filterName];
    }
  }
  
  return updated;
}
