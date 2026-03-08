import { writable, derived } from 'svelte/store';
import type { SmoothingMode } from '../../../dsp/fractionalOctaveSmoothing';
import type { HeatmapMaskMode } from '../../../ui/rendering/canvasLayers/SpectrumHeatmapLayer';
import { loadVizOptions, saveVizOptions } from '../../../lib/vizOptionsPersistence';
import { debounce } from '../../../lib/debounce';

/**
 * Visualization options store
 * Manages all EQ visualization settings with automatic localStorage persistence
 */

// Spectrum visualization
export const spectrumMode = writable<'pre' | 'post'>('pre');

// Analyzer curves
export const smoothingMode = writable<SmoothingMode>('1/6');
export const showSTA = writable<boolean>(true);
export const showLTA = writable<boolean>(false);
export const showPeak = writable<boolean>(false);

// Derived: overlay enabled if at least one series is on
export const overlayEnabled = derived(
  [showSTA, showLTA, showPeak],
  ([$showSTA, $showLTA, $showPeak]) => $showSTA || $showLTA || $showPeak
);

// Heatmap
export const heatmapEnabled = writable<boolean>(false);
export const heatmapMaskMode = writable<HeatmapMaskMode>('full');
export const heatmapHighPrecision = writable<boolean>(false);
export const heatmapAlphaGamma = writable<number>(2.8);
export const heatmapMagnitudeGain = writable<number>(2.5);
export const heatmapGateThreshold = writable<number>(0.05);
export const heatmapMaxAlpha = writable<number>(0.95);

// Token visuals
export const showPerBandCurves = writable<boolean>(false);
export const showBandwidthMarkers = writable<boolean>(true);
export const bandFillOpacity = writable<number>(0.4);
export const soloWhileEditing = writable<boolean>(false);

// Derived: spectrum visualization needed (analyzer OR heatmap)
export const spectrumVizEnabled = derived(
  [overlayEnabled, heatmapEnabled],
  ([$overlayEnabled, $heatmapEnabled]) => $overlayEnabled || $heatmapEnabled
);

/**
 * Initialize viz options from localStorage
 */
export function initializeVizOptions(): void {
  const saved = loadVizOptions();
  
  spectrumMode.set(saved.spectrumMode);
  smoothingMode.set(saved.smoothingMode);
  showSTA.set(saved.showSTA);
  showLTA.set(saved.showLTA);
  showPeak.set(saved.showPeak);
  showPerBandCurves.set(saved.showPerBandCurves);
  showBandwidthMarkers.set(saved.showBandwidthMarkers);
  bandFillOpacity.set(saved.bandFillOpacity);
  soloWhileEditing.set(saved.soloWhileEditing);
  heatmapEnabled.set(saved.heatmapEnabled);
  heatmapMaskMode.set(saved.heatmapMaskMode);
  heatmapHighPrecision.set(saved.heatmapHighPrecision);
  heatmapAlphaGamma.set(saved.heatmapAlphaGamma);
  heatmapMagnitudeGain.set(saved.heatmapMagnitudeGain);
  heatmapGateThreshold.set(saved.heatmapGateThreshold);
  heatmapMaxAlpha.set(saved.heatmapMaxAlpha);
  
  console.log('Loaded viz options from localStorage');
}

/**
 * Debounced save function to persist changes to localStorage
 */
const debouncedSave = debounce((state: any) => {
  saveVizOptions(state);
}, 200);

/**
 * Subscribe to all stores and persist changes
 * Call this once on app initialization
 */
export function setupVizOptionsPersistence(): () => void {
  const unsubscribers: (() => void)[] = [];
  
  // Create a combined subscriber that saves all state
  const saveAll = () => {
    const state = {
      version: 1,
      spectrumMode: null as any,
      smoothingMode: null as any,
      showSTA: null as any,
      showLTA: null as any,
      showPeak: null as any,
      showPerBandCurves: null as any,
      showBandwidthMarkers: null as any,
      bandFillOpacity: null as any,
      soloWhileEditing: null as any,
      heatmapEnabled: null as any,
      heatmapMaskMode: null as any,
      heatmapHighPrecision: null as any,
      heatmapAlphaGamma: null as any,
      heatmapMagnitudeGain: null as any,
      heatmapGateThreshold: null as any,
      heatmapMaxAlpha: null as any,
    };
    
    // Synchronously read current values
    const readValue = <T>(store: any): T => {
      let value: T;
      store.subscribe((v: T) => { value = v; })();
      return value!;
    };
    
    state.spectrumMode = readValue(spectrumMode);
    state.smoothingMode = readValue(smoothingMode);
    state.showSTA = readValue(showSTA);
    state.showLTA = readValue(showLTA);
    state.showPeak = readValue(showPeak);
    state.showPerBandCurves = readValue(showPerBandCurves);
    state.showBandwidthMarkers = readValue(showBandwidthMarkers);
    state.bandFillOpacity = readValue(bandFillOpacity);
    state.soloWhileEditing = readValue(soloWhileEditing);
    state.heatmapEnabled = readValue(heatmapEnabled);
    state.heatmapMaskMode = readValue(heatmapMaskMode);
    state.heatmapHighPrecision = readValue(heatmapHighPrecision);
    state.heatmapAlphaGamma = readValue(heatmapAlphaGamma);
    state.heatmapMagnitudeGain = readValue(heatmapMagnitudeGain);
    state.heatmapGateThreshold = readValue(heatmapGateThreshold);
    state.heatmapMaxAlpha = readValue(heatmapMaxAlpha);
    
    debouncedSave(state);
  };
  
  // Subscribe to each store
  unsubscribers.push(spectrumMode.subscribe(saveAll));
  unsubscribers.push(smoothingMode.subscribe(saveAll));
  unsubscribers.push(showSTA.subscribe(saveAll));
  unsubscribers.push(showLTA.subscribe(saveAll));
  unsubscribers.push(showPeak.subscribe(saveAll));
  unsubscribers.push(showPerBandCurves.subscribe(saveAll));
  unsubscribers.push(showBandwidthMarkers.subscribe(saveAll));
  unsubscribers.push(bandFillOpacity.subscribe(saveAll));
  unsubscribers.push(soloWhileEditing.subscribe(saveAll));
  unsubscribers.push(heatmapEnabled.subscribe(saveAll));
  unsubscribers.push(heatmapMaskMode.subscribe(saveAll));
  unsubscribers.push(heatmapHighPrecision.subscribe(saveAll));
  unsubscribers.push(heatmapAlphaGamma.subscribe(saveAll));
  unsubscribers.push(heatmapMagnitudeGain.subscribe(saveAll));
  unsubscribers.push(heatmapGateThreshold.subscribe(saveAll));
  unsubscribers.push(heatmapMaxAlpha.subscribe(saveAll));
  
  // Return cleanup function
  return () => {
    unsubscribers.forEach(unsub => unsub());
  };
}
