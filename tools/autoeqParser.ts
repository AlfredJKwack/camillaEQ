/**
 * AutoEQ ParametricEQ.txt parser
 * 
 * Strict parser for AutoEQ ParametricEQ.txt format with deterministic error handling.
 */

import type { EqPresetV1, ValidationWarning } from '../shared/eqPresetSchema.js';
import { validateAndNormalizeBand, normalizeGainDb } from '../shared/eqPresetSchema.js';

export interface ParseResult {
  preset: EqPresetV1;
  warnings: ValidationWarning[];
}

export class ParseError extends Error {
  constructor(
    message: string,
    public line: number,
    public lineContent: string
  ) {
    super(`${message} (line ${line}: "${lineContent}")`);
    this.name = 'ParseError';
  }
}

/**
 * Parse AutoEQ ParametricEQ.txt file content
 * 
 * Format:
 * Preamp: -6.8 dB
 * Filter 1: ON PK Fc 105 Hz Gain 4.6 dB Q 0.69
 * Filter 2: ON LSC Fc 105 Hz Gain 5.8 dB Q 0.7
 * Filter 3: OFF ...
 * ...
 */
export function parseParametricEQ(
  content: string,
  deviceName: string,
  category: 'headphones' | 'iems' | 'speakers' | 'unknown',
  manufacturer: string,
  model: string,
  variant: string | undefined,
  sourcePath: string
): ParseResult {
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  
  let preampDb = 0;
  const bands: EqPresetV1['bands'] = [];
  const allWarnings: ValidationWarning[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Parse preamp line
    if (line.startsWith('Preamp:')) {
      const match = line.match(/^Preamp:\s*([-+]?\d+(?:\.\d+)?)\s*dB$/i);
      if (!match) {
        throw new ParseError('Malformed Preamp line', lineNum, line);
      }
      preampDb = normalizeGainDb(parseFloat(match[1]));
      continue;
    }

    // Parse filter line
    if (line.startsWith('Filter')) {
      const filterMatch = line.match(/^Filter\s+(\d+):\s*(ON|OFF)\s+(.+)$/i);
      if (!filterMatch) {
        throw new ParseError('Malformed Filter line', lineNum, line);
      }

      const filterIndex = parseInt(filterMatch[1], 10);
      const enabled = filterMatch[2].toUpperCase() === 'ON';
      const params = filterMatch[3];

      // Skip disabled filters (AutoEQ convention)
      if (!enabled) {
        continue;
      }

      // Parse filter parameters
      const band = parseFilterParams(params, filterIndex, lineNum, line);
      const { normalized, warnings } = validateAndNormalizeBand(band, filterIndex);
      
      bands.push(normalized);
      allWarnings.push(...warnings);
      continue;
    }

    // Ignore other lines (comments, empty lines)
  }

  // Build preset
  const preset: EqPresetV1 = {
    presetType: 'eq',
    schemaVersion: 1,
    name: deviceName,
    device: {
      category,
      manufacturer,
      model,
      variant,
    },
    preampDb,
    bands,
    source: 'autoeq',
    readOnly: true,
    sourceInfo: {
      repo: 'https://github.com/jaakkopasanen/AutoEq',
      path: sourcePath,
    },
  };

  return { preset, warnings: allWarnings };
}

/**
 * Parse filter parameters from AutoEQ format
 * 
 * Supported types:
 * - PK (Peaking)
 * - LSC (Low Shelf)
 * - HSC (High Shelf)
 * 
 * Format: <TYPE> Fc <freq> Hz Gain <gain> dB Q <q>
 */
function parseFilterParams(
  params: string,
  filterIndex: number,
  lineNum: number,
  line: string
): { type: string; freqHz: number; gainDb: number; q: number } {
  // Match: PK Fc 105 Hz Gain 4.6 dB Q 0.69
  const match = params.match(
    /^(PK|LSC|HSC)\s+Fc\s+([\d.]+)\s*Hz\s+Gain\s+([-+]?[\d.]+)\s*dB\s+Q\s+([\d.]+)$/i
  );

  if (!match) {
    throw new ParseError(`Unsupported or malformed filter parameters`, lineNum, line);
  }

  const typeCode = match[1].toUpperCase();
  const freq = parseFloat(match[2]);
  const gain = parseFloat(match[3]);
  const q = parseFloat(match[4]);

  // Validate numeric values
  if (isNaN(freq) || isNaN(gain) || isNaN(q)) {
    throw new ParseError(`Invalid numeric values in filter parameters`, lineNum, line);
  }

  // Map AutoEQ type codes to EQ preset types
  let type: string;
  switch (typeCode) {
    case 'PK':
      type = 'Peaking';
      break;
    case 'LSC':
      type = 'LowShelf';
      break;
    case 'HSC':
      type = 'HighShelf';
      break;
    default:
      throw new ParseError(`Unknown filter type: ${typeCode}`, lineNum, line);
  }

  return { type, freqHz: freq, gainDb: gain, q };
}
