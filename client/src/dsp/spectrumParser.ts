/**
 * Spectrum data parser
 * Normalizes various spectrum data formats to consistent bin array
 */

export interface SpectrumData {
  bins: number[]; // Normalized [0..1] magnitude values
}

/**
 * Parse spectrum data from WebSocket response
 * Handles multiple formats:
 * - number[] (bins) - real spectrum data (linear or dB)
 * - number[] (2 values) - legacy per-channel peaks → expand to fake spectrum
 * - Stereo-interleaved pairs (even-length arrays with duplicated values)
 */
export function parseSpectrumData(value: unknown): SpectrumData | null {
  if (!Array.isArray(value)) {
    return null;
  }

  // Case 1: Real spectrum bins (length > 2)
  if (value.length > 2) {
    let bins = value;
    
    // Check if data is stereo-interleaved (pairs of identical/similar values)
    if (bins.length % 2 === 0 && bins.length >= 4) {
      const pairsSimilar = checkIfStereoInterleaved(bins);
      if (pairsSimilar) {
        // Downmix by taking max of each pair
        bins = downmixStereoPairs(bins);
      }
    }
    
    return {
      bins: normalizeBins(bins),
    };
  }

  // Case 2: Legacy per-channel peaks (length === 2)
  // Expand to simple "fake spectrum" for backward compatibility
  if (value.length === 2) {
    const [ch0, ch1] = value;
    const avgPeak = (ch0 + ch1) / 2;
    
    // Generate 128 bins with a simple envelope around the average peak
    const bins: number[] = [];
    for (let i = 0; i < 128; i++) {
      // Create a simple bump curve
      const t = i / 128;
      const envelope = Math.sin(t * Math.PI); // Bell curve
      bins.push(avgPeak * envelope);
    }
    
    return {
      bins: normalizeBins(bins),
    };
  }

  // Case 3: Empty or invalid
  return null;
}

/**
 * Check if array appears to be stereo-interleaved
 * (many adjacent pairs have identical or very similar values)
 */
function checkIfStereoInterleaved(bins: number[]): boolean {
  if (bins.length < 4 || bins.length % 2 !== 0) return false;
  
  let identicalPairs = 0;
  const pairCount = bins.length / 2;
  
  for (let i = 0; i < bins.length; i += 2) {
    // Check if pair values are identical or very close (within 0.1 dB)
    if (Math.abs(bins[i] - bins[i + 1]) < 0.1) {
      identicalPairs++;
    }
  }
  
  // If >80% of pairs are identical/similar, assume stereo-interleaved
  return (identicalPairs / pairCount) > 0.8;
}

/**
 * Downmix stereo-interleaved pairs by taking max of each pair
 */
function downmixStereoPairs(bins: number[]): number[] {
  const downmixed: number[] = [];
  for (let i = 0; i < bins.length; i += 2) {
    downmixed.push(Math.max(bins[i], bins[i + 1]));
  }
  return downmixed;
}

/**
 * Normalize bin values to [0..1] range
 * Handles both linear [0..1] and dB-like (negative) values
 */
function normalizeBins(bins: number[]): number[] {
  if (bins.length === 0) return [];
  
  const max = Math.max(...bins);
  const min = Math.min(...bins);
  
  // Detect if data is in dB scale (mostly negative values)
  const isDbScale = max <= 0 && min < -1;
  
  if (isDbScale) {
    // Convert dBFS to linear [0..1]
    // Use fixed window: -100 dB (silent) to 0 dB (full scale)
    const minDb = -100;
    const maxDb = 0;
    
    return bins.map((db) => {
      const clamped = Math.max(minDb, Math.min(maxDb, db));
      const normalized = (clamped - minDb) / (maxDb - minDb);
      return normalized;
    });
  } else {
    // Linear normalization for [0..1] range values
    const maxVal = Math.max(max, 0.001); // Avoid division by zero
    
    return bins.map((value) => {
      const normalized = Math.max(0, Math.min(1, value / maxVal));
      return normalized;
    });
  }
}

/**
 * Convert dB to linear amplitude [0..1]
 * Useful if spectrum data comes in dB scale
 */
export function dbToLinear(db: number, minDb: number = -60, maxDb: number = 0): number {
  const clamped = Math.max(minDb, Math.min(maxDb, db));
  const normalized = (clamped - minDb) / (maxDb - minDb);
  return normalized;
}

/**
 * Decimate bins to target count (for performance)
 * Uses simple averaging within each bin group
 */
export function decimateBins(bins: number[], targetCount: number): number[] {
  if (bins.length <= targetCount) {
    return bins;
  }

  const decimated: number[] = [];
  const binSize = bins.length / targetCount;

  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor(i * binSize);
    const end = Math.floor((i + 1) * binSize);
    const slice = bins.slice(start, end);
    const avg = slice.reduce((sum, val) => sum + val, 0) / slice.length;
    decimated.push(avg);
  }

  return decimated;
}
