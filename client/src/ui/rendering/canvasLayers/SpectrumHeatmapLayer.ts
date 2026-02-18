/**
 * Spectrum Heatmap Layer - MVP-30
 * Renders spectrum as vertical orange lines with amplitude via opacity/brightness
 * Supports masking (top/bottom/full) relative to primary histogram curve
 */

import type { CanvasVisualizationLayer } from './CanvasVisualizationLayer';

export type HeatmapMaskMode = 'top' | 'bottom' | 'full';

export interface HeatmapVisualTuning {
  // Opacity mapping
  minAlpha: number;      // Minimum opacity for faint bins (0..1, default 0.0)
  maxAlpha: number;      // Maximum opacity for strong bins (0..1, default 0.95)
  alphaGamma: number;    // Power curve for opacity contrast (>1 = more contrast, default 1.8)
  
  // Color brightness mapping
  colorGamma: number;    // Power curve for brightness (default 1.2)
  
  // Noise gate
  gateThreshold: number; // Below this magnitude, bin is invisible (0..1, default 0.05)
  gateSoftness: number;  // Soft-knee width for gate (0..1, default 0.03)
  
  // Overall gain
  magnitudeGain: number; // Scalar applied before mapping (default 1.5)
  
  // Orange color palette (dark → bright)
  darkOrange: { r: number; g: number; b: number };
  brightOrange: { r: number; g: number; b: number };
}

export const DEFAULT_HEATMAP_TUNING: HeatmapVisualTuning = {
  minAlpha: 0.0,
  maxAlpha: 0.95,
  alphaGamma: 2.8,
  colorGamma: 1.2,
  gateThreshold: 0.05,
  gateSoftness: 0.03,
  magnitudeGain: 2.5,
  darkOrange: { r: 180, g: 80, b: 20 },
  brightOrange: { r: 255, g: 140, b: 40 },
};

export interface HeatmapLayerConfig {
  enabled: boolean;
  maskMode: HeatmapMaskMode;
  enhancedFrequency: boolean; // true = thin 1px lines, false = fill bin width
  primarySeries: number[] | null; // Reference curve for masking
  visualTuning: HeatmapVisualTuning;
}

export class SpectrumHeatmapLayer implements CanvasVisualizationLayer {
  public readonly id = 'spectrum-heatmap';
  private config: HeatmapLayerConfig;

  constructor(config: Partial<HeatmapLayerConfig> = {}) {
    this.config = {
      enabled: false,
      maskMode: 'full',
      enhancedFrequency: false,
      primarySeries: null,
      visualTuning: DEFAULT_HEATMAP_TUNING,
      ...config,
    };
  }

  /**
   * Update heatmap configuration
   */
  setConfig(config: Partial<HeatmapLayerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  render(args: {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    binsNormalized: number[];
    mode: 'pre' | 'post';
  }): void {
    if (!this.config.enabled) return;

    const { ctx, width, height, binsNormalized } = args;

    if (!binsNormalized || binsNormalized.length === 0) return;

    // Apply masking if not full mode
    if (this.config.maskMode !== 'full' && this.config.primarySeries) {
      this.renderWithMask(ctx, width, height, binsNormalized);
    } else {
      this.renderFullHeatmap(ctx, width, height, binsNormalized);
    }
  }

  /**
   * Render full heatmap (no masking)
   */
  private renderFullHeatmap(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    bins: number[]
  ): void {
    const numBins = bins.length;
    const tuning = this.config.visualTuning;

    for (let i = 0; i < numBins; i++) {
      let magnitude = Math.max(0, Math.min(1, bins[i]));
      
      // Apply overall gain
      magnitude = Math.min(1, magnitude * tuning.magnitudeGain);
      
      // Apply noise gate with soft knee
      if (magnitude < tuning.gateThreshold) {
        const gateEnd = tuning.gateThreshold + tuning.gateSoftness;
        if (magnitude < tuning.gateThreshold - tuning.gateSoftness) {
          // Below gate - skip bin
          continue;
        } else if (magnitude < gateEnd) {
          // In soft-knee region - apply smooth attenuation
          const kneePos = (magnitude - (tuning.gateThreshold - tuning.gateSoftness)) / (2 * tuning.gateSoftness);
          magnitude = magnitude * kneePos;
        }
      }
      
      // Compute opacity (power curve for contrast)
      const alphaMag = Math.pow(magnitude, tuning.alphaGamma);
      const alpha = tuning.minAlpha + alphaMag * (tuning.maxAlpha - tuning.minAlpha);
      
      // Compute brightness (separate power curve)
      const colorMag = Math.pow(magnitude, tuning.colorGamma);
      const r = tuning.darkOrange.r + colorMag * (tuning.brightOrange.r - tuning.darkOrange.r);
      const g = tuning.darkOrange.g + colorMag * (tuning.brightOrange.g - tuning.darkOrange.g);
      const b = tuning.darkOrange.b + colorMag * (tuning.brightOrange.b - tuning.darkOrange.b);
      
      ctx.fillStyle = `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`;

      // Draw vertical line/column
      if (this.config.enhancedFrequency) {
        // Enhanced: thin 1px line at exact bin position
        const x = (i / (numBins - 1)) * width;
        ctx.fillRect(x, 0, 1, height);
      } else {
        // Normal: fill bin width (appears blended)
        const xStart = (i / numBins) * width;
        const xEnd = ((i + 1) / numBins) * width;
        ctx.fillRect(xStart, 0, xEnd - xStart, height);
      }
    }
  }

  /**
   * Render heatmap with top/bottom masking
   */
  private renderWithMask(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    bins: number[]
  ): void {
    if (!this.config.primarySeries) return;

    const primarySeries = this.config.primarySeries;
    const numBins = bins.length;

    // Build clipping path from primary series
    ctx.save();
    ctx.beginPath();

    if (this.config.maskMode === 'top') {
      // Clip from top edge down to curve
      ctx.moveTo(0, 0);
      
      for (let i = 0; i < primarySeries.length; i++) {
        const magnitude = Math.max(0, Math.min(1, primarySeries[i]));
        const x = (i / (primarySeries.length - 1)) * width;
        const y = height - magnitude * height;
        ctx.lineTo(x, y);
      }
      
      ctx.lineTo(width, 0);
      ctx.closePath();
    } else {
      // maskMode === 'bottom': Clip from curve down to bottom edge
      ctx.moveTo(0, height);
      
      for (let i = 0; i < primarySeries.length; i++) {
        const magnitude = Math.max(0, Math.min(1, primarySeries[i]));
        const x = (i / (primarySeries.length - 1)) * width;
        const y = height - magnitude * height;
        
        if (i === 0) {
          ctx.lineTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      
      ctx.lineTo(width, height);
      ctx.closePath();
    }

    // Apply clip
    ctx.clip();

    // Render heatmap within clipped region
    this.renderFullHeatmap(ctx, width, height, bins);

    ctx.restore();
  }
}
