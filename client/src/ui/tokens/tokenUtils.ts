/**
 * Token label formatting and arc utilities for MVP-12
 */

/**
 * Format frequency for token label
 * 20-999 Hz → "150 Hz"
 * 1000+ Hz → "1.2k Hz"
 */
export function formatTokenFrequency(freqHz: number): string {
  if (freqHz >= 1000) {
    const k = freqHz / 1000;
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return `${Math.round(freqHz)}`;
}

/**
 * Format Q value for token label
 * Always shows "Q X.X" with 1 decimal place
 */
export function formatTokenQ(q: number): string {
  return `Q ${q.toFixed(1)}`;
}

/**
 * Map Q value to arc sweep angle (degrees)
 * Low Q → small arc (30°)
 * High Q → large arc (270°)
 * Range: Q [0.1..10] → sweep [30..270]
 */
export function qToSweepDeg(q: number): number {
  const minQ = 0.1;
  const maxQ = 10;
  const minSweep = 30;
  const maxSweep = 270;
  
  const clampedQ = Math.max(minQ, Math.min(maxQ, q));
  const normalized = (clampedQ - minQ) / (maxQ - minQ);
  
  return minSweep + normalized * (maxSweep - minSweep);
}

/**
 * Generate SVG path for ellipse arc
 * Arc is centered at top (0° = 12 o'clock) and grows symmetrically
 * 
 * To avoid largeArcFlag discontinuity at 180°, we split arcs >180° into two segments.
 * This prevents visual "jumps" when dragging Q across the threshold.
 */
export function describeEllipseArcPath(params: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  startDeg: number;
  endDeg: number;
}): string {
  const { cx, cy, rx, ry, startDeg, endDeg } = params;
  
  const sweepAngle = endDeg - startDeg;
  
  // If sweep <= 180°, use single arc (largeArcFlag = 0)
  if (sweepAngle <= 180) {
    const startRad = (startDeg - 90) * (Math.PI / 180);
    const endRad = (endDeg - 90) * (Math.PI / 180);
    
    const x1 = cx + rx * Math.cos(startRad);
    const y1 = cy + ry * Math.sin(startRad);
    const x2 = cx + rx * Math.cos(endRad);
    const y2 = cy + ry * Math.sin(endRad);
    
    return `M ${x1} ${y1} A ${rx} ${ry} 0 0 1 ${x2} ${y2}`;
  }
  
  // For sweep > 180°, split into two arcs at midpoint
  const midDeg = (startDeg + endDeg) / 2;
  
  const startRad = (startDeg - 90) * (Math.PI / 180);
  const midRad = (midDeg - 90) * (Math.PI / 180);
  const endRad = (endDeg - 90) * (Math.PI / 180);
  
  const x1 = cx + rx * Math.cos(startRad);
  const y1 = cy + ry * Math.sin(startRad);
  const xMid = cx + rx * Math.cos(midRad);
  const yMid = cy + ry * Math.sin(midRad);
  const x2 = cx + rx * Math.cos(endRad);
  const y2 = cy + ry * Math.sin(endRad);
  
  // Each segment is now ≤ 135° (since max sweep is 270°)
  return `M ${x1} ${y1} A ${rx} ${ry} 0 0 1 ${xMid} ${yMid} A ${rx} ${ry} 0 0 1 ${x2} ${y2}`;
}

/**
 * Determine if labels should be placed above token
 * Returns true when token is near bottom of plot
 * 
 * @param cyViewBox - Token Y position in viewBox coordinates (0-400)
 * @param plotHeightPx - Actual plot height in pixels
 * @returns true if labels should go above token
 */
export function shouldPlaceLabelsAbove(cyViewBox: number, plotHeightPx: number): boolean {
  // Convert 60px threshold to viewBox units
  // viewBox is 0-400, so we need to map pixels to viewBox
  const viewBoxHeight = 400;
  const threshold = (60 / plotHeightPx) * viewBoxHeight;
  
  // If token Y > (400 - threshold), place labels above
  return cyViewBox > (viewBoxHeight - threshold);
}

/**
 * Compute smooth label shift factor for boundary-aware placement
 * Returns a value between 0 (labels below) and 1 (labels above)
 * Uses smoothstep interpolation to avoid abrupt jumps
 * 
 * @param cyViewBox - Token Y position in viewBox coordinates (0-400)
 * @param plotHeightPx - Actual plot height in pixels
 * @returns Shift factor t ∈ [0..1], where 0=below, 1=above
 */
export function labelShiftFactor(cyViewBox: number, plotHeightPx: number): number {
  const viewBoxHeight = 400;
  
  const thresholdPx = 60; // Same as shouldPlaceLabelsAbove
  const blendPx = 40;     // Smoothing band width
  
  const thresholdVb = (thresholdPx / plotHeightPx) * viewBoxHeight;
  const blendVb = (blendPx / plotHeightPx) * viewBoxHeight;
  
  const boundary = viewBoxHeight - thresholdVb;
  const start = boundary - blendVb;
  const end = boundary + blendVb;
  
  // Smoothstep interpolation for smooth transition
  const x = Math.max(0, Math.min(1, (cyViewBox - start) / (end - start)));
  return x * x * (3 - 2 * x);
}
