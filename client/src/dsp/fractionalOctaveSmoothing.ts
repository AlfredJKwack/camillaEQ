/**
 * Fractional-Octave Smoothing - MVP-16
 * Applies frequency-domain smoothing to reduce comb artifacts
 * Operates on log-spaced spectrum bins (as assumed from spectrum config)
 */

export type SmoothingMode = 'off' | '1/12' | '1/6' | '1/3';

/**
 * Apply fractional-octave smoothing to dB spectrum bins
 * @param binsDb - Input spectrum in dB domain
 * @param mode - Smoothing mode (off | 1/12 | 1/6 | 1/3)
 * @returns Smoothed spectrum in dB domain
 */
export function smoothDbBins(binsDb: number[], mode: SmoothingMode): number[] {
  if (mode === 'off' || binsDb.length === 0) {
    return binsDb;
  }

  // Determine kernel window size based on fraction
  // Smaller fraction = narrower bandwidth = smaller window
  const windowSize = getWindowSize(mode);

  // Convert dB to power for averaging
  const power = binsDb.map(db => Math.pow(10, db / 10));

  // Apply triangular kernel smoothing
  const smoothedPower: number[] = [];
  
  for (let i = 0; i < binsDb.length; i++) {
    let sumWeighted = 0;
    let sumWeights = 0;

    // Triangular window centered at i
    for (let j = -windowSize; j <= windowSize; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < binsDb.length) {
        // Triangular weight: 1 at center, 0 at edges
        const weight = 1 - Math.abs(j) / (windowSize + 1);
        sumWeighted += power[idx] * weight;
        sumWeights += weight;
      }
    }

    smoothedPower.push(sumWeighted / sumWeights);
  }

  // Convert power back to dB
  return smoothedPower.map(p => 10 * Math.log10(Math.max(p, 1e-10))); // Avoid log(0)
}

/**
 * Get kernel window size (half-width) for smoothing mode
 * Window sizes chosen to approximate fractional-octave bandwidth
 * on log-spaced frequency bins
 */
function getWindowSize(mode: SmoothingMode): number {
  switch (mode) {
    case '1/12': return 2;  // ~1/12 octave (~6% bandwidth)
    case '1/6':  return 4;  // ~1/6 octave (~12% bandwidth)
    case '1/3':  return 8;  // ~1/3 octave (~23% bandwidth)
    default:     return 0;
  }
}
