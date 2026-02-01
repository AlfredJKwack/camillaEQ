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
