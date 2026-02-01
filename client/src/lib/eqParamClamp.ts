/**
 * Shared parameter clamping and rounding utilities for EQ and Pipeline editors
 * Ensures consistent behavior across all filter editing contexts
 */

/**
 * Clamp and round frequency to nearest Hz (0 decimals)
 * Range: 20-20000 Hz
 */
export function clampFreqHz(freq: number): number {
  return Math.round(Math.max(20, Math.min(20000, freq)));
}

/**
 * Clamp and round gain to 1 decimal
 * Range: -24 to +24 dB
 */
export function clampGainDb(gain: number): number {
  return Math.round(Math.max(-24, Math.min(24, gain)) * 10) / 10;
}

/**
 * Clamp Q to range [0.1, 10] with 1 decimal precision
 */
export function clampQ(q: number): number {
  return Math.round(Math.max(0.1, Math.min(10, q)) * 10) / 10;
}
