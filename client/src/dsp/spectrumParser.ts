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
 * 
 * For our spectrum pipeline, GetPlaybackSignalPeak returns one value per channel.
 * Since playback channels ARE the spectrum bins, we accept the array as-is.
 */
export function parseSpectrumData(value: unknown): SpectrumData | null {
  if (!Array.isArray(value)) {
    return null;
  }

  // Require at least 3 values (reject legacy 2-channel format)
  if (value.length < 3) {
    return null;
  }

  // Validate all entries are numbers
  if (!value.every(v => typeof v === 'number' && !isNaN(v))) {
    return null;
  }
  
  return { binsDb: value as number[] };
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
