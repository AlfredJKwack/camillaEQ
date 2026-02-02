/**
 * Type checking utilities for known CamillaDSP types
 * Used to determine which processor/filter types we can render with custom UIs
 * vs. which need fallback JSON display
 */

import type { Filter } from './camillaSchema';

/**
 * Known processor types that we support with custom UI
 * (Based on CamillaDSP v3.0 reference docs)
 */
export type KnownProcessorType = 'Compressor' | 'NoiseGate';

const KNOWN_PROCESSOR_TYPES: Set<string> = new Set(['Compressor', 'NoiseGate']);

/**
 * Check if a processor type is known and supported
 */
export function isKnownProcessorType(type: string | undefined): type is KnownProcessorType {
  return type !== undefined && KNOWN_PROCESSOR_TYPES.has(type);
}

/**
 * Known biquad subtypes that we support in the UI
 * (Normalized to lowercase for case-insensitive matching)
 */
const KNOWN_BIQUAD_SUBTYPES: Set<string> = new Set([
  'peaking',
  'highpass',
  'lowpass',
  'highshelf',
  'lowshelf',
  'notch',
  'bandpass',
  'allpass',
]);

/**
 * Normalize a biquad subtype string for comparison
 * Accepts both CamillaDSP style (Highpass) and PascalCase variants (HighShelf)
 * Returns normalized lowercase string, or null if input is invalid
 */
function normalizeBiquadSubtype(input: unknown): string | null {
  if (typeof input !== 'string' || !input) {
    return null;
  }
  // Normalize: lowercase, no underscores/spaces
  return input.toLowerCase().replace(/[_\s]/g, '');
}

/**
 * Check if a biquad subtype is known and supported
 */
function isKnownBiquadSubtype(subtype: unknown): boolean {
  const normalized = normalizeBiquadSubtype(subtype);
  return normalized !== null && KNOWN_BIQUAD_SUBTYPES.has(normalized);
}

/**
 * Filter UI rendering categories
 */
export type FilterUiKind =
  | 'biquad'
  | 'gain'
  | 'delay'
  | 'conv'
  | 'volume'
  | 'loudness'
  | 'limiter'
  | 'dither'
  | 'diffeq'
  | 'unknown';

/**
 * Get the UI rendering category for a filter
 */
export function getFilterUiKind(filterDef: any): FilterUiKind {
  if (!filterDef || !filterDef.type) {
    return 'unknown';
  }

  const type = filterDef.type.toLowerCase();
  
  switch (type) {
    case 'biquad':
      return 'biquad';
    case 'gain':
      return 'gain';
    case 'delay':
      return 'delay';
    case 'conv':
      return 'conv';
    case 'volume':
      return 'volume';
    case 'loudness':
      return 'loudness';
    case 'limiter':
      return 'limiter';
    case 'dither':
      return 'dither';
    case 'diffeq':
      return 'diffeq';
    default:
      return 'unknown';
  }
}

/**
 * Determine if a filter kind supports editing in the UI
 * Some complex types (Conv, DiffEq, Dither) are read-only for now
 */
export function isEditableFilterKind(kind: FilterUiKind): boolean {
  switch (kind) {
    case 'biquad':
    case 'gain':
    case 'delay':
    case 'volume':
    case 'loudness':
    case 'limiter':
      return true;
    case 'conv':
    case 'dither':
    case 'diffeq':
    case 'unknown':
      return false;
    default:
      return false;
  }
}

/**
 * Get a human-readable summary for a filter (for compact display)
 * Returns array of strings like ["1000 Hz", "Q 1.5", "Gain +3 dB"]
 */
export function getFilterSummary(filterDef: any): string[] {
  const kind = getFilterUiKind(filterDef);
  const params = filterDef.parameters || {};
  
  switch (kind) {
    case 'biquad': {
      const summary: string[] = [];
      if (params.freq !== undefined) {
        summary.push(`${formatNumber(params.freq)} Hz`);
      }
      if (params.q !== undefined) {
        summary.push(`Q ${formatNumber(params.q)}`);
      }
      if (params.gain !== undefined) {
        summary.push(`${formatNumber(params.gain, true)} dB`);
      }
      return summary;
    }
    
    case 'gain': {
      const gain = formatNumber(params.gain, true);
      const scale = params.scale || 'dB';
      return [`${gain} ${scale}`];
    }
    
    case 'delay': {
      const delay = formatNumber(params.delay);
      const unit = params.unit || 'ms';
      return [`${delay} ${unit}`];
    }
    
    case 'conv': {
      const convType = params.type || '?';
      if (convType === 'Wav') {
        return [`Wav: ${params.filename || '?'}`, `Ch ${params.channel ?? 0}`];
      } else if (convType === 'Raw') {
        return [`Raw: ${params.filename || '?'}`];
      } else if (convType === 'Values') {
        return [`Values: ${params.values?.length || 0} samples`];
      } else if (convType === 'Dummy') {
        return [`Dummy: ${params.length || 0} samples`];
      }
      return [convType];
    }
    
    case 'volume': {
      const fader = params.fader || '?';
      return [`Fader: ${fader}`];
    }
    
    case 'loudness': {
      const ref = params.reference_level;
      return [`Ref: ${ref !== undefined ? formatNumber(ref) : '?'} dB`];
    }
    
    case 'limiter': {
      const threshold = formatNumber(params.threshold, true);
      return [`Threshold: ${threshold} dB`];
    }
    
    case 'dither': {
      const ditherType = params.type || '?';
      const bits = params.bits || '?';
      return [`${ditherType}`, `${bits} bits`];
    }
    
    case 'diffeq': {
      const aLen = params.a?.length || 0;
      const bLen = params.b?.length || 0;
      return [`a[${aLen}]`, `b[${bLen}]`];
    }
    
    default:
      return [];
  }
}

/**
 * Get human-readable reason why a filter is not editable
 */
export function getFilterNotEditableReason(filterDef: any): string {
  // Handle missing/null filter definition
  if (!filterDef) {
    return 'Filter definition missing';
  }
  
  const filterType = filterDef.type;
  
  // Handle missing filter type
  if (!filterType) {
    return `Unknown filter type: ${filterType || 'undefined'}`;
  }
  
  // Handle Biquad filters specifically
  if (filterType === 'Biquad') {
    const biquadSubtype = filterDef.parameters?.type;
    
    if (!biquadSubtype) {
      return 'Biquad type not specified';
    }
    
    if (!isKnownBiquadSubtype(biquadSubtype)) {
      return `Unsupported Biquad subtype: ${biquadSubtype}`;
    }
    
    // Biquad is valid but still not editable for some other reason
    return 'Filter type not editable';
  }
  
  // Handle non-Biquad filters
  const kind = getFilterUiKind(filterDef);
  
  switch (kind) {
    case 'conv':
      return `Unsupported filter type: ${filterType} - Convolution filters are complex and read-only`;
    case 'dither':
      return `Unsupported filter type: ${filterType} - Dither filters are read-only (too many subtypes)`;
    case 'diffeq':
      return `Unsupported filter type: ${filterType} - Differential equation filters are read-only`;
    case 'unknown':
      return `Unknown filter type: ${filterType}`;
    default:
      return `Unsupported filter type: ${filterType}`;
  }
}

/**
 * Helper to format a number for display
 */
function formatNumber(value: any, showSign: boolean = false): string {
  if (typeof value === 'number') {
    const formatted = value.toFixed(value % 1 === 0 ? 0 : 2);
    if (showSign && value > 0) {
      return `+${formatted}`;
    }
    return formatted;
  }
  return String(value);
}

/**
 * Check if a filter is editable in the UI
 * Validates that the filter definition is well-formed and of a supported type
 */
export function isKnownEditableFilter(filterDef: any): boolean {
  // Handle missing/null filter
  if (!filterDef || typeof filterDef !== 'object') {
    return false;
  }
  
  const filterType = filterDef.type;
  
  // Handle missing filter type
  if (!filterType) {
    return false;
  }
  
  // For Biquad filters, enforce subtype validation
  if (filterType === 'Biquad') {
    const biquadSubtype = filterDef.parameters?.type;
    
    // Biquad must have a valid, known subtype
    if (!biquadSubtype || !isKnownBiquadSubtype(biquadSubtype)) {
      return false;
    }
    
    return true; // Valid biquad with known subtype
  }
  
  // For non-Biquad filters, use kind-based check
  const kind = getFilterUiKind(filterDef);
  return isEditableFilterKind(kind);
}
