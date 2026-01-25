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

  // Find all Filter pipeline steps
  const filterSteps = config.pipeline.filter((step) => step.type === 'Filter');

  if (filterSteps.length === 0) {
    return { bands: [], filterNames: [], channels: [] };
  }

  // Use channel 0 as the reference for filter order
  const channel0Step = filterSteps.find((step) => (step as any).channel === 0);
  if (!channel0Step) {
    return { bands: [], filterNames: [], channels: [] };
  }

  const refNames = (channel0Step as any).names || [];
  
  // Track which channels we're editing
  for (const step of filterSteps) {
    const channelNum = (step as any).channel;
    if (channelNum !== undefined && !channels.includes(channelNum)) {
      channels.push(channelNum);
    }
  }

  // Extract bands from filters
  for (const filterName of refNames) {
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
  }

  return { bands, filterNames, channels };
}

/**
 * Apply EQ bands to CamillaDSP config
 * Updates ALL filter pipeline channels
 */
export function applyEqBandsToConfig(
  config: CamillaDSPConfig,
  data: ExtractedEqData
): CamillaDSPConfig {
  const { bands, filterNames, channels } = data;

  if (bands.length !== filterNames.length) {
    throw new Error('Band count and filter name count must match');
  }

  // Clone config to avoid mutation
  const updatedConfig = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;

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
      // For filters that don't use gain, keep it if it exists or set to 0
      if ('gain' in params) {
        params.gain = 0;
      }
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
