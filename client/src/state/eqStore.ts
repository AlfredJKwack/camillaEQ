/**
 * EQ band state management
 * Single source of truth for all band parameters
 */

import { writable, derived } from 'svelte/store';
import type { EqBand } from '../dsp/filterResponse';
import { generateCurvePath, generateBandCurvePath } from '../ui/rendering/EqSvgRenderer';

// Initial state: Tangzu Waner reference config (10 peaking filters)
const initialBands: EqBand[] = [
  { enabled: true, type: 'Peaking', freq: 24, gain: 1.2, q: 0.5 },
  { enabled: true, type: 'Peaking', freq: 170, gain: -2.9, q: 0.5 },
  { enabled: true, type: 'Peaking', freq: 880, gain: 1.0, q: 1.0 },
  { enabled: true, type: 'Peaking', freq: 1400, gain: -1.5, q: 2.0 },
  { enabled: true, type: 'Peaking', freq: 2000, gain: -2.8, q: 1.5 },
  { enabled: true, type: 'Peaking', freq: 5200, gain: -1.8, q: 2.0 },
  { enabled: true, type: 'Peaking', freq: 6500, gain: 5.4, q: 0.6 },
  { enabled: true, type: 'Peaking', freq: 6600, gain: 4.1, q: 2.0 },
  { enabled: true, type: 'Peaking', freq: 8200, gain: -8.1, q: 2.0 },
  { enabled: true, type: 'Peaking', freq: 10000, gain: 7.6, q: 2.0 },
];

// Main store
export const bands = writable<EqBand[]>(initialBands);

// Selected band index (null = none selected)
export const selectedBandIndex = writable<number | null>(null);

// Actions (mutations with proper clamping/rounding)

/**
 * Clamp and round frequency to nearest Hz (0 decimals)
 */
function clampFreq(freq: number): number {
  return Math.round(Math.max(20, Math.min(20000, freq)));
}

/**
 * Clamp and round gain to 1 decimal
 */
function clampGain(gain: number): number {
  return Math.round(Math.max(-24, Math.min(24, gain)) * 10) / 10;
}

/**
 * Clamp Q to range [0.1, 10] with 1 decimal precision
 */
function clampQ(q: number): number {
  return Math.round(Math.max(0.1, Math.min(10, q)) * 10) / 10;
}

export function setBandFreq(index: number, freq: number) {
  bands.update((b) => {
    const updated = [...b];
    updated[index] = { ...updated[index], freq: clampFreq(freq) };
    return updated;
  });
}

export function setBandGain(index: number, gain: number) {
  bands.update((b) => {
    const updated = [...b];
    updated[index] = { ...updated[index], gain: clampGain(gain) };
    return updated;
  });
}

export function setBandQ(index: number, q: number) {
  bands.update((b) => {
    const updated = [...b];
    updated[index] = { ...updated[index], q: clampQ(q) };
    return updated;
  });
}

export function toggleBandEnabled(index: number) {
  bands.update((b) => {
    const updated = [...b];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    return updated;
  });
}

export function selectBand(index: number | null) {
  selectedBandIndex.set(index);
}

// Derived stores for curves (reactive to bands changes)
export const sumCurvePath = derived(bands, ($bands) => {
  return generateCurvePath($bands, {
    width: 1000,
    height: 400,
    numPoints: 256,
  });
});

export const perBandCurvePaths = derived(bands, ($bands) => {
  return $bands.map((band) =>
    generateBandCurvePath(band, {
      width: 1000,
      height: 400,
      numPoints: 128,
    })
  );
});
