/**
 * Pipeline view model builder
 * Converts CamillaDSP config into UI-friendly pipeline block structures
 */

import type { CamillaDSPConfig } from './camillaDSP';
import { normalizePipelineStep, type PipelineStepNormalized } from './camillaTypes';
import { getDisabledFiltersForStep, getStepKey } from './disabledFiltersOverlay';
import { 
  isKnownProcessorType, 
  getFilterUiKind, 
  isEditableFilterKind,
  isKnownEditableFilter,
  getFilterSummary,
  getFilterNotEditableReason,
  type FilterUiKind
} from './knownTypes';

/**
 * Filter info for display in FilterBlock
 */
export interface FilterInfo {
  name: string;
  iconType: string | null; // Biquad subtype for icon, or null for unsupported
  exists: boolean; // Whether filter is defined in config.filters
  disabled: boolean; // Whether filter is disabled (UI overlay state)
  bypassed: boolean; // Whether filter is bypassed (from filter definition)
  // MVP-21/24: Parameter data for editing (only populated for Biquad filters)
  filterType?: string; // e.g. 'Biquad', 'Gain', 'Delay'
  biquadType?: string; // e.g. 'Peaking', 'Highpass'
  freq?: number;
  q?: number;
  gain?: number;
  supportsGain: boolean; // Whether this filter type can have gain
  // MVP-24+: Enhanced type support
  uiKind: FilterUiKind; // UI rendering category
  summary: string[]; // Human-readable summary for compact display
  editable: boolean; // Whether we can show parameter editor (vs JSON only)
  definition?: any; // Raw filter definition for JSON display
  unknownReason?: string; // Why filter is not editable
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
 * MVP-24: Extended to support known processor types (Compressor/NoiseGate)
 */
export interface ProcessorBlockVm {
  kind: 'processor';
  stepIndex: number;
  blockId: string; // Stable UI identity
  typeLabel: string; // e.g. "Processor", "Compressor", "NoiseGate", "Processor (Unknown)"
  name?: string;
  bypassed: boolean;
  // MVP-24: Processor definition support
  exists: boolean; // Whether processor name exists in config.processors
  processorType?: string; // definition.type (e.g. 'Compressor', 'NoiseGate')
  definition?: any; // Raw processor definition for JSON display
  supported: boolean; // True only for Compressor/NoiseGate
  rawStep?: any; // Raw pipeline step for unknown/odd step types
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
      // MVP-24: Enhanced processor support
      blocks.push(buildProcessorBlockVm(step, i, blockId, config, stepObj));
    }
  }
  
  return blocks;
}

/**
 * Build FilterBlockVm from normalized Filter step
 * Merges active filters (from step.names) with disabled filters (from overlay)
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
  
  // Get step key for overlay lookup
  const stepKey = getStepKey(channels, stepIndex);
  const disabledFilters = getDisabledFiltersForStep(stepKey);
  
  // Build FilterInfo for active filters
  const activeFilters: FilterInfo[] = filterNames.map((name) => {
    return buildFilterInfo(name, config, false);
  });
  
  // Build FilterInfo for disabled filters
  const disabledFilterInfos: FilterInfo[] = disabledFilters.map((loc) => {
    return buildFilterInfo(loc.filterName, config, true);
  });
  
  // Merge: reconstruct original order using slot-fill algorithm
  // This preserves absolute positions of both active and disabled filters
  const totalSlots = activeFilters.length + disabledFilterInfos.length;
  const slots: (FilterInfo | null)[] = new Array(totalSlots).fill(null);
  
  // Step 1: Place disabled filters at their stored indices
  for (let i = 0; i < disabledFilterInfos.length; i++) {
    const disabledLoc = disabledFilters[i];
    let targetIndex = Math.min(disabledLoc.index, totalSlots - 1);
    
    // Handle index collisions by finding next available slot
    while (targetIndex < totalSlots && slots[targetIndex] !== null) {
      targetIndex++;
    }
    
    if (targetIndex < totalSlots) {
      slots[targetIndex] = disabledFilterInfos[i];
    }
  }
  
  // Step 2: Fill remaining empty slots with active filters (left-to-right)
  let activeIdx = 0;
  for (let i = 0; i < totalSlots; i++) {
    if (slots[i] === null && activeIdx < activeFilters.length) {
      slots[i] = activeFilters[activeIdx];
      activeIdx++;
    }
  }
  
  // Step 3: Extract non-null entries (should be all of them)
  const allFilters = slots.filter((f): f is FilterInfo => f !== null);
  
  return {
    kind: 'filter',
    stepIndex,
    blockId,
    channels,
    bypassed,
    filters: allFilters,
  };
}

/**
 * Build FilterInfo for a single filter (MVP-24+: with enhanced type support)
 */
function buildFilterInfo(
  name: string,
  config: CamillaDSPConfig,
  disabled: boolean
): FilterInfo {
  const filterDef = config.filters?.[name];
  const exists = !!filterDef;
  
  let iconType: string | null = null;
  let bypassed = false;
  
  // MVP-21/24+: Extract parameter data for editing
  let filterType: string | undefined;
  let biquadType: string | undefined;
  let freq: number | undefined;
  let q: number | undefined;
  let gain: number | undefined;
  let supportsGain = false;
  let uiKind: FilterUiKind = 'unknown';
  let summary: string[] = [];
  let editable = false;
  let definition: any = undefined;
  let unknownReason: string | undefined;
  
  if (exists) {
    definition = filterDef;
    
    // Determine UI rendering category
    uiKind = getFilterUiKind(filterDef);
    summary = getFilterSummary(filterDef);
    
    // Use comprehensive editability check (validates biquad subtypes, etc.)
    editable = isEditableFilterKind(uiKind) && 
               (uiKind !== 'biquad' || isKnownEditableFilter(filterDef));
    
    if (!editable) {
      unknownReason = getFilterNotEditableReason(filterDef);
    }
    
    // Extract bypassed flag (works for all filter types)
    bypassed = (filterDef.parameters as any)?.bypassed || false;
    filterType = filterDef.type;
    
    if (filterDef.type === 'Biquad') {
      const params = filterDef.parameters as any;
      
      // Extract biquad subtype for icon
      iconType = params?.type || null;
      
      // MVP-21: Extract parameters
      biquadType = params?.type;
      freq = params?.freq;
      q = params?.q;
      gain = params?.gain;
      
      // Determine if this type supports gain
      const type = biquadType?.toLowerCase() || '';
      supportsGain = type === 'peaking' || type === 'highshelf' || type === 'lowshelf' || type === 'notch';
    }
  }
  
  return {
    name,
    iconType,
    exists,
    disabled,
    bypassed,
    filterType,
    biquadType,
    freq,
    q,
    gain,
    supportsGain,
    uiKind,
    summary,
    editable,
    definition,
    unknownReason,
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
  const mixerDef = config.mixers?.[name];
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
 * MVP-24: Now looks up processor definition and checks if supported
 */
function buildProcessorBlockVm(
  step: PipelineStepNormalized,
  stepIndex: number,
  blockId: string,
  config: CamillaDSPConfig,
  rawStep: any
): ProcessorBlockVm {
  const name = step.name;
  const bypassed = step.bypassed || false;
  
  // Default values for unknown/unsupported processors
  let typeLabel: string = step.type || 'Unknown';
  let exists = false;
  let processorType: string | undefined;
  let definition: any = undefined;
  let supported = false;
  
  // Check if this is a proper Processor step with a name
  if (step.type === 'Processor' && name) {
    // Look up processor definition
    const processorDef = config.processors?.[name];
    exists = !!processorDef;
    
    if (exists && processorDef) {
      definition = processorDef;
      processorType = processorDef.type;
      
      // Check if this is a known, supported processor type
      if (isKnownProcessorType(processorType)) {
        supported = true;
        typeLabel = processorType; // Use actual type as label (Compressor/NoiseGate)
      } else {
        // Processor exists but type is unknown
        typeLabel = processorType ? `Processor (${processorType})` : 'Processor (Unknown)';
      }
    } else {
      // Processor step references missing definition
      typeLabel = 'Processor (Missing)';
    }
  } else {
    // Unknown pipeline step type (not Filter, Mixer, or Processor)
    typeLabel = step.type || 'Unknown Step';
  }
  
  return {
    kind: 'processor',
    stepIndex,
    blockId,
    typeLabel,
    name,
    bypassed,
    exists,
    processorType,
    definition,
    supported,
    rawStep,
  };
}
