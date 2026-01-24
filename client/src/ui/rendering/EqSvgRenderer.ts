/**
 * EQ curve SVG path generation
 * Converts filter frequency response to SVG path strings
 */

import type { EqBand } from '../../dsp/filterResponse';
import { sumResponseDb, generateLogFrequencies } from '../../dsp/filterResponse';

export interface CurveOptions {
  width: number;       // SVG viewBox width
  height: number;      // SVG viewBox height
  numPoints?: number;  // Number of frequency samples (default: 256)
  freqMin?: number;    // Min frequency Hz (default: 20)
  freqMax?: number;    // Max frequency Hz (default: 20000)
  gainMin?: number;    // Min gain dB (default: -24)
  gainMax?: number;    // Max gain dB (default: 24)
}

/**
 * Map frequency to X coordinate (log scale)
 */
export function freqToX(freq: number, width: number, freqMin = 20, freqMax = 20000): number {
  const logMin = Math.log10(freqMin);
  const logMax = Math.log10(freqMax);
  const xNorm = (Math.log10(freq) - logMin) / (logMax - logMin);
  return xNorm * width;
}

/**
 * Map gain (dB) to Y coordinate (linear scale, inverted for SVG)
 * Y=0 is top of SVG, Y=height is bottom
 * gainMax → Y=0 (top)
 * 0 dB → Y=height/2 (middle)
 * gainMin → Y=height (bottom)
 */
export function gainToY(gainDb: number, height: number, gainMin = -24, gainMax = 24): number {
  const gainRange = gainMax - gainMin;
  const normalized = (gainMax - gainDb) / gainRange;
  return normalized * height;
}

/**
 * Generate SVG path for EQ sum curve
 * Returns an SVG path `d` attribute string
 */
export function generateCurvePath(bands: EqBand[], options: CurveOptions): string {
  // Return empty string if no bands
  if (bands.length === 0) {
    return '';
  }

  const {
    width,
    height,
    numPoints = 256,
    freqMin = 20,
    freqMax = 20000,
    gainMin = -24,
    gainMax = 24,
  } = options;

  // Generate log-spaced frequency samples
  const frequencies = generateLogFrequencies(freqMin, freqMax, numPoints);

  // Calculate response at each frequency
  const points: Array<{ x: number; y: number }> = [];
  for (const freq of frequencies) {
    const gainDb = sumResponseDb(freq, bands);

    // Clamp gain to viewport range
    const clampedGain = Math.max(gainMin, Math.min(gainMax, gainDb));

    const x = freqToX(freq, width, freqMin, freqMax);
    const y = gainToY(clampedGain, height, gainMin, gainMax);

    points.push({ x, y });
  }

  // Build SVG path
  if (points.length === 0) {
    return '';
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x} ${points[i].y}`;
  }

  return path;
}

/**
 * Generate SVG path for a single band's response curve
 */
export function generateBandCurvePath(band: EqBand, options: CurveOptions): string {
  // Temporarily wrap single band in array to reuse sumResponseDb logic
  return generateCurvePath([band], options);
}
