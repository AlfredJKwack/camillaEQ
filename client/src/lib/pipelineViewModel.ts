/**
 * Pipeline view model builder
 * Converts CamillaDSP config into UI-friendly pipeline block structures
 */

import type { CamillaDSPConfig } from './camillaDSP';
import { normalizePipelineStep, type PipelineStepNormalized } from './camillaTypes';

/**
 * Filter info for display in FilterBlock
 */
export interface FilterInfo {
  name: string;
  iconType: string | null; // Biquad subtype for icon, or null for unsupported
  exists: boolean; // Whether filter is defined in config.filters
  bypassed: boolean; // Filter-level bypass state
}

/**
 * View model for Filter pipeline step
 */
export interface FilterBlockVm {
  kind: 'filter';
  stepIndex: number;
  blockId: string; // Stable UI identity
  channels: number[];
  bypassed: boolean; // Pipeline-level bypass
  filters: FilterInfo[];
}

/**
 * View model for Mixer pipeline step
 */
export interface MixerBlockVm {
  kind: 'mixer';
  stepIndex: number;
  blockId: string; // Stable UI identity
  name: string;
  bypassed: boolean;
  channelsInOut?: { in: number; out: number }; // From mixer definition
  exists: boolean; // Whether mixer is defined in config.mixers
}

/**
 * View model for Processor/Unknown pipeline step
 */
export interface ProcessorBlockVm {
  kind: 'processor';
  stepIndex: number;
  blockId: string; // Stable UI identity
  typeLabel: string; // e.g. "Processor", "Limiter", etc.
  name?: string;
  bypassed: boolean;
}

/**
 * Union of all block view models
 */
export type PipelineBlockVm = FilterBlockVm | MixerBlockVm | ProcessorBlockVm;

/**
 * Build pipeline view model from CamillaDSP config
 * @param config The CamillaDSP config
 * @param getBlockId Function to get stable block ID for a pipeline step
 */
export function buildPipelineViewModel(
  config: CamillaDSPConfig,
  getBlockId?: (stepObj: object, indexAtLoad: number, config: CamillaDSPConfig) => string
): PipelineBlockVm[] {
  const blocks: PipelineBlockVm[] = [];
  
  if (!config.pipeline || config.pipeline.length === 0) {
    return blocks;
  }
  
  for (let i = 0; i < config.pipeline.length; i++) {
    const step = normalizePipelineStep(config.pipeline[i]);
    
    if (!step) {
      continue; // Skip malformed steps
    }
    
    // Get blockId (use provided function or fallback to index-based ID)
    const stepObj = config.pipeline[i];
    const blockId = getBlockId 
      ? getBlockId(stepObj, i, config)
      : `${step.type}:${i}`;
    
    if (step.type === 'Filter') {
      blocks.push(buildFilterBlockVm(step, i, blockId, config));
    } else if (step.type === 'Mixer') {
      blocks.push(buildMixerBlockVm(step, i, blockId, config));
    } else {
      blocks.push(buildProcessorBlockVm(step, i, blockId));
    }
  }
  
  return blocks;
}

/**
 * Build FilterBlockVm from normalized Filter step
 */
function buildFilterBlockVm(
  step: PipelineStepNormalized,
  stepIndex: number,
  blockId: string,
  config: CamillaDSPConfig
): FilterBlockVm {
  const channels = step.channels || [];
  const filterNames = step.names || [];
  const bypassed = step.bypassed || false;
  
  const filters: FilterInfo[] = filterNames.map((name) => {
    const filterDef = config.filters[name];
    const exists = !!filterDef;
    
    let iconType: string | null = null;
    let filterBypassed = false;
    
    if (exists && filterDef.type === 'Biquad') {
      // Extract biquad subtype for icon
      iconType = filterDef.parameters?.type || null;
      filterBypassed = filterDef.parameters?.bypassed === true;
    }
    
    return {
      name,
      iconType,
      exists,
      bypassed: filterBypassed,
    };
  });
  
  return {
    kind: 'filter',
    stepIndex,
    blockId,
    channels,
    bypassed,
    filters,
  };
}

/**
 * Build MixerBlockVm from normalized Mixer step
 */
function buildMixerBlockVm(
  step: PipelineStepNormalized,
  stepIndex: number,
  blockId: string,
  config: CamillaDSPConfig
): MixerBlockVm {
  const name = step.name || '';
  const bypassed = step.bypassed || false;
  const mixerDef = config.mixers[name];
  const exists = !!mixerDef;
  
  let channelsInOut: { in: number; out: number } | undefined;
  
  if (exists && mixerDef.channels) {
    channelsInOut = {
      in: mixerDef.channels.in,
      out: mixerDef.channels.out,
    };
  }
  
  return {
    kind: 'mixer',
    stepIndex,
    blockId,
    name,
    bypassed,
    channelsInOut,
    exists,
  };
}

/**
 * Build ProcessorBlockVm from normalized Processor/Unknown step
 */
function buildProcessorBlockVm(
  step: PipelineStepNormalized,
  stepIndex: number,
  blockId: string
): ProcessorBlockVm {
  const typeLabel = step.type || 'Unknown';
  const name = step.name;
  const bypassed = step.bypassed || false;
  
  return {
    kind: 'processor',
    stepIndex,
    blockId,
    typeLabel,
    name,
    bypassed,
  };
}
