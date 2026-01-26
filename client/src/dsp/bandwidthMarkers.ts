/**
 * Bandwidth marker calculation for MVP-14
 * Computes -3 dB half-power frequencies for selected band
 */

import type { EqBand } from './filterResponse';
import { bandResponseDb } from './filterResponse';

export interface BandwidthMarkers {
  leftFreq: number | null;  // Hz
  rightFreq: number | null; // Hz
}

/**
 * Calculate -3 dB bandwidth markers for a band
 * Returns frequencies where band response crosses -3 dB from peak
 * 
 * Only applicable for:
 * - Peaking (has two -3 dB points around peak)
 * - Notch (has two -3 dB points around notch)
 * 
 * Returns null for unsupported types (shelves, HP/LP, BP, AllPass)
 */
export function calculateBandwidthMarkers(band: EqBand): BandwidthMarkers {
  // Only support Peaking and Notch
  if (band.type !== 'Peaking' && band.type !== 'Notch') {
    return { leftFreq: null, rightFreq: null };
  }

  const f0 = band.freq;
  const Q = band.q;

  // For peaking: target is peak gain - 3 dB
  // For notch: target is -3 dB (notch depth is negative, so -3 dB from 0)
  const peakGain = band.type === 'Peaking' ? band.gain : 0;
  const targetDb = peakGain - 3;

  // Search range: Q determines bandwidth, search wider for safety
  // Approximate bandwidth = f0 / Q
  const approxBandwidth = f0 / Q;
  const searchSpan = approxBandwidth * 3; // 3x for safety

  const fMin = Math.max(20, f0 - searchSpan);
  const fMax = Math.min(20000, f0 + searchSpan);

  // Find left crossing (below f0)
  const leftFreq = findCrossing(band, targetDb, fMin, f0);

  // Find right crossing (above f0)
  const rightFreq = findCrossing(band, targetDb, f0, fMax);

  return { leftFreq, rightFreq };
}

/**
 * Find frequency where band response crosses target dB in given range
 * Uses bisection search for accuracy
 */
function findCrossing(
  band: EqBand,
  targetDb: number,
  fStart: number,
  fEnd: number
): number | null {
  const MAX_ITERATIONS = 30;
  const TOLERANCE = 0.1; // Hz

  // Sample at start and end
  const responseStart = bandResponseDb(fStart, band);
  const responseEnd = bandResponseDb(fEnd, band);

  // Check if crossing exists in range
  // For peaking: response should straddle target (one above, one below)
  // For notch: similar logic
  const crossingExists =
    (responseStart > targetDb && responseEnd < targetDb) ||
    (responseStart < targetDb && responseEnd > targetDb);

  if (!crossingExists) {
    return null;
  }

  // Bisection search
  let left = fStart;
  let right = fEnd;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const mid = (left + right) / 2;
    const responseMid = bandResponseDb(mid, band);

    if (Math.abs(responseMid - targetDb) < 0.01) {
      // Close enough to target
      return mid;
    }

    if (Math.abs(right - left) < TOLERANCE) {
      // Converged
      return mid;
    }

    // Decide which half to search
    const responseLeft = bandResponseDb(left, band);
    if ((responseLeft > targetDb) === (responseMid > targetDb)) {
      // Same sign, crossing is in right half
      left = mid;
    } else {
      // Crossing is in left half
      right = mid;
    }
  }

  return (left + right) / 2;
}
