/**
 * Area-of-effect visualization for MVP-14 focus mode
 * Pure helper functions for generating SVG fill shapes per filter type
 */

import type { EqBand } from '../../dsp/filterResponse';
import { bandResponseDb, generateLogFrequencies } from '../../dsp/filterResponse';

export interface AreaOptions {
  width: number;       // SVG viewBox width
  height: number;      // SVG viewBox height
  freqMin?: number;    // Min frequency Hz (default: 20)
  freqMax?: number;    // Max frequency Hz (default: 20000)
  gainMin?: number;    // Min gain dB (default: -24)
  gainMax?: number;    // Max gain dB (default: 24)
}

/**
 * Map frequency to X coordinate (log scale)
 */
function freqToX(freq: number, width: number, freqMin = 20, freqMax = 20000): number {
  const logMin = Math.log10(freqMin);
  const logMax = Math.log10(freqMax);
  const xNorm = (Math.log10(freq) - logMin) / (logMax - logMin);
  return xNorm * width;
}

/**
 * Map gain (dB) to Y coordinate (linear scale, inverted for SVG)
 */
function gainToY(gainDb: number, height: number, gainMin = -24, gainMax = 24): number {
  const gainRange = gainMax - gainMin;
  const normalized = (gainMax - gainDb) / gainRange;
  return normalized * height;
}

/**
 * Generate closed fill path for peaking/bell filter (under curve to baseline)
 */
export function generatePeakingFillPath(band: EqBand, options: AreaOptions): string {
  const {
    width,
    height,
    freqMin = 20,
    freqMax = 20000,
    gainMin = -24,
    gainMax = 24,
  } = options;

  // Sample frequencies around the peak (focus on affected region)
  const f0 = band.freq;
  const Q = band.q;
  const bandwidth = f0 / Q;
  
  // Sample 3x bandwidth on each side for smooth curve
  const sampleMin = Math.max(freqMin, f0 / 3);
  const sampleMax = Math.min(freqMax, f0 * 3);
  
  const frequencies = generateLogFrequencies(sampleMin, sampleMax, 64);
  
  // Generate curve points
  const points: Array<{ x: number; y: number }> = [];
  for (const freq of frequencies) {
    const gainDb = bandResponseDb(freq, band);
    const clampedGain = Math.max(gainMin, Math.min(gainMax, gainDb));
    
    const x = freqToX(freq, width, freqMin, freqMax);
    const y = gainToY(clampedGain, height, gainMin, gainMax);
    
    points.push({ x, y });
  }
  
  if (points.length === 0) {
    return '';
  }
  
  // Build closed path: curve → baseline → back to start
  const baselineY = gainToY(0, height, gainMin, gainMax);
  
  let path = `M ${points[0].x} ${baselineY}`;
  path += ` L ${points[0].x} ${points[0].y}`;
  
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x} ${points[i].y}`;
  }
  
  path += ` L ${points[points.length - 1].x} ${baselineY}`;
  path += ` Z`;
  
  return path;
}

/**
 * Generate shelf tint rectangle (half-plane indicator)
 */
export function generateShelfTintRect(band: EqBand, options: AreaOptions): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  const {
    width,
    height,
    freqMin = 20,
    freqMax = 20000,
  } = options;
  
  const f0 = band.freq;
  const x0 = freqToX(f0, width, freqMin, freqMax);
  
  if (band.type === 'LowShelf') {
    // Tint left side (below knee)
    return {
      x: 0,
      y: 0,
      width: x0,
      height,
    };
  } else if (band.type === 'HighShelf') {
    // Tint right side (above knee)
    return {
      x: x0,
      y: 0,
      width: width - x0,
      height,
    };
  }
  
  return null;
}

/**
 * Generate pass filter localized tint (narrow rect around cutoff)
 */
export function generatePassFilterTint(band: EqBand, options: AreaOptions): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  const {
    width,
    height,
    freqMin = 20,
    freqMax = 20000,
  } = options;
  
  if (band.type !== 'LowPass' && band.type !== 'HighPass') {
    return null;
  }
  
  const f0 = band.freq;
  const Q = band.q;
  const x0 = freqToX(f0, width, freqMin, freqMax);
  
  // Tint width based on Q (narrower for higher Q)
  const tintWidthOctaves = 1.5 / Math.sqrt(Q); // Approximate
  const fLeft = f0 / Math.pow(2, tintWidthOctaves / 2);
  const fRight = f0 * Math.pow(2, tintWidthOctaves / 2);
  
  const xLeft = freqToX(Math.max(freqMin, fLeft), width, freqMin, freqMax);
  const xRight = freqToX(Math.min(freqMax, fRight), width, freqMin, freqMax);
  
  return {
    x: xLeft,
    y: 0,
    width: xRight - xLeft,
    height,
  };
}

/**
 * Generate BandPass tint rectangle (full-height window)
 * Uses true -3 dB points with octave-symmetric fallback
 */
export function generateBandPassTintRect(band: EqBand, options: AreaOptions): {
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  const {
    width,
    height,
    freqMin = 20,
    freqMax = 20000,
    gainMin = -24,
    gainMax = 24,
  } = options;
  
  if (band.type !== 'BandPass') {
    return null;
  }
  
  const f0 = band.freq;
  const Q = band.q;
  
  // Find peak response at center frequency
  const peakDb = bandResponseDb(f0, band);
  const targetDb = peakDb - 3; // -3 dB points
  
  // Initial octave-symmetric search window (same as pass filter tint)
  const octSpan = 1.5 / Math.sqrt(Q);
  let fLeftGuess = f0 / Math.pow(2, octSpan / 2);
  let fRightGuess = f0 * Math.pow(2, octSpan / 2);
  
  // Find left -3 dB crossing (below f0)
  const fLeft = findBandPassCrossing(band, targetDb, fLeftGuess, f0, freqMin, freqMax);
  
  // Find right -3 dB crossing (above f0)
  const fRight = findBandPassCrossing(band, targetDb, f0, fRightGuess, freqMin, freqMax);
  
  // If crossings not found, fallback to octave-symmetric window
  const finalFLeft = fLeft || Math.max(freqMin, fLeftGuess);
  const finalFRight = fRight || Math.min(freqMax, fRightGuess);
  
  const xLeft = freqToX(finalFLeft, width, freqMin, freqMax);
  const xRight = freqToX(finalFRight, width, freqMin, freqMax);
  
  return {
    x: xLeft,
    y: 0,
    width: xRight - xLeft,
    height,
  };
}

/**
 * Find frequency where BandPass response crosses target dB
 * Uses bisection search within range
 */
function findBandPassCrossing(
  band: EqBand,
  targetDb: number,
  fStart: number,
  fEnd: number,
  freqMin: number,
  freqMax: number
): number | null {
  const MAX_ITERATIONS = 30;
  const TOLERANCE = 0.1; // Hz
  
  // Clamp to valid range
  const start = Math.max(freqMin, Math.min(freqMax, fStart));
  const end = Math.max(freqMin, Math.min(freqMax, fEnd));
  
  // Sample at boundaries
  const responseStart = bandResponseDb(start, band);
  const responseEnd = bandResponseDb(end, band);
  
  // Check if crossing exists (response should straddle target)
  const crossingExists =
    (responseStart > targetDb && responseEnd < targetDb) ||
    (responseStart < targetDb && responseEnd > targetDb);
  
  if (!crossingExists) {
    return null;
  }
  
  // Bisection search
  let left = start;
  let right = end;
  
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const mid = (left + right) / 2;
    const responseMid = bandResponseDb(mid, band);
    
    if (Math.abs(responseMid - targetDb) < 0.01) {
      return mid;
    }
    
    if (Math.abs(right - left) < TOLERANCE) {
      return mid;
    }
    
    // Decide which half contains the crossing
    const responseLeft = bandResponseDb(left, band);
    if ((responseLeft > targetDb) === (responseMid > targetDb)) {
      left = mid;
    } else {
      right = mid;
    }
  }
  
  return (left + right) / 2;
}

/**
 * Generate notch halo path (same as curve but with wider stroke)
 */
export function generateNotchHaloPath(band: EqBand, options: AreaOptions): string {
  // Reuse peaking fill logic but return curve only (no fill closure)
  const {
    width,
    height,
    freqMin = 20,
    freqMax = 20000,
    gainMin = -24,
    gainMax = 24,
  } = options;
  
  const f0 = band.freq;
  const sampleMin = Math.max(freqMin, f0 / 3);
  const sampleMax = Math.min(freqMax, f0 * 3);
  
  const frequencies = generateLogFrequencies(sampleMin, sampleMax, 64);
  
  const points: Array<{ x: number; y: number }> = [];
  for (const freq of frequencies) {
    const gainDb = bandResponseDb(freq, band);
    const clampedGain = Math.max(gainMin, Math.min(gainMax, gainDb));
    
    const x = freqToX(freq, width, freqMin, freqMax);
    const y = gainToY(clampedGain, height, gainMin, gainMax);
    
    points.push({ x, y });
  }
  
  if (points.length === 0) {
    return '';
  }
  
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x} ${points[i].y}`;
  }
  
  return path;
}
