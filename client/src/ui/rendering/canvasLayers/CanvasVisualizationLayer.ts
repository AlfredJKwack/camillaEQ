/**
 * Canvas Visualization Layer Interface - MVP-16
 * Allows multiple background visualizations to be rendered into the same canvas
 * Updated to support analyzer series (Live, STA, LTA, Peak)
 */

export interface CanvasVisualizationLayer {
  id: string;
  render(args: {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    binsNormalized: number[]; // Normalized [0..1] for rendering
    mode: 'pre' | 'post';
  }): void;
}
