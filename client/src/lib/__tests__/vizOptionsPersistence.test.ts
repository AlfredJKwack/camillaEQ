import { describe, test, expect, beforeEach } from 'vitest';
import {
  loadVizOptions,
  saveVizOptions,
  clearVizOptions,
  type VizOptionsState,
} from '../vizOptionsPersistence';

describe('vizOptionsPersistence', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  test('should return default state when localStorage is empty', () => {
    const state = loadVizOptions();

    expect(state).toEqual({
      version: 1,
      spectrumMode: 'pre',
      smoothingMode: '1/6',
      showSTA: true,
      showLTA: false,
      showPeak: false,
      showPerBandCurves: false,
      showBandwidthMarkers: true,
      bandFillOpacity: 0.4,
      heatmapEnabled: false,
      heatmapMaskMode: 'full',
      heatmapHighPrecision: false,
      heatmapAlphaGamma: 2.8,
      heatmapMagnitudeGain: 2.5,
      heatmapGateThreshold: 0.05,
      heatmapMaxAlpha: 0.95,
    });
  });

  test('should save and load viz options', () => {
    const customState: VizOptionsState = {
      version: 1,
      spectrumMode: 'post',
      smoothingMode: '1/3',
      showSTA: false,
      showLTA: true,
      showPeak: true,
      showPerBandCurves: true,
      showBandwidthMarkers: false,
      bandFillOpacity: 0.7,
      heatmapEnabled: true,
      heatmapMaskMode: 'top',
      heatmapHighPrecision: true,
      heatmapAlphaGamma: 3.5,
      heatmapMagnitudeGain: 3.0,
      heatmapGateThreshold: 0.1,
      heatmapMaxAlpha: 0.8,
    };

    saveVizOptions(customState);
    const loaded = loadVizOptions();

    expect(loaded).toEqual(customState);
  });

  test('should clamp bandFillOpacity to valid range', () => {
    const invalidState: VizOptionsState = {
      version: 1,
      spectrumMode: 'pre',
      smoothingMode: '1/6',
      showSTA: true,
      showLTA: false,
      showPeak: false,
      showPerBandCurves: false,
      showBandwidthMarkers: true,
      bandFillOpacity: 2.5, // Out of range [0..1]
      heatmapEnabled: false,
      heatmapMaskMode: 'full',
      heatmapHighPrecision: false,
      heatmapAlphaGamma: 2.8,
      heatmapMagnitudeGain: 2.5,
      heatmapGateThreshold: 0.05,
      heatmapMaxAlpha: 0.95,
    };

    saveVizOptions(invalidState);
    const loaded = loadVizOptions();

    expect(loaded.bandFillOpacity).toBe(1.0); // Clamped to max
  });

  test('should clamp heatmap parameters to valid ranges', () => {
    const invalidState: VizOptionsState = {
      version: 1,
      spectrumMode: 'pre',
      smoothingMode: '1/6',
      showSTA: true,
      showLTA: false,
      showPeak: false,
      showPerBandCurves: false,
      showBandwidthMarkers: true,
      bandFillOpacity: 0.4,
      heatmapEnabled: false,
      heatmapMaskMode: 'full',
      heatmapHighPrecision: false,
      heatmapAlphaGamma: 10.0, // Out of range [0.8..4.0]
      heatmapMagnitudeGain: 0.1, // Out of range [0.5..4.0]
      heatmapGateThreshold: 0.5, // Out of range [0.0..0.2]
      heatmapMaxAlpha: 1.5, // Out of range [0.2..1.0]
    };

    saveVizOptions(invalidState);
    const loaded = loadVizOptions();

    expect(loaded.heatmapAlphaGamma).toBe(4.0); // Clamped to max
    expect(loaded.heatmapMagnitudeGain).toBe(0.5); // Clamped to min
    expect(loaded.heatmapGateThreshold).toBe(0.2); // Clamped to max
    expect(loaded.heatmapMaxAlpha).toBe(1.0); // Clamped to max
  });

  test('should reset to defaults on version mismatch', () => {
    const futureVersionState = {
      version: 999,
      spectrumMode: 'post',
      smoothingMode: '1/3',
      showSTA: false,
      showLTA: true,
      showPeak: true,
      showPerBandCurves: true,
      showBandwidthMarkers: false,
      bandFillOpacity: 0.7,
      heatmapEnabled: true,
      heatmapMaskMode: 'top',
      heatmapHighPrecision: true,
      heatmapAlphaGamma: 3.5,
      heatmapMagnitudeGain: 3.0,
      heatmapGateThreshold: 0.1,
      heatmapMaxAlpha: 0.8,
    };

    localStorage.setItem('camillaEQ.vizOptions', JSON.stringify(futureVersionState));
    const loaded = loadVizOptions();

    // Should fallback to defaults
    expect(loaded.version).toBe(1);
    expect(loaded.spectrumMode).toBe('pre');
    expect(loaded.smoothingMode).toBe('1/6');
  });

  test('should handle invalid JSON gracefully', () => {
    localStorage.setItem('camillaEQ.vizOptions', 'not valid json {');
    const loaded = loadVizOptions();

    // Should fallback to defaults
    expect(loaded.version).toBe(1);
    expect(loaded.spectrumMode).toBe('pre');
  });

  test('should clear viz options from localStorage', () => {
    const customState: VizOptionsState = {
      version: 1,
      spectrumMode: 'post',
      smoothingMode: '1/3',
      showSTA: false,
      showLTA: true,
      showPeak: true,
      showPerBandCurves: true,
      showBandwidthMarkers: false,
      bandFillOpacity: 0.7,
      heatmapEnabled: true,
      heatmapMaskMode: 'top',
      heatmapHighPrecision: true,
      heatmapAlphaGamma: 3.5,
      heatmapMagnitudeGain: 3.0,
      heatmapGateThreshold: 0.1,
      heatmapMaxAlpha: 0.8,
    };

    saveVizOptions(customState);
    expect(localStorage.getItem('camillaEQ.vizOptions')).not.toBeNull();

    clearVizOptions();
    expect(localStorage.getItem('camillaEQ.vizOptions')).toBeNull();

    // Loading after clear should return defaults
    const loaded = loadVizOptions();
    expect(loaded.spectrumMode).toBe('pre');
  });

  test('should validate spectrum mode values', () => {
    const invalidState = {
      version: 1,
      spectrumMode: 'invalid' as any,
      smoothingMode: '1/6',
      showSTA: true,
      showLTA: false,
      showPeak: false,
      showPerBandCurves: false,
      showBandwidthMarkers: true,
      bandFillOpacity: 0.4,
      heatmapEnabled: false,
      heatmapMaskMode: 'full',
      heatmapHighPrecision: false,
      heatmapAlphaGamma: 2.8,
      heatmapMagnitudeGain: 2.5,
      heatmapGateThreshold: 0.05,
      heatmapMaxAlpha: 0.95,
    };

    localStorage.setItem('camillaEQ.vizOptions', JSON.stringify(invalidState));
    const loaded = loadVizOptions();

    // Should fallback to default
    expect(loaded.spectrumMode).toBe('pre');
  });

  test('should validate smoothing mode values', () => {
    const invalidState = {
      version: 1,
      spectrumMode: 'pre',
      smoothingMode: 'invalid' as any,
      showSTA: true,
      showLTA: false,
      showPeak: false,
      showPerBandCurves: false,
      showBandwidthMarkers: true,
      bandFillOpacity: 0.4,
      heatmapEnabled: false,
      heatmapMaskMode: 'full',
      heatmapHighPrecision: false,
      heatmapAlphaGamma: 2.8,
      heatmapMagnitudeGain: 2.5,
      heatmapGateThreshold: 0.05,
      heatmapMaxAlpha: 0.95,
    };

    localStorage.setItem('camillaEQ.vizOptions', JSON.stringify(invalidState));
    const loaded = loadVizOptions();

    // Should fallback to default
    expect(loaded.smoothingMode).toBe('1/6');
  });

  test('should validate heatmap mask mode values', () => {
    const invalidState = {
      version: 1,
      spectrumMode: 'pre',
      smoothingMode: '1/6',
      showSTA: true,
      showLTA: false,
      showPeak: false,
      showPerBandCurves: false,
      showBandwidthMarkers: true,
      bandFillOpacity: 0.4,
      heatmapEnabled: false,
      heatmapMaskMode: 'invalid' as any,
      heatmapHighPrecision: false,
      heatmapAlphaGamma: 2.8,
      heatmapMagnitudeGain: 2.5,
      heatmapGateThreshold: 0.05,
      heatmapMaxAlpha: 0.95,
    };

    localStorage.setItem('camillaEQ.vizOptions', JSON.stringify(invalidState));
    const loaded = loadVizOptions();

    // Should fallback to default
    expect(loaded.heatmapMaskMode).toBe('full');
  });

  test('should preserve valid boolean values', () => {
    const customState: VizOptionsState = {
      version: 1,
      spectrumMode: 'post',
      smoothingMode: '1/3',
      showSTA: false,
      showLTA: true,
      showPeak: true,
      showPerBandCurves: true,
      showBandwidthMarkers: false,
      bandFillOpacity: 0.7,
      heatmapEnabled: true,
      heatmapMaskMode: 'bottom',
      heatmapHighPrecision: true,
      heatmapAlphaGamma: 3.5,
      heatmapMagnitudeGain: 3.0,
      heatmapGateThreshold: 0.1,
      heatmapMaxAlpha: 0.8,
    };

    saveVizOptions(customState);
    const loaded = loadVizOptions();

    expect(loaded.showSTA).toBe(false);
    expect(loaded.showLTA).toBe(true);
    expect(loaded.showPeak).toBe(true);
    expect(loaded.showPerBandCurves).toBe(true);
    expect(loaded.showBandwidthMarkers).toBe(false);
    expect(loaded.heatmapEnabled).toBe(true);
    expect(loaded.heatmapHighPrecision).toBe(true);
  });
});
