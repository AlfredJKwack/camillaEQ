import { describe, it, expect } from 'vitest';
import { extractEqBandsFromConfig, applyEqBandsToConfig } from '../camillaEqMapping';
import type { CamillaDSPConfig } from '../camillaDSP';

describe('camillaEqMapping', () => {
  const mockConfig: CamillaDSPConfig = {
    devices: {
      samplerate: 48000,
      chunksize: 1024,
      queuelimit: 1,
      capture: { type: 'Alsa', channels: 2, device: 'hw:0', format: 'S32LE' },
      playback: { type: 'Alsa', channels: 2, device: 'hw:1', format: 'S32LE' },
    },
    mixers: {
      preamp: {
        channels: { in: 2, out: 2 },
        mapping: [
          {
            dest: 0,
            sources: [{ channel: 0, gain: 6.0, inverted: false, mute: false, scale: 'dB' }],
            mute: false,
          },
          {
            dest: 1,
            sources: [{ channel: 1, gain: 6.0, inverted: false, mute: false, scale: 'dB' }],
            mute: false,
          },
        ],
      },
    },
    filters: {
      Filter01: {
        type: 'Biquad',
        parameters: { type: 'Peaking', freq: 100, q: 1.0, gain: 3.0 },
      },
      Filter02: {
        type: 'Biquad',
        parameters: { type: 'Highpass', freq: 50, q: 0.7 },
      },
    },
    pipeline: [
      { type: 'Mixer', name: 'preamp' },
      { type: 'Filter', channels: [0], names: ['Filter01', 'Filter02'] },
      { type: 'Filter', channels: [1], names: ['Filter01', 'Filter02'] },
    ],
  };

  describe('extractEqBandsFromConfig', () => {
    it('should extract preamp gain from mixers', () => {
      const result = extractEqBandsFromConfig(mockConfig);
      
      expect(result.preampGain).toBe(6.0);
    });

    it('should extract bands from channel 1 when channel 0 is missing', () => {
      const configWithoutChannel0: CamillaDSPConfig = {
        ...mockConfig,
        pipeline: [
          { type: 'Mixer', name: 'preamp' },
          { type: 'Filter', channels: [1], names: ['Filter01', 'Filter02'] },
        ],
      };

      const result = extractEqBandsFromConfig(configWithoutChannel0);
      
      expect(result.bands).toHaveLength(2);
      expect(result.filterNames).toEqual(['Filter01', 'Filter02']);
      expect(result.channels).toEqual([1]);
    });

    it('should build union of filter names across multiple Filter steps', () => {
      const configWithMultipleSteps: CamillaDSPConfig = {
        ...mockConfig,
        filters: {
          FilterA: {
            type: 'Biquad',
            parameters: { type: 'Peaking', freq: 100, q: 1.0, gain: 3.0 },
          },
          FilterB: {
            type: 'Biquad',
            parameters: { type: 'Highpass', freq: 50, q: 0.7 },
          },
          FilterC: {
            type: 'Biquad',
            parameters: { type: 'Lowpass', freq: 8000, q: 0.7 },
          },
        },
        pipeline: [
          { type: 'Filter', channels: [1], names: ['FilterA', 'FilterB'] },
          { type: 'Filter', channels: [0], names: ['FilterB', 'FilterC'] },
        ],
      };

      const result = extractEqBandsFromConfig(configWithMultipleSteps);
      
      // Union order: FilterA (from step0), FilterB (from step0, dedupe), FilterC (from step1)
      expect(result.bands).toHaveLength(3);
      expect(result.filterNames).toEqual(['FilterA', 'FilterB', 'FilterC']);
      expect(result.channels).toEqual([1, 0]);
    });

    it('should include disabled filters from overlay in union', () => {
      // Mock localStorage for disabled filter state
      const mockDisabledState = {
        version: 2,
        disabled: {
          Filter02: [
            {
              stepKey: 'Filter:ch0:idx1',
              index: 1,
              filterName: 'Filter02',
            },
          ],
        },
      };
      localStorage.setItem('camillaEQ.disabledFilters', JSON.stringify(mockDisabledState));

      const configWithDisabled: CamillaDSPConfig = {
        ...mockConfig,
        pipeline: [
          { type: 'Mixer', name: 'preamp' },
          { type: 'Filter', channels: [0], names: ['Filter01'] }, // Filter02 removed from enabled names
        ],
      };

      const result = extractEqBandsFromConfig(configWithDisabled);
      
      // Should include both Filter01 and Filter02 (disabled one reconstructed from overlay)
      expect(result.bands).toHaveLength(2);
      expect(result.filterNames).toEqual(['Filter01', 'Filter02']);
      expect(result.bands[0].enabled).toBe(true); // Filter01 is enabled
      expect(result.bands[1].enabled).toBe(false); // Filter02 is disabled

      // Cleanup
      localStorage.removeItem('camillaEQ.disabledFilters');
    });

    it('should mark band as disabled when not present in any step', () => {
      const configWithPartialPresence: CamillaDSPConfig = {
        ...mockConfig,
        pipeline: [
          { type: 'Filter', channels: [0], names: ['Filter01'] }, // Only Filter01
          { type: 'Filter', channels: [1], names: ['Filter01'] }, // Only Filter01
        ],
      };

      // Mock overlay: Filter02 was in step 0 but is now disabled
      const mockDisabledState = {
        version: 2,
        disabled: {
          Filter02: [
            {
              stepKey: 'Filter:ch0:idx0',
              index: 1,
              filterName: 'Filter02',
            },
          ],
        },
      };
      localStorage.setItem('camillaEQ.disabledFilters', JSON.stringify(mockDisabledState));

      const result = extractEqBandsFromConfig(configWithPartialPresence);
      
      expect(result.bands).toHaveLength(2);
      expect(result.bands[0].enabled).toBe(true); // Filter01 present
      expect(result.bands[1].enabled).toBe(false); // Filter02 not in any enabled names

      // Cleanup
      localStorage.removeItem('camillaEQ.disabledFilters');
    });

    it('should handle bypass flag correctly across multiple steps', () => {
      const configWithBypassed: CamillaDSPConfig = {
        ...mockConfig,
        pipeline: [
          { type: 'Filter', channels: [0], names: ['Filter01'], bypassed: true },
          { type: 'Filter', channels: [1], names: ['Filter01'], bypassed: false },
        ],
      };

      const result = extractEqBandsFromConfig(configWithBypassed);
      
      // Filter is present in step 1 (not bypassed), so should be enabled
      expect(result.bands[0].enabled).toBe(true);
    });

    it('should exclude filters when all relevant steps are bypassed', () => {
      const configWithAllBypassed: CamillaDSPConfig = {
        ...mockConfig,
        pipeline: [
          { type: 'Filter', channels: [0], names: ['Filter01'], bypassed: true },
          { type: 'Filter', channels: [1], names: ['Filter01'], bypassed: true },
        ],
      };

      const result = extractEqBandsFromConfig(configWithAllBypassed);
      
      // All steps with Filter01 are bypassed, so filter is not in EQ page at all
      expect(result.bands.length).toBe(0);
      expect(result.filterNames.length).toBe(0);
    });

    it('should default to 0 when no preamp mixer exists', () => {
      const configWithoutPreamp: CamillaDSPConfig = {
        ...mockConfig,
        mixers: {},
        pipeline: [
          { type: 'Filter', channels: [0], names: ['Filter01', 'Filter02'] },
          { type: 'Filter', channels: [1], names: ['Filter01', 'Filter02'] },
        ],
      };

      const result = extractEqBandsFromConfig(configWithoutPreamp);
      
      expect(result.preampGain).toBe(0);
    });

    it('should clamp preamp gain to ±24 dB', () => {
      const configWithHighGain: CamillaDSPConfig = {
        ...mockConfig,
        mixers: {
          preamp: {
            channels: { in: 2, out: 2 },
            mapping: [
              {
                dest: 0,
                sources: [{ channel: 0, gain: 50.0, inverted: false, mute: false, scale: 'dB' }],
                mute: false,
              },
              {
                dest: 1,
                sources: [{ channel: 1, gain: 50.0, inverted: false, mute: false, scale: 'dB' }],
                mute: false,
              },
            ],
          },
        },
      };

      const result = extractEqBandsFromConfig(configWithHighGain);
      
      expect(result.preampGain).toBe(24);
    });

    it('should extract bands and preamp together', () => {
      const result = extractEqBandsFromConfig(mockConfig);
      
      expect(result.bands).toHaveLength(2);
      expect(result.preampGain).toBe(6.0);
      expect(result.bands[0].type).toBe('Peaking');
      expect(result.bands[0].freq).toBe(100);
      expect(result.bands[0].gain).toBe(3.0);
    });
  });

  describe('applyEqBandsToConfig', () => {
    it('should remove gain parameter when switching to Q-only filter types', () => {
      // Start with a Peaking filter (has gain)
      const configWithPeaking: CamillaDSPConfig = {
        ...mockConfig,
        filters: {
          Filter01: {
            type: 'Biquad',
            parameters: { type: 'Peaking', freq: 100, q: 1.0, gain: 6.0 },
          },
        },
        pipeline: [
          { type: 'Mixer', name: 'preamp' },
          { type: 'Filter', channels: [0], names: ['Filter01'] },
          { type: 'Filter', channels: [1], names: ['Filter01'] },
        ],
      };

      // Extract bands
      const extracted = extractEqBandsFromConfig(configWithPeaking);
      
      // Change to HighPass (Q-only type, doesn't support gain)
      extracted.bands[0].type = 'HighPass';
      extracted.bands[0].gain = 0; // Gain should be removed, not just set to 0

      // Apply to config
      const updated = applyEqBandsToConfig(configWithPeaking, extracted);

      // Verify gain parameter was removed (not just set to 0)
      expect(updated.filters.Filter01.parameters.type).toBe('Highpass');
      expect(updated.filters.Filter01.parameters.freq).toBe(100);
      expect(updated.filters.Filter01.parameters.q).toBe(1.0);
      expect('gain' in updated.filters.Filter01.parameters).toBe(false);
    });

    it('should remove gain parameter for LowPass filters', () => {
      const configWithGain: CamillaDSPConfig = {
        ...mockConfig,
        filters: {
          Filter01: {
            type: 'Biquad',
            parameters: { type: 'Peaking', freq: 5000, q: 0.7, gain: -3.0 },
          },
        },
        pipeline: [
          { type: 'Mixer', name: 'preamp' },
          { type: 'Filter', channels: [0], names: ['Filter01'] },
          { type: 'Filter', channels: [1], names: ['Filter01'] },
        ],
      };

      const extracted = extractEqBandsFromConfig(configWithGain);
      extracted.bands[0].type = 'LowPass';

      const updated = applyEqBandsToConfig(configWithGain, extracted);

      expect(updated.filters.Filter01.parameters.type).toBe('Lowpass');
      expect('gain' in updated.filters.Filter01.parameters).toBe(false);
    });

    it('should preserve gain parameter for gain-capable filter types', () => {
      const configWithPeaking: CamillaDSPConfig = {
        ...mockConfig,
        filters: {
          Filter01: {
            type: 'Biquad',
            parameters: { type: 'Highpass', freq: 100, q: 1.0 },
          },
        },
        pipeline: [
          { type: 'Mixer', name: 'preamp' },
          { type: 'Filter', channels: [0], names: ['Filter01'] },
          { type: 'Filter', channels: [1], names: ['Filter01'] },
        ],
      };

      const extracted = extractEqBandsFromConfig(configWithPeaking);
      extracted.bands[0].type = 'Peaking';
      extracted.bands[0].gain = 5.0;

      const updated = applyEqBandsToConfig(configWithPeaking, extracted);

      expect(updated.filters.Filter01.parameters.type).toBe('Peaking');
      expect(updated.filters.Filter01.parameters.gain).toBe(5.0);
    });

    it('should create preamp mixer when gain is non-zero', () => {
      const extracted = extractEqBandsFromConfig(mockConfig);
      extracted.preampGain = 12.0;

      const updated = applyEqBandsToConfig(mockConfig, extracted);

      expect(updated.mixers?.preamp).toBeDefined();
      expect(updated.mixers?.preamp?.mapping[0].sources[0].gain).toBe(12.0);
      expect(updated.mixers?.preamp?.mapping[1].sources[0].gain).toBe(12.0);
    });

    it('should add preamp to pipeline if missing', () => {
      const configWithoutPreampInPipeline: CamillaDSPConfig = {
        ...mockConfig,
        pipeline: [
          { type: 'Filter', channels: [0], names: ['Filter01'] },
          { type: 'Filter', channels: [1], names: ['Filter01'] },
        ],
      };

      const extracted = extractEqBandsFromConfig(configWithoutPreampInPipeline);
      extracted.preampGain = 6.0;

      const updated = applyEqBandsToConfig(configWithoutPreampInPipeline, extracted);

      expect(updated.pipeline[0]).toEqual({ type: 'Mixer', name: 'preamp' });
    });

    it('should set gain to 0 when preampGain is 0', () => {
      const extracted = extractEqBandsFromConfig(mockConfig);
      extracted.preampGain = 0;

      const updated = applyEqBandsToConfig(mockConfig, extracted);

      if (updated.mixers?.preamp) {
        expect(updated.mixers.preamp.mapping[0].sources[0].gain).toBe(0);
        expect(updated.mixers.preamp.mapping[1].sources[0].gain).toBe(0);
      }
    });

    it('should preserve bands while updating preamp', () => {
      const extracted = extractEqBandsFromConfig(mockConfig);
      extracted.preampGain = 10.0;
      extracted.bands[0].gain = 5.0; // Modify first band

      const updated = applyEqBandsToConfig(mockConfig, extracted);

      expect(updated.mixers?.preamp?.mapping[0].sources[0].gain).toBe(10.0);
      expect((updated.filters.Filter01.parameters as any).gain).toBe(5.0);
    });
  });
});
