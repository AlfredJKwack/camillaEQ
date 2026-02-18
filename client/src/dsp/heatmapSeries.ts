/**
 * Heatmap Series Helpers - MVP-30
 * Logic for selecting primary series for heatmap masking and computing effective settings
 */

import type { SmoothingMode } from './fractionalOctaveSmoothing';

export interface AnalyzerVisibility {
  showSTA: boolean;
  showLTA: boolean;
  showPeak: boolean;
}

export interface AnalyzerSeriesData {
  staNorm: number[] | null;
  ltaNorm: number[] | null;
  peakNorm: number[] | null;
}

/**
 * Select the primary series for heatmap masking
 * Priority: LTA → STA → Peak → fallback to STA
 */
export function selectPrimarySeries(
  visibility: AnalyzerVisibility,
  series: AnalyzerSeriesData
): number[] | null {
  // Priority 1: LTA if enabled
  if (visibility.showLTA && series.ltaNorm) {
    return series.ltaNorm;
  }
  
  // Priority 2: STA if enabled
  if (visibility.showSTA && series.staNorm) {
    return series.staNorm;
  }
  
  // Priority 3: Peak if enabled
  if (visibility.showPeak && series.peakNorm) {
    return series.peakNorm;
  }
  
  // Fallback: STA (even if not visible)
  return series.staNorm;
}

/**
 * Get effective smoothing mode for high precision
 * High precision → minimal smoothing (off)
 */
export function getEffectiveSmoothing(
  userSmoothing: SmoothingMode,
  highPrecision: boolean
): SmoothingMode {
  if (highPrecision) {
    return 'off'; // Minimal smoothing for high precision
  }
  return userSmoothing;
}

/**
 * Get effective poll interval for high precision
 * High precision → slower updates (250ms instead of 100ms)
 */
export function getEffectivePollInterval(highPrecision: boolean): number {
  return highPrecision ? 250 : 100; // ms
}

/**
 * Get effective analyzer time constants for high precision
 * High precision → longer integration (more stable)
 */
export function getEffectiveAnalyzerTau(highPrecision: boolean): {
  tauShort: number;
  tauLong: number;
} {
  if (highPrecision) {
    return {
      tauShort: 2.0,  // 2.0s (vs default 0.8s)
      tauLong: 16.0,  // 16.0s (vs default 8.0s)
    };
  }
  
  return {
    tauShort: 0.8,
    tauLong: 8.0,
  };
}
