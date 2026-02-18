/**
 * Heatmap Series Tests - MVP-30
 */

import { describe, it, expect } from 'vitest';
import {
  selectPrimarySeries,
  getEffectiveSmoothing,
  getEffectivePollInterval,
  getEffectiveAnalyzerTau,
  type AnalyzerVisibility,
  type AnalyzerSeriesData,
} from '../heatmapSeries';

describe('selectPrimarySeries', () => {
  const mockSeries: AnalyzerSeriesData = {
    staNorm: [0.5, 0.6, 0.7],
    ltaNorm: [0.4, 0.5, 0.6],
    peakNorm: [0.8, 0.9, 1.0],
  };

  it('selects LTA when enabled (highest priority)', () => {
    const visibility: AnalyzerVisibility = {
      showSTA: true,
      showLTA: true,
      showPeak: true,
    };

    const result = selectPrimarySeries(visibility, mockSeries);
    expect(result).toBe(mockSeries.ltaNorm);
  });

  it('selects STA when LTA is disabled', () => {
    const visibility: AnalyzerVisibility = {
      showSTA: true,
      showLTA: false,
      showPeak: true,
    };

    const result = selectPrimarySeries(visibility, mockSeries);
    expect(result).toBe(mockSeries.staNorm);
  });

  it('selects Peak when LTA and STA are disabled', () => {
    const visibility: AnalyzerVisibility = {
      showSTA: false,
      showLTA: false,
      showPeak: true,
    };

    const result = selectPrimarySeries(visibility, mockSeries);
    expect(result).toBe(mockSeries.peakNorm);
  });

  it('falls back to STA when all are disabled', () => {
    const visibility: AnalyzerVisibility = {
      showSTA: false,
      showLTA: false,
      showPeak: false,
    };

    const result = selectPrimarySeries(visibility, mockSeries);
    expect(result).toBe(mockSeries.staNorm);
  });

  it('falls back to STA when LTA is enabled but null', () => {
    const visibility: AnalyzerVisibility = {
      showSTA: true,
      showLTA: true,
      showPeak: false,
    };

    const series: AnalyzerSeriesData = {
      staNorm: [0.5, 0.6],
      ltaNorm: null,
      peakNorm: null,
    };

    const result = selectPrimarySeries(visibility, series);
    expect(result).toBe(series.staNorm);
  });
});

describe('getEffectiveSmoothing', () => {
  it('returns "off" when high precision is enabled', () => {
    expect(getEffectiveSmoothing('1/6', true)).toBe('off');
    expect(getEffectiveSmoothing('1/3', true)).toBe('off');
    expect(getEffectiveSmoothing('off', true)).toBe('off');
  });

  it('returns user smoothing when high precision is disabled', () => {
    expect(getEffectiveSmoothing('1/6', false)).toBe('1/6');
    expect(getEffectiveSmoothing('1/3', false)).toBe('1/3');
    expect(getEffectiveSmoothing('off', false)).toBe('off');
  });
});

describe('getEffectivePollInterval', () => {
  it('returns 250ms for high precision', () => {
    expect(getEffectivePollInterval(true)).toBe(250);
  });

  it('returns 100ms for normal precision', () => {
    expect(getEffectivePollInterval(false)).toBe(100);
  });
});

describe('getEffectiveAnalyzerTau', () => {
  it('returns longer time constants for high precision', () => {
    const result = getEffectiveAnalyzerTau(true);
    expect(result.tauShort).toBe(2.0);
    expect(result.tauLong).toBe(16.0);
  });

  it('returns default time constants for normal precision', () => {
    const result = getEffectiveAnalyzerTau(false);
    expect(result.tauShort).toBe(0.8);
    expect(result.tauLong).toBe(8.0);
  });
});
