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
 * - number[] (bins) - real spectrum data
 * - number[] (2 values) - legacy per-channel peaks → expand to fake spectrum
 */
export function parseSpectrumData(value: unknown): SpectrumData | null {
  if (!Array.isArray(value)) {
    return null;
  }

  // Case 1: Real spectrum bins (length > 2)
  if (value.length > 2) {
    return {
      bins: normalizeBins(value),
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
 * Normalize bin values to [0..1] range
 * Assumes input is in linear amplitude [0..1] or dB scale
 */
function normalizeBins(bins: number[]): number[] {
  // Find max value to normalize
  const max = Math.max(...bins, 0.001); // Avoid division by zero
  
  return bins.map((value) => {
    // Clamp to [0..1]
    const normalized = Math.max(0, Math.min(1, value / max));
    return normalized;
  });
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
