/**
 * Canonical EQ Preset Schema (v1)
 * 
 * Internal format for EQ-only presets, designed for AutoEQ import
 * but usable by any future EQ preset source.
 * 
 * This is NOT the CamillaDSP config format - it's a higher-level
 * abstraction that gets converted to CamillaDSP at load time.
 */

export interface EqPresetV1 {
  presetType: 'eq';
  schemaVersion: 1;

  // Display name for preset list
  name: string;

  device: {
    category: 'headphones' | 'iems' | 'speakers' | 'unknown';
    manufacturer: string;
    model: string;
    variant?: string; // Optional variant (e.g., "2021", "Measurement")
  };

  // Preamp gain in dB (moved zero-line on EQ plot)
  preampDb: number;

  // EQ bands (ordered by filter index)
  bands: Array<{
    type: 'Peaking' | 'LowShelf' | 'HighShelf';
    freqHz: number;  // Rounded to nearest Hz
    gainDb: number;  // Rounded to 0.1 dB
    q: number;       // Rounded to 0.1, clamped [0.1, 10]
    enabled: boolean;
  }>;

  // Provenance metadata
  source: 'autoeq' | 'user';
  readOnly: boolean;

  // Optional source info (for AutoEQ imports)
  sourceInfo?: {
    repo: string;
    commit?: string;
    path: string;
  };
}

/**
 * Type guard to check if config is an EQ preset
 */
export function isEqPreset(config: unknown): config is EqPresetV1 {
  return (
    typeof config === 'object' &&
    config !== null &&
    'presetType' in config &&
    (config as any).presetType === 'eq'
  );
}

/**
 * Normalization utilities for deterministic preset generation
 */

export function normalizeFreqHz(freq: number): number {
  return Math.round(Math.max(20, Math.min(20000, freq)));
}

export function normalizeGainDb(gain: number): number {
  return Math.round(gain * 10) / 10;
}

export function normalizeQ(q: number): number {
  return Math.round(Math.max(0.1, Math.min(10, q)) * 10) / 10;
}

/**
 * Validation warnings (non-fatal, logged during import)
 */
export interface ValidationWarning {
  field: string;
  message: string;
  originalValue: number;
  normalizedValue: number;
}

export function validateAndNormalizeBand(
  band: { type: string; freqHz: number; gainDb: number; q: number },
  filterIndex: number
): { normalized: EqPresetV1['bands'][0]; warnings: ValidationWarning[] } {
  const warnings: ValidationWarning[] = [];

  const freqNormalized = normalizeFreqHz(band.freqHz);
  if (freqNormalized !== band.freqHz) {
    warnings.push({
      field: `Filter ${filterIndex} freq`,
      message: 'Frequency clamped to [20, 20000] Hz',
      originalValue: band.freqHz,
      normalizedValue: freqNormalized,
    });
  }

  const gainNormalized = normalizeGainDb(band.gainDb);
  if (Math.abs(gainNormalized) > 24) {
    warnings.push({
      field: `Filter ${filterIndex} gain`,
      message: 'Gain exceeds UI range (±24 dB), but allowed',
      originalValue: band.gainDb,
      normalizedValue: gainNormalized,
    });
  }

  const qNormalized = normalizeQ(band.q);
  if (qNormalized !== band.q) {
    warnings.push({
      field: `Filter ${filterIndex} Q`,
      message: 'Q clamped to [0.1, 10]',
      originalValue: band.q,
      normalizedValue: qNormalized,
    });
  }

  const normalized: EqPresetV1['bands'][0] = {
    type: band.type as 'Peaking' | 'LowShelf' | 'HighShelf',
    freqHz: freqNormalized,
    gainDb: gainNormalized,
    q: qNormalized,
    enabled: true,
  };

  return { normalized, warnings };
}
