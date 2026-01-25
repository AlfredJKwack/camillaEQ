/**
 * Filter frequency response calculations
 * Based on RBJ Audio EQ Cookbook formulas for biquad filters
 */

export interface EqBand {
  enabled: boolean;
  type: 'Peaking' | 'LowShelf' | 'HighShelf' | 'LowPass' | 'HighPass' | 'BandPass' | 'AllPass';
  freq: number;  // Hz
  gain: number;  // dB
  q: number;
}

const SAMPLE_RATE = 48000;

/**
 * Calculate biquad filter magnitude response
 * Common helper for computing |H(w)| from biquad coefficients
 */
function biquadMagnitudeDb(
  freqHz: number,
  b0: number,
  b1: number,
  b2: number,
  a0: number,
  a1: number,
  a2: number
): number {
  const w = (2 * Math.PI * freqHz) / SAMPLE_RATE;

  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const cos2W = Math.cos(2 * w);
  const sin2W = Math.sin(2 * w);

  // Numerator: b0 + b1*e^(-jw) + b2*e^(-j2w)
  const numReal = b0 + b1 * cosW + b2 * cos2W;
  const numImag = -b1 * sinW - b2 * sin2W;

  // Denominator: a0 + a1*e^(-jw) + a2*e^(-j2w)
  const denReal = a0 + a1 * cosW + a2 * cos2W;
  const denImag = -a1 * sinW - a2 * sin2W;

  // Magnitude |H(w)| = |num| / |den|
  const numMag = Math.sqrt(numReal * numReal + numImag * numImag);
  const denMag = Math.sqrt(denReal * denReal + denImag * denImag);

  const magnitude = numMag / denMag;

  // Convert to dB
  return 20 * Math.log10(magnitude);
}

/**
 * Calculate filter response at a given frequency
 * Uses RBJ Audio EQ Cookbook formulas for all biquad filter types
 */
export function bandResponseDb(freqHz: number, band: EqBand): number {
  if (!band.enabled) {
    return 0;
  }

  const f0 = band.freq;
  const Q = band.q;
  const w0 = (2 * Math.PI * f0) / SAMPLE_RATE;
  const alpha = Math.sin(w0) / (2 * Q);

  let b0: number, b1: number, b2: number;
  let a0: number, a1: number, a2: number;

  switch (band.type) {
    case 'Peaking': {
      const A = Math.pow(10, band.gain / 40); // sqrt of linear gain
      b0 = 1 + alpha * A;
      b1 = -2 * Math.cos(w0);
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * Math.cos(w0);
      a2 = 1 - alpha / A;
      break;
    }

    case 'LowShelf': {
      const A = Math.pow(10, band.gain / 40);
      const cosW0 = Math.cos(w0);
      const sqrtA = Math.sqrt(A);
      b0 = A * ((A + 1) - (A - 1) * cosW0 + 2 * sqrtA * alpha);
      b1 = 2 * A * ((A - 1) - (A + 1) * cosW0);
      b2 = A * ((A + 1) - (A - 1) * cosW0 - 2 * sqrtA * alpha);
      a0 = (A + 1) + (A - 1) * cosW0 + 2 * sqrtA * alpha;
      a1 = -2 * ((A - 1) + (A + 1) * cosW0);
      a2 = (A + 1) + (A - 1) * cosW0 - 2 * sqrtA * alpha;
      break;
    }

    case 'HighShelf': {
      const A = Math.pow(10, band.gain / 40);
      const cosW0 = Math.cos(w0);
      const sqrtA = Math.sqrt(A);
      b0 = A * ((A + 1) + (A - 1) * cosW0 + 2 * sqrtA * alpha);
      b1 = -2 * A * ((A - 1) + (A + 1) * cosW0);
      b2 = A * ((A + 1) + (A - 1) * cosW0 - 2 * sqrtA * alpha);
      a0 = (A + 1) - (A - 1) * cosW0 + 2 * sqrtA * alpha;
      a1 = 2 * ((A - 1) - (A + 1) * cosW0);
      a2 = (A + 1) - (A - 1) * cosW0 - 2 * sqrtA * alpha;
      break;
    }

    case 'LowPass': {
      const cosW0 = Math.cos(w0);
      b0 = (1 - cosW0) / 2;
      b1 = 1 - cosW0;
      b2 = (1 - cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    }

    case 'HighPass': {
      const cosW0 = Math.cos(w0);
      b0 = (1 + cosW0) / 2;
      b1 = -(1 + cosW0);
      b2 = (1 + cosW0) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    }

    case 'BandPass': {
      const cosW0 = Math.cos(w0);
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    }

    case 'AllPass': {
      const cosW0 = Math.cos(w0);
      b0 = 1 - alpha;
      b1 = -2 * cosW0;
      b2 = 1 + alpha;
      a0 = 1 + alpha;
      a1 = -2 * cosW0;
      a2 = 1 - alpha;
      break;
    }

    default:
      return 0;
  }

  return biquadMagnitudeDb(freqHz, b0, b1, b2, a0, a1, a2);
}

/**
 * Calculate peaking filter response at a given frequency
 * @deprecated Use bandResponseDb instead
 */
export function peakingResponseDb(freqHz: number, band: EqBand): number {
  return bandResponseDb(freqHz, band);
}

/**
 * Calculate combined response of all bands at a given frequency
 * Note: This represents the filter bank response only, excluding preamp/output gain
 */
export function sumResponseDb(freqHz: number, bands: EqBand[]): number {
  let sumDb = 0;

  for (const band of bands) {
    if (band.enabled) {
      sumDb += bandResponseDb(freqHz, band);
    }
  }

  return sumDb;
}

/**
 * Generate log-spaced frequency array for sampling
 */
export function generateLogFrequencies(fMin: number, fMax: number, numPoints: number): number[] {
  const logMin = Math.log10(fMin);
  const logMax = Math.log10(fMax);
  const step = (logMax - logMin) / (numPoints - 1);

  const frequencies: number[] = [];
  for (let i = 0; i < numPoints; i++) {
    frequencies.push(Math.pow(10, logMin + i * step));
  }

  return frequencies;
}
