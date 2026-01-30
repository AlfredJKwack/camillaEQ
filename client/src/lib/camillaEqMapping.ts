/**
 * Mapping layer between CamillaDSP config and EqBand representation
 * Handles bidirectional conversion and validation
 */

import type { EqBand } from '../dsp/filterResponse';
import type { CamillaDSPConfig, FilterDefinition } from './camillaDSP';

export interface ExtractedEqData {
  bands: EqBand[];
  filterNames: string[];
  channels: number[];
  preampGain: number; // Master-band gain (±24 dB), moves zero-line on EQ plot
  orderNumbers: number[]; // Pipeline-relative position (1-based) for each band
}

/**
 * Map CamillaDSP biquad subtype to EqBand type
 */
function mapCamillaBiquadType(camillaType: string): EqBand['type'] | null {
  switch (camillaType) {
    case 'Highpass':
      return 'HighPass';
    case 'Lowpass':
      return 'LowPass';
    case 'Peaking':
      return 'Peaking';
    case 'Highshelf':
      return 'HighShelf';
    case 'Lowshelf':
      return 'LowShelf';
    case 'Bandpass':
      return 'BandPass';
    case 'Notch':
      return 'Notch';
    case 'Allpass':
      return 'AllPass';
    default:
      return null;
  }
}

/**
 * Map EqBand type to CamillaDSP biquad subtype
 */
function mapEqBandTypeToCamilla(type: EqBand['type']): string {
  switch (type) {
    case 'HighPass':
      return 'Highpass';
    case 'LowPass':
      return 'Lowpass';
    case 'Peaking':
      return 'Peaking';
    case 'HighShelf':
      return 'Highshelf';
    case 'LowShelf':
      return 'Lowshelf';
    case 'BandPass':
      return 'Bandpass';
    case 'Notch':
      return 'Notch';
    case 'AllPass':
      return 'Allpass';
  }
}

/**
 * Extract EQ bands from CamillaDSP config
 * Applies to ALL filter pipeline channels
 */
export function extractEqBandsFromConfig(config: CamillaDSPConfig): ExtractedEqData {
  const bands: EqBand[] = [];
  const filterNames: string[] = [];
  const channels: number[] = [];
  const orderNumbers: number[] = [];

  // Extract preamp gain from mixers (if present)
  let preampGain = 0;
  if (config.mixers && config.mixers.preamp) {
    const preampMixer = config.mixers.preamp;
    if (preampMixer.mapping && preampMixer.mapping[0]?.sources?.[0]) {
      preampGain = preampMixer.mapping[0].sources[0].gain || 0;
      // Clamp to EQ plot range (±24 dB)
      preampGain = Math.max(-24, Math.min(24, preampGain));
    }
  }

  // Find all Filter pipeline steps
  const filterSteps = config.pipeline.filter((step) => step.type === 'Filter');

  if (filterSteps.length === 0) {
    return { bands: [], filterNames: [], channels: [], preampGain, orderNumbers: [] };
  }

  // Use channel 0 as the reference for filter order (v3 format only)
  const channel0Step = filterSteps.find((step) => {
    const stepAny = step as any;
    return Array.isArray(stepAny.channels) && stepAny.channels.includes(0);
  });
  
  if (!channel0Step) {
    return { bands: [], filterNames: [], channels: [], preampGain, orderNumbers: [] };
  }

  const refNames = (channel0Step as any).names || [];
  
  // Track which channels we're editing (v3 format: channels is an array)
  for (const step of filterSteps) {
    const stepAny = step as any;
    
    if (Array.isArray(stepAny.channels)) {
      for (const ch of stepAny.channels) {
        if (!channels.includes(ch)) {
          channels.push(ch);
        }
      }
    }
  }

  // Extract bands from filters (tracking pipeline position)
  for (let refIndex = 0; refIndex < refNames.length; refIndex++) {
    const filterName = refNames[refIndex];
    const filterDef = config.filters[filterName];
    
    if (!filterDef) {
      console.warn(`Filter "${filterName}" referenced in pipeline but not found in config.filters`);
      continue;
    }

    // Only support Biquad filters with the 7 supported subtypes
    if (filterDef.type !== 'Biquad') {
      continue;
    }

    const params = filterDef.parameters;
    const camillaType = params.type;
    const bandType = mapCamillaBiquadType(camillaType);

    if (!bandType) {
      // Skip unsupported biquad subtypes (e.g., LinkwitzTransform, Free)
      continue;
    }

    // Determine if filter is enabled (not bypassed)
    // Check both filter-level and pipeline-level bypass
    const filterBypassed = params.bypassed === true;
    const pipelineBypassed = (channel0Step as any).bypassed === true;
    const enabled = !filterBypassed && !pipelineBypassed;

    // Extract parameters with fallbacks
    const freq = Number(params.freq || params.Frequency || 1000);
    const q = Number(params.q || params.Q || 1.41);
    const gain = Number(params.gain || params.Gain || 0);

    bands.push({
      enabled,
      type: bandType,
      freq: Math.max(20, Math.min(20000, freq)),
      gain: Math.max(-24, Math.min(24, gain)),
      q: Math.max(0.1, Math.min(10, q)),
    });

    filterNames.push(filterName);
    orderNumbers.push(refIndex + 1); // 1-based pipeline position
  }

  return { bands, filterNames, channels, preampGain, orderNumbers };
}

/**
 * Apply EQ bands to CamillaDSP config
 * Updates ALL filter pipeline channels
 */
export function applyEqBandsToConfig(
  config: CamillaDSPConfig,
  data: ExtractedEqData
): CamillaDSPConfig {
  const { bands, filterNames, channels, preampGain } = data;

  if (bands.length !== filterNames.length) {
    throw new Error('Band count and filter name count must match');
  }

  // Clone config to avoid mutation
  const updatedConfig = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;

  // Update/create preamp mixer if gain != 0
  if (preampGain !== 0) {
    if (!updatedConfig.mixers) {
      updatedConfig.mixers = {};
    }
    
    updatedConfig.mixers.preamp = {
      channels: { in: 2, out: 2 },
      mapping: [
        {
          dest: 0,
          sources: [{ channel: 0, gain: preampGain, inverted: false, mute: false, scale: 'dB' }],
          mute: false,
        },
        {
          dest: 1,
          sources: [{ channel: 1, gain: preampGain, inverted: false, mute: false, scale: 'dB' }],
          mute: false,
        },
      ],
    };
    
    // Ensure preamp is in pipeline at start
    const hasPreampStep = updatedConfig.pipeline.some(
      (step) => step.type === 'Mixer' && (step as any).name === 'preamp'
    );
    
    if (!hasPreampStep) {
      updatedConfig.pipeline = [
        { type: 'Mixer', name: 'preamp' },
        ...updatedConfig.pipeline,
      ];
    }
  } else {
    // Preamp gain is 0: set gain to 0 but keep structure (simplest approach)
    if (updatedConfig.mixers && updatedConfig.mixers.preamp) {
      updatedConfig.mixers.preamp.mapping[0].sources[0].gain = 0;
      updatedConfig.mixers.preamp.mapping[1].sources[0].gain = 0;
    }
  }

  // Update each filter definition
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i];
    const filterName = filterNames[i];

    if (!updatedConfig.filters[filterName]) {
      console.warn(`Filter "${filterName}" not found in config, skipping`);
      continue;
    }

    const filterDef = updatedConfig.filters[filterName];

    // Ensure it's still a Biquad
    if (filterDef.type !== 'Biquad') {
      console.warn(`Filter "${filterName}" is not a Biquad, skipping`);
      continue;
    }

    // Update parameters
    const params = filterDef.parameters;
    
    // Map type back to CamillaDSP format
    params.type = mapEqBandTypeToCamilla(band.type);
    
    // Update frequency (use 'freq' as primary key)
    params.freq = band.freq;
    
    // Update Q
    params.q = band.q;
    
    // Update gain (for filter types that use it)
    if (band.type === 'Peaking' || band.type === 'LowShelf' || band.type === 'HighShelf') {
      params.gain = band.gain;
    } else {
      // For filters that don't use gain, remove it to avoid validation errors
      delete params.gain;
    }

    // Handle bypass status (enabled = not bypassed)
    // Store at filter level for simplicity
    if (!band.enabled) {
      params.bypassed = true;
    } else {
      delete params.bypassed;
    }
  }

  return updatedConfig;
}

/**
 * Validate that a config can be used for EQ editing
 */
export function validateConfigForEq(config: CamillaDSPConfig): { valid: boolean; error?: string } {
  const filterSteps = config.pipeline.filter((step) => step.type === 'Filter');

  if (filterSteps.length === 0) {
    return { valid: false, error: 'No Filter steps in pipeline' };
  }

  // Check that all filter names referenced exist
  for (const step of filterSteps) {
    const names = (step as any).names || [];
    for (const filterName of names) {
      if (!config.filters[filterName]) {
        return { valid: false, error: `Filter "${filterName}" referenced but not found` };
      }
    }
  }

  return { valid: true };
}
