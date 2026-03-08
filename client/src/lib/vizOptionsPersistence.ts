/**
 * Viz Options Persistence
 * UI-only state for spectrum analyzer, EQ view, and heatmap settings
 * Persists in localStorage to survive browser reload
 */

import type { SmoothingMode } from '../dsp/fractionalOctaveSmoothing';
import type { HeatmapMaskMode } from '../ui/rendering/canvasLayers/SpectrumHeatmapLayer';

const STORAGE_KEY = 'camillaEQ.vizOptions';
const STORAGE_VERSION = 1;

export interface VizOptionsState {
  version: number;
  
  // Spectrum/analyzer settings
  spectrumMode: 'pre' | 'post';
  smoothingMode: SmoothingMode;
  showSTA: boolean;
  showLTA: boolean;
  showPeak: boolean;
  
  // EQ view options
  showPerBandCurves: boolean;
  showBandwidthMarkers: boolean;
  bandFillOpacity: number;
  soloWhileEditing: boolean;
  
  // Heatmap settings
  heatmapEnabled: boolean;
  heatmapMaskMode: HeatmapMaskMode;
  heatmapHighPrecision: boolean;
  heatmapAlphaGamma: number;
  heatmapMagnitudeGain: number;
  heatmapGateThreshold: number;
  heatmapMaxAlpha: number;
}

/**
 * Default viz options (matches EqPage.svelte initial values)
 */
const DEFAULT_VIZ_OPTIONS: VizOptionsState = {
  version: STORAGE_VERSION,
  
  // Spectrum/analyzer defaults
  spectrumMode: 'pre',
  smoothingMode: '1/6',
  showSTA: true,
  showLTA: false,
  showPeak: false,
  
  // EQ view defaults
  showPerBandCurves: false,
  showBandwidthMarkers: true,
  bandFillOpacity: 0.4,
  soloWhileEditing: false,
  
  // Heatmap defaults
  heatmapEnabled: false,
  heatmapMaskMode: 'full',
  heatmapHighPrecision: false,
  heatmapAlphaGamma: 2.8,
  heatmapMagnitudeGain: 2.5,
  heatmapGateThreshold: 0.05,
  heatmapMaxAlpha: 0.95,
};

/**
 * Clamp numeric values to valid ranges
 */
function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Validate and clamp viz options state
 */
function validateVizOptions(state: Partial<VizOptionsState>): VizOptionsState {
  const validated: VizOptionsState = { ...DEFAULT_VIZ_OPTIONS };
  
  // Spectrum mode
  if (state.spectrumMode === 'pre' || state.spectrumMode === 'post') {
    validated.spectrumMode = state.spectrumMode;
  }
  
  // Smoothing mode
  const validSmoothingModes: SmoothingMode[] = ['off', '1/12', '1/6', '1/3'];
  if (state.smoothingMode && validSmoothingModes.includes(state.smoothingMode)) {
    validated.smoothingMode = state.smoothingMode;
  }
  
  // Boolean flags
  if (typeof state.showSTA === 'boolean') validated.showSTA = state.showSTA;
  if (typeof state.showLTA === 'boolean') validated.showLTA = state.showLTA;
  if (typeof state.showPeak === 'boolean') validated.showPeak = state.showPeak;
  if (typeof state.showPerBandCurves === 'boolean') validated.showPerBandCurves = state.showPerBandCurves;
  if (typeof state.showBandwidthMarkers === 'boolean') validated.showBandwidthMarkers = state.showBandwidthMarkers;
  if (typeof state.soloWhileEditing === 'boolean') validated.soloWhileEditing = state.soloWhileEditing;
  if (typeof state.heatmapEnabled === 'boolean') validated.heatmapEnabled = state.heatmapEnabled;
  if (typeof state.heatmapHighPrecision === 'boolean') validated.heatmapHighPrecision = state.heatmapHighPrecision;
  
  // Heatmap mask mode
  const validMaskModes: HeatmapMaskMode[] = ['full', 'top', 'bottom'];
  if (state.heatmapMaskMode && validMaskModes.includes(state.heatmapMaskMode)) {
    validated.heatmapMaskMode = state.heatmapMaskMode;
  }
  
  // Numeric values (with clamping)
  if (typeof state.bandFillOpacity === 'number') {
    validated.bandFillOpacity = clampValue(state.bandFillOpacity, 0, 1);
  }
  if (typeof state.heatmapAlphaGamma === 'number') {
    validated.heatmapAlphaGamma = clampValue(state.heatmapAlphaGamma, 0.8, 4.0);
  }
  if (typeof state.heatmapMagnitudeGain === 'number') {
    validated.heatmapMagnitudeGain = clampValue(state.heatmapMagnitudeGain, 0.5, 4.0);
  }
  if (typeof state.heatmapGateThreshold === 'number') {
    validated.heatmapGateThreshold = clampValue(state.heatmapGateThreshold, 0.0, 0.2);
  }
  if (typeof state.heatmapMaxAlpha === 'number') {
    validated.heatmapMaxAlpha = clampValue(state.heatmapMaxAlpha, 0.2, 1.0);
  }
  
  return validated;
}

/**
 * Load viz options from localStorage with migration
 */
export function loadVizOptions(): VizOptionsState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { ...DEFAULT_VIZ_OPTIONS };
    }
    
    const parsed = JSON.parse(stored);
    
    // Version mismatch (unknown version)
    if (parsed.version !== STORAGE_VERSION) {
      console.warn('Viz options version mismatch, resetting to defaults');
      return { ...DEFAULT_VIZ_OPTIONS };
    }
    
    // Validate and clamp values
    return validateVizOptions(parsed);
  } catch (error) {
    console.error('Error loading viz options:', error);
    return { ...DEFAULT_VIZ_OPTIONS };
  }
}

/**
 * Save viz options to localStorage
 */
export function saveVizOptions(state: VizOptionsState): void {
  try {
    // Validate before saving
    const validated = validateVizOptions(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
  } catch (error) {
    console.error('Error saving viz options:', error);
  }
}

/**
 * Clear viz options (reset to defaults)
 */
export function clearVizOptions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing viz options:', error);
  }
}
