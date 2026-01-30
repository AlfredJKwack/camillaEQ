/**
 * Spectrum data parser - MVP-16 (strict dB-domain)
 * Parses CamillaDSP spectrum data in dBFS format
 */

export interface SpectrumData {
  binsDb: number[]; // Spectrum data in dB domain (dBFS: 0 dB = full scale)
}

/**
 * Parse spectrum data from WebSocket response
 * Expects CamillaDSP spectrum in dBFS (negative values, 0 dB max)
 * Handles stereo-interleaved downmixing if detected
 */
export function parseSpectrumData(value: unknown): SpectrumData | null {
  if (!Array.isArray(value)) {
    return null;
  }

  // Require at least 3 values (reject legacy 2-channel format)
  if (value.length < 3) {
    return null;
  }

  let binsDb = value;
  
  // Check if data is stereo-interleaved (pairs of identical/similar values)
  if (binsDb.length % 2 === 0 && binsDb.length >= 4) {
    const pairsSimilar = checkIfStereoInterleaved(binsDb);
    if (pairsSimilar) {
      // Downmix by taking max of each pair
      binsDb = downmixStereoPairs(binsDb);
    }
  }
  
  return { binsDb };
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
 * Convert dB to normalized [0..1] for rendering
 * @param db - Value in dBFS
 * @param minDb - Floor (default -100 dBFS)
 * @param maxDb - Ceiling (default 0 dBFS)
 */
export function dbToNormalized(db: number, minDb: number = -100, maxDb: number = 0): number {
  const clamped = Math.max(minDb, Math.min(maxDb, db));
  const normalized = (clamped - minDb) / (maxDb - minDb);
  return normalized;
}

/**
 * Convert array of dB values to normalized [0..1] for rendering
 */
export function dbArrayToNormalized(binsDb: number[], minDb: number = -100, maxDb: number = 0): number[] {
  return binsDb.map(db => dbToNormalized(db, minDb, maxDb));
}
