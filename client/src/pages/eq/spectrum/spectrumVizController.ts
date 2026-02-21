/**
 * spectrumVizController.ts
 * Factory for creating a spectrum visualization controller that manages:
 * - Spectrum analysis (STA/LTA/Peak tracking)
 * - Canvas rendering (analyzer lines + heatmap)
 * - Polling lifecycle (start/stop based on readiness)
 */

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

export type SmoothingMode = 'off' | '1/12' | '1/6' | '1/3';
export type SpectrumMode = 'pre' | 'post';

export interface SpectrumVizControllerConfig {
  canvas: HTMLCanvasElement;
  getPlotSize: () => { width: number; height: number };
  getDsp: () => CamillaDSP | null;
  
  // Initial config
  peakHoldTimeSec?: number;
  peakDecayRateDbPerSec?: number;
  heatmapMinDb?: number;
  heatmapMaxDb?: number;
  staleThresholdMs?: number;
}

export interface AnalyzerVisibility {
  showSTA: boolean;
  showLTA: boolean;
  showPeak: boolean;
}

export interface HeatmapConfig {
  enabled: boolean;
  maskMode: HeatmapMaskMode;
  highPrecision: boolean;
  alphaGamma: number;
  magnitudeGain: number;
  gateThreshold: number;
  maxAlpha: number;
}

/**
 * Create a spectrum visualization controller
 */
export function createSpectrumVizController(config: SpectrumVizControllerConfig) {
  // Configuration
  const peakHoldTime = config.peakHoldTimeSec ?? 2.0;
  const peakDecayRate = config.peakDecayRateDbPerSec ?? 12;
  const heatmapMinDb = config.heatmapMinDb ?? -85;
  const heatmapMaxDb = config.heatmapMaxDb ?? -10;
  const staleThreshold = config.staleThresholdMs ?? 500;
  
  // Core components
  const analyzer = new SpectrumAnalyzer({
    holdTimeMs: peakHoldTime * 1000,
    decayRateDbPerSec: peakDecayRate,
  });
  
  const heatmapLayer = new SpectrumHeatmapLayer({
    enabled: false,
    maskMode: 'full',
    primarySeries: null,
  });
  
  const analyzerLayer = new SpectrumAnalyzerLayer({
    showSTA: true,
    showLTA: false,
    showPeak: false,
  });
  
  const renderer = new SpectrumCanvasRenderer(config.canvas, [heatmapLayer, analyzerLayer]);
  const { width, height } = config.getPlotSize();
  renderer.resize(width, height);
  
  // Polling state
  let pollingInterval: number | null = null;
  let lastFrameTime = 0;
  let currentSmoothingMode: SmoothingMode = 'off';
  let currentSpectrumMode: SpectrumMode = 'pre';
  let currentHeatmapConfig: HeatmapConfig = {
    enabled: false,
    maskMode: 'full',
    highPrecision: false,
    alphaGamma: 1.8,
    magnitudeGain: 1.0,
    gateThreshold: 0.05,
    maxAlpha: 0.85,
  };
  let currentAnalyzerVisibility: AnalyzerVisibility = {
    showSTA: true,
    showLTA: false,
    showPeak: false,
  };
  
  /**
   * Poll spectrum data and render
   */
  async function pollSpectrum(): Promise<void> {
    const dsp = config.getDsp();
    if (!dsp?.isSpectrumSocketOpen()) {
      return;
    }
    
    try {
      const rawData = await dsp.getSpectrumData();
      const spectrumData = parseSpectrumData(rawData);
      
      if (spectrumData) {
        const nowMs = Date.now();
        lastFrameTime = nowMs;
        
        // Apply fractional-octave smoothing
        const effectiveSmoothing = getEffectiveSmoothing(
          currentSmoothingMode,
          currentHeatmapConfig.highPrecision
        );
        const smoothedDb = smoothDbBins(spectrumData.binsDb, effectiveSmoothing);
        
        // Update analyzer state
        analyzer.update(smoothedDb, nowMs);
        
        // Get analyzer state
        const state = analyzer.getState();
        
        // Prepare series for rendering
        const staNorm = state.staDb ? dbArrayToNormalized(state.staDb) : null;
        const ltaNorm = state.ltaDb ? dbArrayToNormalized(state.ltaDb) : null;
        const peakNorm = state.peakDb ? dbArrayToNormalized(state.peakDb) : null;
        
        // For heatmap: use custom dB range
        const staHeatNorm = state.staDb
          ? dbArrayToNormalized(state.staDb, heatmapMinDb, heatmapMaxDb)
          : null;
        
        // Update analyzer layer
        analyzerLayer.setSeries({
          liveNorm: null,
          staNorm,
          ltaNorm,
          peakNorm,
        });
        
        // Update heatmap layer
        const primarySeries = selectPrimarySeries(
          currentAnalyzerVisibility,
          { staNorm, ltaNorm, peakNorm }
        );
        heatmapLayer.setConfig({
          primarySeries,
        });
        
        // Render
        renderer.resetOpacity();
        renderer.render(staHeatNorm || staNorm || [], {
          mode: currentSpectrumMode,
        });
      }
    } catch (error) {
      console.error('Spectrum poll error:', error);
    }
    
    // Check for stale data
    checkStaleData();
  }
  
  /**
   * Check for stale data and fade out if needed
   */
  function checkStaleData(): void {
    const timeSinceLastFrame = Date.now() - lastFrameTime;
    if (timeSinceLastFrame > staleThreshold) {
      renderer.fadeOut(0.3);
    }
  }
  
  /**
   * Start polling
   */
  function startPolling(): void {
    if (pollingInterval !== null) {
      return; // Already polling
    }
    
    const pollInterval = getEffectivePollInterval(currentHeatmapConfig.highPrecision);
    
    pollingInterval = window.setInterval(() => {
      pollSpectrum();
    }, pollInterval);
    
    console.log('Spectrum polling started', {
      pollInterval,
      highPrecision: currentHeatmapConfig.highPrecision,
    });
  }
  
  /**
   * Stop polling
   */
  function stopPolling(): void {
    if (pollingInterval !== null) {
      clearInterval(pollingInterval);
      pollingInterval = null;
      renderer.clear();
      console.log('Spectrum polling stopped');
    }
  }
  
  // Public API
  return {
    /**
     * Enable or disable spectrum polling
     */
    setEnabled(enabled: boolean): void {
      if (enabled && pollingInterval === null) {
        startPolling();
      } else if (!enabled && pollingInterval !== null) {
        stopPolling();
      }
    },
    
    /**
     * Set spectrum mode (pre-EQ or post-EQ)
     */
    setSpectrumMode(mode: SpectrumMode): void {
      currentSpectrumMode = mode;
    },
    
    /**
     * Set smoothing mode
     */
    setSmoothingMode(mode: SmoothingMode): void {
      currentSmoothingMode = mode;
    },
    
    /**
     * Set analyzer visibility (STA/LTA/Peak)
     */
    setAnalyzerVisibility(visibility: AnalyzerVisibility): void {
      currentAnalyzerVisibility = visibility;
      analyzerLayer.setConfig({
        showLive: false,
        showSTA: visibility.showSTA,
        showLTA: visibility.showLTA,
        showPeak: visibility.showPeak,
      });
    },
    
    /**
     * Set analyzer peak tracking config
     */
    setAnalyzerPeakConfig(cfg: { holdTimeSec: number; decayRateDbPerSec: number }): void {
      analyzer.updateConfig({
        holdTimeMs: cfg.holdTimeSec * 1000,
        decayRateDbPerSec: cfg.decayRateDbPerSec,
      });
    },
    
    /**
     * Set heatmap configuration
     */
    setHeatmapConfig(cfg: HeatmapConfig): void {
      currentHeatmapConfig = { ...cfg };
      
      // Update analyzer tau if high precision changed
      const tau = getEffectiveAnalyzerTau(cfg.highPrecision);
      analyzer.updateConfig({
        ...analyzer.getConfig(),
        tauShort: tau.tauShort,
        tauLong: tau.tauLong,
      });
      
      // Update heatmap layer
      heatmapLayer.setConfig({
        enabled: cfg.enabled,
        maskMode: cfg.maskMode,
        primarySeries: null, // Updated during polling
        visualTuning: {
          minAlpha: 0.0,
          maxAlpha: cfg.maxAlpha,
          alphaGamma: cfg.alphaGamma,
          colorGamma: 1.2,
          gateThreshold: cfg.gateThreshold,
          gateSoftness: 0.03,
          magnitudeGain: cfg.magnitudeGain,
          darkOrange: { r: 180, g: 80, b: 20 },
          brightOrange: { r: 255, g: 140, b: 40 },
        },
      });
      
      // Restart polling if needed to update interval
      if (pollingInterval !== null) {
        stopPolling();
        startPolling();
      }
    },
    
    /**
     * Resize the canvas
     */
    resize(width: number, height: number): void {
      renderer.resize(width, height);
    },
    
    /**
     * Reset analyzer averages
     */
    resetAverages(): void {
      analyzer.resetAverages();
    },
    
    /**
     * Check if currently polling
     */
    isPolling(): boolean {
      return pollingInterval !== null;
    },
    
    /**
     * Cleanup resources
     */
    destroy(): void {
      stopPolling();
    },
  };
}

export type SpectrumVizController = ReturnType<typeof createSpectrumVizController>;
