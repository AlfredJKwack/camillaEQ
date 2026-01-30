/**
 * Spectrum Analyzer Layer - MVP-16
 * Renders multiple analyzer series: Live, STA, LTA, Peak Hold
 */

import type { CanvasVisualizationLayer } from './CanvasVisualizationLayer';

export interface AnalyzerSeries {
  liveNorm: number[] | null;
  staNorm: number[] | null;
  ltaNorm: number[] | null;
  peakNorm: number[] | null;
}

export interface AnalyzerLayerConfig {
  showLive: boolean;
  showSTA: boolean;
  showLTA: boolean;
  showPeak: boolean;
}

export class SpectrumAnalyzerLayer implements CanvasVisualizationLayer {
  public readonly id = 'spectrum-analyzer';
  private config: AnalyzerLayerConfig;
  private series: AnalyzerSeries;

  // Colors for pre/post modes
  private readonly colors = {
    pre: {
      live: { stroke: 'rgba(120, 160, 255, 0.35)', width: 1.0 },
      sta: { stroke: 'rgba(140, 180, 255, 0.85)', width: 2.0 },
      lta: { stroke: 'rgba(160, 200, 255, 0.65)', width: 1.5 },
      peak: { stroke: 'rgba(180, 220, 255, 0.55)', width: 1.0, dash: [4, 4] },
    },
    post: {
      live: { stroke: 'rgba(120, 255, 190, 0.30)', width: 1.0 },
      sta: { stroke: 'rgba(150, 255, 210, 0.80)', width: 2.0 },
      lta: { stroke: 'rgba(170, 255, 220, 0.60)', width: 1.5 },
      peak: { stroke: 'rgba(190, 255, 230, 0.50)', width: 1.0, dash: [4, 4] },
    },
  };

  constructor(config: Partial<AnalyzerLayerConfig> = {}) {
    this.config = {
      showLive: false,
      showSTA: true,  // Default ON per spec
      showLTA: false,
      showPeak: false,
      ...config,
    };
    this.series = {
      liveNorm: null,
      staNorm: null,
      ltaNorm: null,
      peakNorm: null,
    };
  }

  /**
   * Update analyzer series data
   */
  setSeries(series: Partial<AnalyzerSeries>): void {
    this.series = { ...this.series, ...series };
  }

  /**
   * Update visibility config
   */
  setConfig(config: Partial<AnalyzerLayerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  render(args: {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    binsNormalized: number[];
    mode: 'pre' | 'post';
  }): void {
    const { ctx, width, height, mode } = args;
    const colors = this.colors[mode];

    // Draw in order: Live (faintest) → LTA → STA (brightest) → Peak (dotted)
    // This ensures the most important curves (STA) are on top

    if (this.config.showLive && this.series.liveNorm) {
      this.drawLine(ctx, this.series.liveNorm, width, height, colors.live.stroke, colors.live.width);
    }

    if (this.config.showLTA && this.series.ltaNorm) {
      this.drawLine(ctx, this.series.ltaNorm, width, height, colors.lta.stroke, colors.lta.width);
    }

    if (this.config.showSTA && this.series.staNorm) {
      this.drawLine(ctx, this.series.staNorm, width, height, colors.sta.stroke, colors.sta.width);
    }

    if (this.config.showPeak && this.series.peakNorm) {
      this.drawLine(ctx, this.series.peakNorm, width, height, colors.peak.stroke, colors.peak.width, colors.peak.dash);
    }
  }

  /**
   * Draw a spectrum line
   */
  private drawLine(
    ctx: CanvasRenderingContext2D,
    bins: number[],
    width: number,
    height: number,
    strokeColor: string,
    lineWidth: number,
    dash?: number[]
  ): void {
    if (!bins || bins.length === 0) return;

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    
    if (dash) {
      ctx.setLineDash(dash);
    } else {
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    
    for (let i = 0; i < bins.length; i++) {
      const magnitude = Math.max(0, Math.min(1, bins[i]));
      const x = (i / (bins.length - 1)) * width;
      const y = height - magnitude * height;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash
  }
}
