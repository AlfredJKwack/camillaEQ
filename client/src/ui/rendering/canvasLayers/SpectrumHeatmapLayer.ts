/**
 * Spectrum Heatmap Layer - MVP-30
 * Renders spectrum as vertical orange lines with amplitude via opacity/brightness
 * Supports masking (top/bottom/full) relative to primary histogram curve
 */

import type { CanvasVisualizationLayer } from './CanvasVisualizationLayer';

export type HeatmapMaskMode = 'top' | 'bottom' | 'full';

export interface HeatmapLayerConfig {
  enabled: boolean;
  maskMode: HeatmapMaskMode;
  enhancedFrequency: boolean; // true = thin 1px lines, false = fill bin width
  primarySeries: number[] | null; // Reference curve for masking
}

export class SpectrumHeatmapLayer implements CanvasVisualizationLayer {
  public readonly id = 'spectrum-heatmap';
  private config: HeatmapLayerConfig;

  // Heatmap visual parameters
  private readonly minAlpha = 0.1; // Minimum opacity for faint bins
  private readonly maxAlpha = 0.9; // Maximum opacity for strong bins
  private readonly gamma = 0.8; // Power curve for opacity mapping
  
  // Orange color palette (dark → bright)
  private readonly darkOrange = { r: 180, g: 80, b: 20 };   // Deep orange
  private readonly brightOrange = { r: 255, g: 140, b: 40 }; // Vibrant orange

  constructor(config: Partial<HeatmapLayerConfig> = {}) {
    this.config = {
      enabled: false,
      maskMode: 'full',
      enhancedFrequency: false,
      primarySeries: null,
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

    for (let i = 0; i < numBins; i++) {
      const magnitude = Math.max(0, Math.min(1, bins[i]));
      
      // Compute opacity (power curve for better perceptual scaling)
      const alpha = this.minAlpha + Math.pow(magnitude, this.gamma) * (this.maxAlpha - this.minAlpha);
      
      // Compute brightness (interpolate between dark and bright orange)
      const r = this.darkOrange.r + magnitude * (this.brightOrange.r - this.darkOrange.r);
      const g = this.darkOrange.g + magnitude * (this.brightOrange.g - this.darkOrange.g);
      const b = this.darkOrange.b + magnitude * (this.brightOrange.b - this.darkOrange.b);
      
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
