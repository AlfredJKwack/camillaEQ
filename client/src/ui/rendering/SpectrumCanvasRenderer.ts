/**
 * Spectrum Canvas Renderer
 * High-frequency rendering (~10Hz) with zero DOM churn
 * Per design-spec: Canvas layer for spectrum overlay
 * 
 * Refactored to support pluggable visualization layers
 */

import type { CanvasVisualizationLayer } from './canvasLayers/CanvasVisualizationLayer';

export interface SpectrumRenderOptions {
  mode: 'pre' | 'post';
}

export class SpectrumCanvasRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number = 1;
  private widthCss: number = 0;
  private heightCss: number = 0;
  private layers: CanvasVisualizationLayer[] = [];

  constructor(canvas: HTMLCanvasElement, layers: CanvasVisualizationLayer[] = []) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }
    this.ctx = ctx;
    this.dpr = window.devicePixelRatio || 1;
    this.layers = layers;
  }

  /**
   * Set visualization layers
   */
  setLayers(layers: CanvasVisualizationLayer[]): void {
    this.layers = layers;
  }

  /**
   * Get visualization layers (for external modification)
   */
  getLayers(): CanvasVisualizationLayer[] {
    return this.layers;
  }

  /**
   * Resize canvas to match CSS dimensions with proper DPR scaling
   * Fixed: Reset transform to prevent scaling accumulation
   */
  resize(widthCss: number, heightCss: number): void {
    this.widthCss = widthCss;
    this.heightCss = heightCss;

    // Set backing store size (actual pixel resolution)
    this.canvas.width = widthCss * this.dpr;
    this.canvas.height = heightCss * this.dpr;

    // Set CSS size (visual size)
    this.canvas.style.width = `${widthCss}px`;
    this.canvas.style.height = `${heightCss}px`;

    // Reset transform and scale context to match DPR (prevents accumulation)
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);
  }

  /**
   * Render spectrum using all active layers
   * @param bins - Normalized magnitude values [0..1] for each frequency bin
   * @param options - Rendering options
   */
  render(bins: number[], options: SpectrumRenderOptions): void {
    if (!bins || bins.length === 0) {
      this.clear();
      return;
    }

    const { mode } = options;

    // Clear previous frame
    this.ctx.clearRect(0, 0, this.widthCss, this.heightCss);

    // Render each layer
    for (const layer of this.layers) {
      layer.render({
        ctx: this.ctx,
        width: this.widthCss,
        height: this.heightCss,
        bins,
        mode,
      });
    }
  }

  /**
   * Clear the canvas
   */
  clear(): void {
    this.ctx.clearRect(0, 0, this.widthCss, this.heightCss);
  }

  /**
   * Fade out (for stale data indicator)
   */
  fadeOut(opacity: number = 0.5): void {
    this.ctx.globalAlpha = opacity;
  }

  /**
   * Reset opacity
   */
  resetOpacity(): void {
    this.ctx.globalAlpha = 1.0;
  }
}
