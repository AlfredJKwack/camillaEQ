/**
 * Canvas Visualization Layer Interface
 * Allows multiple background visualizations to be rendered into the same canvas
 */

export interface CanvasVisualizationLayer {
  id: string;
  render(args: {
    ctx: CanvasRenderingContext2D;
    width: number;
    height: number;
    bins: number[];
    mode: 'pre' | 'post';
  }): void;
}
