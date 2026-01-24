/**
 * Filter frequency response calculations
 * Based on RBJ Audio EQ Cookbook formulas for biquad filters
 */

export interface EqBand {
  enabled: boolean;
  type: 'Peaking' | 'LowShelf' | 'HighShelf' | 'LowPass' | 'HighPass';
  freq: number;  // Hz
  gain: number;  // dB
  q: number;
}

/**
 * Calculate peaking filter response at a given frequency
 * Uses RBJ Audio EQ Cookbook peaking/bell filter formula
 */
export function peakingResponseDb(freqHz: number, band: EqBand): number {
  if (!band.enabled || band.type !== 'Peaking') {
    return 0;
  }

  const f0 = band.freq;
  const gainDb = band.gain;
  const Q = band.q;

  // Convert gain from dB to linear
  const A = Math.pow(10, gainDb / 40); // sqrt of linear gain

  // Normalized frequency
  const w0 = (2 * Math.PI * f0) / 48000; // Assuming 48kHz sample rate
  const w = (2 * Math.PI * freqHz) / 48000;

  const alpha = Math.sin(w0) / (2 * Q);

  // Biquad coefficients for peaking filter
  const b0 = 1 + alpha * A;
  const b1 = -2 * Math.cos(w0);
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * Math.cos(w0);
  const a2 = 1 - alpha / A;

  // Frequency response H(w) = (b0 + b1*e^(-jw) + b2*e^(-j2w)) / (a0 + a1*e^(-jw) + a2*e^(-j2w))
  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const cos2W = Math.cos(2 * w);
  const sin2W = Math.sin(2 * w);

  // Numerator: b0 + b1*cos(w) - b1*j*sin(w) + b2*cos(2w) - b2*j*sin(2w)
  const numReal = b0 + b1 * cosW + b2 * cos2W;
  const numImag = -b1 * sinW - b2 * sin2W;

  // Denominator: a0 + a1*cos(w) - a1*j*sin(w) + a2*cos(2w) - a2*j*sin(2w)
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
 * Calculate combined response of all bands at a given frequency
 * Note: This represents the filter bank response only, excluding preamp/output gain
 */
export function sumResponseDb(freqHz: number, bands: EqBand[]): number {
  let sumDb = 0;

  for (const band of bands) {
    if (band.enabled) {
      sumDb += peakingResponseDb(freqHz, band);
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
