/**
 * EQ Plot Math Utilities
 * Shared coordinate mapping, tick generation, and formatting for the EQ plot
 */

// ===== COORDINATE MAPPING =====

/**
 * Map frequency to X coordinate (base-10 logarithmic)
 * @param freq - Frequency in Hz (20-20000)
 * @param width - Plot width in viewBox units (typically 1000)
 */
export function freqToX(freq: number, width: number): number {
  const fMin = 20;
  const fMax = 20000;
  const xNorm = (Math.log10(freq) - Math.log10(fMin)) / (Math.log10(fMax) - Math.log10(fMin));
  return xNorm * width;
}

/**
 * Map X coordinate to frequency (inverse of freqToX)
 */
export function xToFreq(x: number, width: number): number {
  const fMin = 20;
  const fMax = 20000;
  const xNorm = x / width;
  const logFreq = xNorm * (Math.log10(fMax) - Math.log10(fMin)) + Math.log10(fMin);
  return Math.pow(10, logFreq);
}

/**
 * Map gain to Y coordinate (linear, inverted for SVG)
 * @param gain - Gain in dB (-24 to +24)
 */
export function gainToY(gain: number): number {
  const gainRange = 48; // -24 to +24
  return 200 - (gain / gainRange) * 400;
}

/**
 * Map Y coordinate to gain (inverse of gainToY)
 */
export function yToGain(y: number): number {
  const gainRange = 48;
  return (200 - y) / 400 * gainRange;
}

/**
 * Calculate Y position for gain labels as percentage
 */
export function gainToYPercent(gain: number): number {
  return (1 - (gain + 24) / 48) * 100;
}

// ===== TICK GENERATION =====

/**
 * Generate decade-based frequency ticks per spec
 * For each decade 10^n, draw lines at k * 10^n for k ∈ {2,3,4,5,6,7,8,9}
 * Treat k ∈ {2,5,10} as "major", others as "minor"
 */
export function generateFrequencyTicks(): { majors: number[]; minors: number[] } {
  const majors: number[] = [];
  const minors: number[] = [];
  
  // For each decade 10^n, draw lines at k * 10^n for k ∈ {2,3,4,5,6,7,8,9}
  // Treat k ∈ {2,5,10} as "major", others as "minor"
  for (let exp = 1; exp <= 4; exp++) {
    const decade = Math.pow(10, exp);
    for (let k = 1; k <= 9; k++) {
      const freq = k * decade;
      if (freq >= 20 && freq <= 20000) {
        if (k === 1 || k === 2 || k === 5) {
          majors.push(freq);
        } else {
          minors.push(freq);
        }
      }
    }
  }
  // Add 20 as starting major
  if (!majors.includes(20)) majors.unshift(20);
  
  return { majors, minors };
}

/**
 * Format frequency for display
 */
export function formatFreq(freq: number): string {
  if (freq >= 1000) {
    const k = freq / 1000;
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return `${freq}`;
}

// ===== OCTAVE/REGION WIDTHS =====

/**
 * Calculate octave column widths (musical C starting frequencies)
 * Pre-C1 spacer (20→32.70), C1...C9, Post-C9 spacer (8372.02→20000)
 */
export function calcOctaveWidths(): number[] {
  const octaveFreqs = [32.70, 65.41, 130.81, 261.63, 523.25, 1046.50, 2093.00, 4186.01, 8372.02];
  const widths: number[] = [];
  widths.push(Math.log10(octaveFreqs[0]) - Math.log10(20)); // pre-spacer
  for (let i = 0; i < octaveFreqs.length; i++) {
    const end = i < octaveFreqs.length - 1 ? octaveFreqs[i + 1] : octaveFreqs[i] * 2;
    widths.push(Math.log10(end) - Math.log10(octaveFreqs[i]));
  }
  widths.push(Math.log10(20000) - Math.log10(octaveFreqs[octaveFreqs.length - 1] * 2)); // post-spacer
  return widths;
}

/**
 * Calculate region column widths (explicit frequency boundaries)
 */
export function calcRegionWidths(): number[] {
  const regionBoundaries = [20, 60, 250, 500, 2000, 4000, 6000, 20000];
  const widths: number[] = [];
  for (let i = 0; i < regionBoundaries.length - 1; i++) {
    widths.push(Math.log10(regionBoundaries[i + 1]) - Math.log10(regionBoundaries[i]));
  }
  return widths;
}
