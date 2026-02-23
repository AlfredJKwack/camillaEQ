import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  disableFilterEverywhere,
  enableFilterEverywhere,
  isFilterEnabledEverywhere,
} from '../filterEnablement';
import type { CamillaDSPConfig } from '../camillaDSP';
import {
  loadDisabledFilters,
  clearDisabledFilters,
} from '../disabledFiltersOverlay';

describe('filterEnablement', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    clearDisabledFilters();
  });

  afterEach(() => {
    clearDisabledFilters();
  });

  const createMockConfig = (): CamillaDSPConfig => ({
    devices: {
      samplerate: 48000,
      chunksize: 1024,
      capture: { type: 'Alsa', channels: 2, device: 'hw:1', format: 'S24LE3' },
      playback: { type: 'Alsa', channels: 2, device: 'hw:0', format: 'S24LE3' },
    },
    filters: {
      band1: {
        type: 'Biquad',
        parameters: { type: 'Peaking', freq: 100, q: 1.0, gain: 3 },
      },
      band2: {
        type: 'Biquad',
        parameters: { type: 'Peaking', freq: 1000, q: 1.0, gain: -2 },
      },
      band3: {
        type: 'Biquad',
        parameters: { type: 'Highshelf', freq: 5000, q: 0.7, gain: 5 },
      },
    },
    mixers: {},
    pipeline: [
      { type: 'Filter', channels: [0], names: ['band1', 'band2', 'band3'] },
      { type: 'Filter', channels: [1], names: ['band1', 'band2', 'band3'] },
    ],
  });

  describe('disableFilterEverywhere', () => {
    it('removes filter from all Filter steps', () => {
      const config = createMockConfig();
      const updated = disableFilterEverywhere(config, 'band2');

      // Check both channels
      expect((updated.pipeline[0] as any).names).toEqual(['band1', 'band3']);
      expect((updated.pipeline[1] as any).names).toEqual(['band1', 'band3']);
    });

    it('records disabled locations in overlay', () => {
      const config = createMockConfig();
      disableFilterEverywhere(config, 'band2');

      const state = loadDisabledFilters();
      expect(state.disabled.band2).toBeDefined();
      expect(state.disabled.band2.length).toBe(2); // Two steps (ch0 and ch1)
    });

    it('preserves original index in overlay', () => {
      const config = createMockConfig();
      disableFilterEverywhere(config, 'band2');

      const state = loadDisabledFilters();
      // band2 was at index 1 (0: band1, 1: band2, 2: band3)
      expect(state.disabled.band2[0].index).toBe(1);
      expect(state.disabled.band2[1].index).toBe(1);
    });

    it('handles already-disabled filters correctly', () => {
      const config = createMockConfig();
      
      // Disable band1 first
      const step1 = disableFilterEverywhere(config, 'band1');
      // Now disable band3 (should remember that band1 was at index 0)
      const step2 = disableFilterEverywhere(step1, 'band3');

      const state = loadDisabledFilters();
      
      // band1 was at index 0
      expect(state.disabled.band1[0].index).toBe(0);
      // band3 was originally at index 2 (even though it's now at index 1 in the compressed array)
      expect(state.disabled.band3[0].index).toBe(2);
    });

    it('does not affect other filters', () => {
      const config = createMockConfig();
      const updated = disableFilterEverywhere(config, 'band2');

      // band1 and band3 should still be present
      expect((updated.pipeline[0] as any).names).toContain('band1');
      expect((updated.pipeline[0] as any).names).toContain('band3');
      expect((updated.pipeline[1] as any).names).toContain('band1');
      expect((updated.pipeline[1] as any).names).toContain('band3');
    });
  });

  describe('enableFilterEverywhere', () => {
    it('restores filter to all original locations', () => {
      const config = createMockConfig();
      
      // Disable then re-enable
      const disabled = disableFilterEverywhere(config, 'band2');
      const enabled = enableFilterEverywhere(disabled, 'band2');

      // Should be back in both steps
      expect((enabled.pipeline[0] as any).names).toContain('band2');
      expect((enabled.pipeline[1] as any).names).toContain('band2');
    });

    it('restores at original index', () => {
      const config = createMockConfig();
      
      const disabled = disableFilterEverywhere(config, 'band2');
      const enabled = enableFilterEverywhere(disabled, 'band2');

      // band2 should be back at index 1
      expect((enabled.pipeline[0] as any).names[1]).toBe('band2');
      expect((enabled.pipeline[1] as any).names[1]).toBe('band2');
    });

    it('removes from overlay after enabling', () => {
      const config = createMockConfig();
      
      const disabled = disableFilterEverywhere(config, 'band2');
      enableFilterEverywhere(disabled, 'band2');

      const state = loadDisabledFilters();
      expect(state.disabled.band2).toBeUndefined();
    });

    it('handles non-disabled filters gracefully', () => {
      const config = createMockConfig();
      
      // Try to enable a filter that's not disabled
      const result = enableFilterEverywhere(config, 'band2');

      // Should be a no-op, config unchanged
      expect((result.pipeline[0] as any).names).toEqual(['band1', 'band2', 'band3']);
    });
  });

  describe('repeated disable/enable cycles', () => {
    it('preserves ordering through multiple cycles', () => {
      const config = createMockConfig();
      
      // Cycle 1
      let updated = disableFilterEverywhere(config, 'band2');
      updated = enableFilterEverywhere(updated, 'band2');
      
      // Cycle 2
      updated = disableFilterEverywhere(updated, 'band2');
      updated = enableFilterEverywhere(updated, 'band2');
      
      // Should still be at index 1
      expect((updated.pipeline[0] as any).names).toEqual(['band1', 'band2', 'band3']);
      expect((updated.pipeline[1] as any).names).toEqual(['band1', 'band2', 'band3']);
    });

    it('handles multiple filters disabled at once', () => {
      const config = createMockConfig();
      
      // Disable band1 and band3, leaving only band2
      let updated = disableFilterEverywhere(config, 'band1');
      updated = disableFilterEverywhere(updated, 'band3');
      
      expect((updated.pipeline[0] as any).names).toEqual(['band2']);
      
      // Re-enable both
      updated = enableFilterEverywhere(updated, 'band1');
      updated = enableFilterEverywhere(updated, 'band3');
      
      // Should restore original order
      expect((updated.pipeline[0] as any).names).toEqual(['band1', 'band2', 'band3']);
    });
  });

  describe('multi-filter order stability (3+ bands) — regression', () => {
    // These tests cover the bug where the 3rd+ mute recorded a wrong
    // originalIndex (compressed-list index vs full-list index) and where
    // re-enable inserted at the wrong position (ignoring still-disabled gaps).

    const createFiveBandConfig = (): CamillaDSPConfig => ({
      devices: {
        samplerate: 48000,
        chunksize: 1024,
        capture: { type: 'Alsa', channels: 2, device: 'hw:1', format: 'S24LE3' },
        playback: { type: 'Alsa', channels: 2, device: 'hw:0', format: 'S24LE3' },
      },
      filters: {
        f1: { type: 'Biquad', parameters: { type: 'Peaking', freq: 100, q: 1, gain: 1 } },
        f2: { type: 'Biquad', parameters: { type: 'Peaking', freq: 200, q: 1, gain: 2 } },
        f3: { type: 'Biquad', parameters: { type: 'Peaking', freq: 500, q: 1, gain: 3 } },
        f4: { type: 'Biquad', parameters: { type: 'Peaking', freq: 1000, q: 1, gain: 4 } },
        f5: { type: 'Biquad', parameters: { type: 'Peaking', freq: 5000, q: 1, gain: 5 } },
      },
      mixers: {},
      pipeline: [
        { type: 'Filter', channels: [0], names: ['f1', 'f2', 'f3', 'f4', 'f5'] },
      ],
    });

    it('records correct original indices for 3 consecutive mutes', () => {
      const config = createMockConfig(); // [band1, band2, band3]
      let updated = disableFilterEverywhere(config, 'band1'); // original index 0
      updated = disableFilterEverywhere(updated, 'band2');    // original index 1
      updated = disableFilterEverywhere(updated, 'band3');    // original index 2

      const state = loadDisabledFilters();
      expect(state.disabled.band1[0].index).toBe(0);
      expect(state.disabled.band2[0].index).toBe(1);
      expect(state.disabled.band3[0].index).toBe(2);
    });

    it('restores original order when enabling 3 bands in reverse mute order', () => {
      const config = createMockConfig();
      let updated = disableFilterEverywhere(config, 'band1');
      updated = disableFilterEverywhere(updated, 'band2');
      updated = disableFilterEverywhere(updated, 'band3');

      // Enable in reverse order (worst case for the old bug)
      updated = enableFilterEverywhere(updated, 'band3');
      updated = enableFilterEverywhere(updated, 'band2');
      updated = enableFilterEverywhere(updated, 'band1');

      expect((updated.pipeline[0] as any).names).toEqual(['band1', 'band2', 'band3']);
      expect((updated.pipeline[1] as any).names).toEqual(['band1', 'band2', 'band3']);
    });

    it('restores original order when enabling bands out of mute order', () => {
      const config = createMockConfig();
      let updated = disableFilterEverywhere(config, 'band1');
      updated = disableFilterEverywhere(updated, 'band3');

      // Enable in a different order
      updated = enableFilterEverywhere(updated, 'band3');
      updated = enableFilterEverywhere(updated, 'band1');

      expect((updated.pipeline[0] as any).names).toEqual(['band1', 'band2', 'band3']);
    });

    it('enabling middle filter while outer filters stay disabled inserts at position 0', () => {
      const config = createMockConfig();
      let updated = disableFilterEverywhere(config, 'band1');
      updated = disableFilterEverywhere(updated, 'band2');
      updated = disableFilterEverywhere(updated, 'band3');

      // Only re-enable band2 — band1 and band3 remain muted
      updated = enableFilterEverywhere(updated, 'band2');

      // band1 (index 0) and band3 (index 2) are still disabled;
      // band2 (index 1) should be the only item in names[], at position 0
      expect((updated.pipeline[0] as any).names).toEqual(['band2']);
    });

    it('5-band: mute 3 non-contiguous bands, unmute in random order, order preserved', () => {
      const config = createFiveBandConfig(); // [f1, f2, f3, f4, f5]
      let updated = disableFilterEverywhere(config, 'f1');
      updated = disableFilterEverywhere(updated, 'f3');
      updated = disableFilterEverywhere(updated, 'f5');

      // Only f2 and f4 remain in pipeline
      expect((updated.pipeline[0] as any).names).toEqual(['f2', 'f4']);

      // Unmute in a random order
      updated = enableFilterEverywhere(updated, 'f5');
      updated = enableFilterEverywhere(updated, 'f1');
      updated = enableFilterEverywhere(updated, 'f3');

      expect((updated.pipeline[0] as any).names).toEqual(['f1', 'f2', 'f3', 'f4', 'f5']);
    });

    it('5-band: mute first 3 bands, unmute sequentially, order preserved', () => {
      const config = createFiveBandConfig(); // [f1, f2, f3, f4, f5]
      let updated = disableFilterEverywhere(config, 'f1');
      updated = disableFilterEverywhere(updated, 'f2');
      updated = disableFilterEverywhere(updated, 'f3');

      // Only f4 and f5 remain
      expect((updated.pipeline[0] as any).names).toEqual(['f4', 'f5']);

      // Unmute in sequential order
      updated = enableFilterEverywhere(updated, 'f1');
      updated = enableFilterEverywhere(updated, 'f2');
      updated = enableFilterEverywhere(updated, 'f3');

      expect((updated.pipeline[0] as any).names).toEqual(['f1', 'f2', 'f3', 'f4', 'f5']);
    });

    it('5-band: mute first 3 bands, unmute in reverse, order preserved', () => {
      const config = createFiveBandConfig(); // [f1, f2, f3, f4, f5]
      let updated = disableFilterEverywhere(config, 'f1');
      updated = disableFilterEverywhere(updated, 'f2');
      updated = disableFilterEverywhere(updated, 'f3');

      // Unmute in reverse
      updated = enableFilterEverywhere(updated, 'f3');
      updated = enableFilterEverywhere(updated, 'f2');
      updated = enableFilterEverywhere(updated, 'f1');

      expect((updated.pipeline[0] as any).names).toEqual(['f1', 'f2', 'f3', 'f4', 'f5']);
    });
  });

  describe('isFilterEnabledEverywhere', () => {
    it('returns true for enabled filters', () => {
      const config = createMockConfig();
      expect(isFilterEnabledEverywhere(config, 'band1')).toBe(true);
    });

    it('returns false for disabled filters', () => {
      const config = createMockConfig();
      disableFilterEverywhere(config, 'band2');
      
      expect(isFilterEnabledEverywhere(config, 'band2')).toBe(false);
    });
  });
});
