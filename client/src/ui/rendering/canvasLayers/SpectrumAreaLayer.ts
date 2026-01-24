/**
 * Spectrum Area Layer
 * Renders spectrum as filled curve with outline
 */

import type { CanvasVisualizationLayer } from './CanvasVisualizationLayer';

export interface SpectrumAreaLayerOptions {
  smooth?: boolean; // Enable curve smoothing (default: false)
  smoothingStrength?: number; // Data smoothing window size (default: 5)
}

export class SpectrumAreaLayer implements CanvasVisualizationLayer {
  public readonly id = 'spectrum-area';
  private smooth: boolean;
  private smoothingStrength: number;

  // Colors: fill (dimmer) and stroke (brighter) for better visibility
  private readonly colors = {
    pre: {
      fill: 'rgba(120, 160, 255, 0.15)',
      stroke: 'rgba(140, 180, 255, 0.55)',
    },
    post: {
      fill: 'rgba(120, 255, 190, 0.14)',
      stroke: 'rgba(150, 255, 210, 0.50)',
    },
  };

  constructor(options: SpectrumAreaLayerOptions = {}) {
    this.smooth = options.smooth ?? false;
    this.smoothingStrength = options.smoothingStrength ?? 5;
  }

  /**
   * Set smoothing mode
   */
  setSmooth(smooth: boolean): void {
    this.smooth = smooth;
  }

  /**
   * Set smoothing strength (for future GUI control)
   */
  setSmoothingStrength(strength: number): void {
    this.smoothingStrength = Math.max(1, Math.min(20, strength));
  }

  render(args: {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    bins: number[];
    mode: 'pre' | 'post';
  }): void {
    const { ctx, width, height, bins, mode } = args;

    if (!bins || bins.length === 0) return;

    const colors = this.colors[mode];
    const numBins = bins.length;

    // Apply data smoothing if enabled
    const smoothedBins = this.smooth ? this.applySmoothingFilter(bins) : bins;

    // Generate points (x, y) for each bin
    const points: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < numBins; i++) {
      const magnitude = Math.max(0, Math.min(1, smoothedBins[i]));
      const x = (i / (numBins - 1)) * width;
      const y = height - magnitude * height; // Inverted (0 at bottom)
      points.push({ x, y });
    }

    // Draw filled area
    ctx.fillStyle = colors.fill;
    ctx.beginPath();
    ctx.moveTo(0, height); // Start at bottom-left
    ctx.lineTo(points[0].x, points[0].y); // Connect to first point

    if (this.smooth) {
      this.drawSmoothCurve(ctx, points, false); // Continue from current point
    } else {
      // Polyline (skip first point as we already connected to it)
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
    }

    ctx.lineTo(width, height); // Close to bottom-right
    ctx.closePath();
    ctx.fill();

    // Draw outline (stroke) for better visibility
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    if (this.smooth) {
      this.drawSmoothCurve(ctx, points, true); // Start fresh with moveTo
    } else {
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
    }

    ctx.stroke();
  }

  /**
   * Draw smooth curve through points using Catmull-Rom to Bezier conversion
   * @param ctx - Canvas context
   * @param points - Array of points to draw through
   * @param startWithMoveTo - If true, start with moveTo; if false, continue from current point
   */
  private drawSmoothCurve(
    ctx: CanvasRenderingContext2D,
    points: Array<{ x: number; y: number }>,
    startWithMoveTo: boolean = true
  ): void {
    if (points.length < 2) return;

    // Optionally start at first point
    if (startWithMoveTo) {
      ctx.moveTo(points[0].x, points[0].y);
    }

    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
      return;
    }

    // Use Catmull-Rom spline for smooth interpolation
    // Tension parameter (0 = straight lines, 0.5 = Catmull-Rom, 1 = tight curves)
    const tension = 0.5;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i === 0 ? i : i - 1];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;

      // Calculate control points for cubic Bezier
      const cp1x = p1.x + (p2.x - p0.x) / 6 * tension;
      const cp1y = p1.y + (p2.y - p0.y) / 6 * tension;
      const cp2x = p2.x - (p3.x - p1.x) / 6 * tension;
      const cp2y = p2.y - (p3.y - p1.y) / 6 * tension;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }

  /**
   * Apply moving average smoothing filter to bins
   * Reduces noise and makes curve visibly smoother
   */
  private applySmoothingFilter(bins: number[]): number[] {
    const windowSize = this.smoothingStrength;
    const halfWindow = Math.floor(windowSize / 2);
    const smoothed: number[] = [];

    for (let i = 0; i < bins.length; i++) {
      let sum = 0;
      let count = 0;

      // Average within window (with edge clamping)
      for (let j = -halfWindow; j <= halfWindow; j++) {
        const index = Math.max(0, Math.min(bins.length - 1, i + j));
        sum += bins[index];
        count++;
      }

      smoothed.push(sum / count);
    }

    return smoothed;
  }
}
