/**
 * SpectrumManager.ts
 * Manages spectrum analyzer lifecycle, polling, and rendering
 */

import type { Readable } from 'svelte/store';
import { SpectrumCanvasRenderer } from '../../../ui/rendering/SpectrumCanvasRenderer';
import { SpectrumAnalyzerLayer } from '../../../ui/rendering/canvasLayers/SpectrumAnalyzerLayer';
import { SpectrumHeatmapLayer, type HeatmapMaskMode } from '../../../ui/rendering/canvasLayers/SpectrumHeatmapLayer';
import { parseSpectrumData, dbArrayToNormalized } from '../../../dsp/spectrumParser';
import { SpectrumAnalyzer } from '../../../dsp/spectrumAnalyzer';
import { smoothDbBins } from '../../../dsp/fractionalOctaveSmoothing';
import {
  selectPrimarySeries,
  getEffectiveSmoothing,
  getEffectivePollInterval,
  getEffectiveAnalyzerTau,
} from '../../../dsp/heatmapSeries';
import type { CamillaDSP } from '../../../lib/camillaDSP';

export interface SpectrumManagerConfig {
  // Analyzer config
  peakHoldTime: number; // seconds
  peakDecayRate: number; // dB/s
  
  // Heatmap dB range
  heatmapMinDb: number;
  heatmapMaxDb: number;
  
  // Stale data detection
  staleThreshold: number; // ms
}

export interface SpectrumVizState {
  showSTA: boolean;
  showLTA: boolean;
  showPeak: boolean;
  smoothingMode: 'off' | '1/12' | '1/6' | '1/3';
  spectrumMode: 'pre' | 'post';
  heatmapEnabled: boolean;
  heatmapMaskMode: HeatmapMaskMode;
  heatmapHighPrecision: boolean;
  heatmapAlphaGamma: number;
  heatmapMagnitudeGain: number;
  heatmapGateThreshold: number;
  heatmapMaxAlpha: number;
}

/**
 * Manages spectrum analysis, rendering, and polling
 */
export class SpectrumManager {
  private config: SpectrumManagerConfig;
  
  // Core components
  private analyzer: SpectrumAnalyzer;
  private renderer: SpectrumCanvasRenderer | null = null;
  private analyzerLayer: SpectrumAnalyzerLayer;
  private heatmapLayer: SpectrumHeatmapLayer;
  
  // Polling state
  private pollingInterval: number | null = null;
  private lastFrameTime: number = 0;
  
  constructor(config: SpectrumManagerConfig) {
    this.config = config;
    
    // Initialize analyzer
    this.analyzer = new SpectrumAnalyzer({
      holdTimeMs: config.peakHoldTime * 1000,
      decayRateDbPerSec: config.peakDecayRate,
    });
    
    // Initialize layers (will be added to renderer later)
    this.heatmapLayer = new SpectrumHeatmapLayer({
      enabled: false,
      maskMode: 'full',
      primarySeries: null,
    });
    
    this.analyzerLayer = new SpectrumAnalyzerLayer({
      showSTA: true,
      showLTA: false,
      showPeak: false,
    });
  }
  
  /**
   * Initialize the canvas renderer
   */
  initializeCanvas(canvasElement: HTMLCanvasElement, width: number, height: number): void {
    this.renderer = new SpectrumCanvasRenderer(canvasElement, [this.heatmapLayer, this.analyzerLayer]);
    this.renderer.resize(width, height);
  }
  
  /**
   * Resize the canvas
   */
  resize(width: number, height: number): void {
    if (this.renderer) {
      this.renderer.resize(width, height);
    }
  }
  
  /**
   * Update analyzer configuration
   */
  updateAnalyzerConfig(peakHoldTime: number, peakDecayRate: number): void {
    this.analyzer.updateConfig({
      holdTimeMs: peakHoldTime * 1000,
      decayRateDbPerSec: peakDecayRate,
    });
  }
  
  /**
   * Update analyzer layer visibility
   */
  updateAnalyzerLayer(vizState: Pick<SpectrumVizState, 'showSTA' | 'showLTA' | 'showPeak'>): void {
    this.analyzerLayer.setConfig({
      showLive: false,
      showSTA: vizState.showSTA,
      showLTA: vizState.showLTA,
      showPeak: vizState.showPeak,
    });
  }
  
  /**
   * Update analyzer time constants for high precision mode
   */
  updateAnalyzerTau(highPrecision: boolean): void {
    if (highPrecision) {
      const tau = getEffectiveAnalyzerTau(highPrecision);
      this.analyzer.updateConfig({
        ...this.analyzer.getConfig(),
        tauShort: tau.tauShort,
        tauLong: tau.tauLong,
      });
    }
  }
  
  /**
   * Update heatmap layer configuration
   */
  updateHeatmapLayer(vizState: Pick<SpectrumVizState, 'heatmapEnabled' | 'heatmapMaskMode' | 'heatmapAlphaGamma' | 'heatmapMagnitudeGain' | 'heatmapGateThreshold' | 'heatmapMaxAlpha'>): void {
    this.heatmapLayer.setConfig({
      enabled: vizState.heatmapEnabled,
      maskMode: vizState.heatmapMaskMode,
      primarySeries: null, // Updated during polling
      visualTuning: {
        minAlpha: 0.0,
        maxAlpha: vizState.heatmapMaxAlpha,
        alphaGamma: vizState.heatmapAlphaGamma,
        colorGamma: 1.2,
        gateThreshold: vizState.heatmapGateThreshold,
        gateSoftness: 0.03,
        magnitudeGain: vizState.heatmapMagnitudeGain,
        darkOrange: { r: 180, g: 80, b: 20 },
        brightOrange: { r: 255, g: 140, b: 40 },
      },
    });
  }
  
  /**
   * Start spectrum polling
   */
  startPolling(dsp: CamillaDSP, vizState: SpectrumVizState): void {
    if (this.pollingInterval !== null) {
      return; // Already polling
    }
    
    const pollInterval = getEffectivePollInterval(vizState.heatmapHighPrecision);
    
    this.pollingInterval = window.setInterval(() => {
      this.pollSpectrum(dsp, vizState);
    }, pollInterval);
    
    console.log('Spectrum polling started', { pollInterval, highPrecision: vizState.heatmapHighPrecision });
  }
  
  /**
   * Stop spectrum polling
   */
  stopPolling(): void {
    if (this.pollingInterval !== null) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      
      // Clear canvas
      if (this.renderer) {
        this.renderer.clear();
      }
      
      console.log('Spectrum polling stopped');
    }
  }
  
  /**
   * Poll spectrum data and render
   */
  private async pollSpectrum(dsp: CamillaDSP, vizState: SpectrumVizState): Promise<void> {
    if (!dsp.isSpectrumSocketOpen() || !this.renderer) {
      return;
    }
    
    try {
      const rawData = await dsp.getSpectrumData();
      const spectrumData = parseSpectrumData(rawData);
      
      if (spectrumData) {
        const nowMs = Date.now();
        this.lastFrameTime = nowMs;
        
        // Apply fractional-octave smoothing
        const effectiveSmoothing = getEffectiveSmoothing(vizState.smoothingMode, vizState.heatmapHighPrecision);
        const smoothedDb = smoothDbBins(spectrumData.binsDb, effectiveSmoothing);
        
        // Update analyzer state
        this.analyzer.update(smoothedDb, nowMs);
        
        // Get analyzer state
        const state = this.analyzer.getState();
        
        // Prepare series for rendering
        const staNorm = state.staDb ? dbArrayToNormalized(state.staDb) : null;
        const ltaNorm = state.ltaDb ? dbArrayToNormalized(state.ltaDb) : null;
        const peakNorm = state.peakDb ? dbArrayToNormalized(state.peakDb) : null;
        
        // For heatmap: use custom dB range
        const staHeatNorm = state.staDb 
          ? dbArrayToNormalized(state.staDb, this.config.heatmapMinDb, this.config.heatmapMaxDb) 
          : null;
        
        // Update analyzer layer
        this.analyzerLayer.setSeries({
          liveNorm: null,
          staNorm,
          ltaNorm,
          peakNorm,
        });
        
        // Update heatmap layer
        const primarySeries = selectPrimarySeries(
          { showSTA: vizState.showSTA, showLTA: vizState.showLTA, showPeak: vizState.showPeak },
          { staNorm, ltaNorm, peakNorm }
        );
        this.heatmapLayer.setConfig({
          primarySeries,
        });
        
        // Render
        this.renderer.resetOpacity();
        this.renderer.render(staHeatNorm || staNorm || [], {
          mode: vizState.spectrumMode,
        });
      }
    } catch (error) {
      console.error('Spectrum poll error:', error);
    }
    
    // Check for stale data
    this.checkStaleData();
  }
  
  /**
   * Check for stale data and fade out if needed
   */
  private checkStaleData(): void {
    const timeSinceLastFrame = Date.now() - this.lastFrameTime;
    if (timeSinceLastFrame > this.config.staleThreshold && this.renderer) {
      this.renderer.fadeOut(0.3);
    }
  }
  
  /**
   * Reset analyzer averages
   */
  resetAverages(): void {
    this.analyzer.resetAverages();
  }
  
  /**
   * Check if currently polling
   */
  isPolling(): boolean {
    return this.pollingInterval !== null;
  }
  
  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopPolling();
    this.renderer = null;
  }
}
