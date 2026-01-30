/**
 * Type definitions for CamillaDSP configuration structures.
 * These "typed islands" provide compiler safety for the subset of config structures we manipulate,
 * while keeping the full config dynamic where needed.
 */

/**
 * Parameters for biquad filters (the EQ types we support)
 */
export interface BiquadParams {
  freq: number;
  q: number;
  gain?: number; // Optional: not all filter types use gain (e.g., HighPass, LowPass)
  bypassed?: boolean;
}

/**
 * Supported filter types (subset of CamillaDSP filter types)
 */
export type FilterType = 
  | 'Biquad'
  | 'Gain';

/**
 * Biquad subtypes we support for EQ
 */
export type BiquadType =
  | 'Peaking'
  | 'Highshelf'
  | 'Lowshelf'
  | 'HighPass'
  | 'LowPass'
  | 'Notch'
  | 'Bandpass'
  | 'Allpass';

/**
 * Filter types that support gain parameter
 */
export const GAIN_CAPABLE_TYPES: BiquadType[] = [
  'Peaking',
  'Highshelf',
  'Lowshelf',
  'Notch',
];

/**
 * Filter types that only use Q (no gain)
 */
export const Q_ONLY_TYPES: BiquadType[] = [
  'HighPass',
  'LowPass',
  'Bandpass',
  'Allpass',
];

/**
 * Definition of a biquad filter (the main EQ type)
 */
export interface BiquadFilterDefinition {
  type: 'Biquad';
  parameters: {
    type: BiquadType;
    freq: number;
    q: number;
    gain?: number;
    bypassed?: boolean;
  };
  description?: string;
}

/**
 * Definition of a gain filter (used for preamp)
 */
export interface GainFilterDefinition {
  type: 'Gain';
  parameters: {
    gain: number;
    inverted?: boolean;
    mute?: boolean;
    bypassed?: boolean;
  };
  description?: string;
}

/**
 * Union of supported filter definitions
 */
export type FilterDefinition = BiquadFilterDefinition | GainFilterDefinition;

/**
 * Normalized pipeline step (v3 format only)
 * This is the canonical shape we expect after normalization
 */
export interface PipelineStepNormalized {
  type: 'Filter' | 'Mixer' | 'Processor';
  channels?: number[]; // v3 format (array)
  channel?: never; // Explicitly disallow v2 format
  names?: string[]; // Filter names (for Filter type)
  name?: string; // Mixer/Processor name
  bypassed?: boolean;
}

/**
 * Type guard: check if a filter definition is a biquad
 */
export function isBiquadFilter(filter: FilterDefinition): filter is BiquadFilterDefinition {
  return filter.type === 'Biquad';
}

/**
 * Type guard: check if a filter definition is a gain
 */
export function isGainFilter(filter: FilterDefinition): filter is GainFilterDefinition {
  return filter.type === 'Gain';
}

/**
 * Type guard: check if a biquad type supports gain parameter
 */
export function isGainCapable(biquadType: BiquadType): boolean {
  return GAIN_CAPABLE_TYPES.includes(biquadType);
}

/**
 * Normalize a pipeline step to v3 format
 * Converts v2 `channel: number` to v3 `channels: number[]`
 * Returns null if the step is malformed
 */
export function normalizePipelineStep(step: any): PipelineStepNormalized | null {
  if (!step || typeof step !== 'object') {
    return null;
  }

  const normalized: PipelineStepNormalized = {
    type: step.type,
    bypassed: step.bypassed,
  };

  // Handle channel/channels normalization (v2 -> v3)
  if (step.channel !== undefined && step.channels === undefined) {
    // v2 format: convert channel (number) to channels (array)
    normalized.channels = [step.channel];
  } else if (step.channels !== undefined) {
    // v3 format: already an array
    normalized.channels = step.channels;
  }

  // Copy type-specific fields
  if (step.type === 'Filter' && step.names) {
    normalized.names = step.names;
  } else if ((step.type === 'Mixer' || step.type === 'Processor') && step.name) {
    normalized.name = step.name;
  }

  return normalized;
}
