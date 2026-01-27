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
      { type: 'Filter', channel: 0, names: ['Filter01', 'Filter02'] },
      { type: 'Filter', channel: 1, names: ['Filter01', 'Filter02'] },
    ],
  };

  describe('extractEqBandsFromConfig', () => {
    it('should extract preamp gain from mixers', () => {
      const result = extractEqBandsFromConfig(mockConfig);
      
      expect(result.preampGain).toBe(6.0);
    });

    it('should default to 0 when no preamp mixer exists', () => {
      const configWithoutPreamp: CamillaDSPConfig = {
        ...mockConfig,
        mixers: {},
        pipeline: [
          { type: 'Filter', channel: 0, names: ['Filter01', 'Filter02'] },
          { type: 'Filter', channel: 1, names: ['Filter01', 'Filter02'] },
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
          { type: 'Filter', channel: 0, names: ['Filter01'] },
          { type: 'Filter', channel: 1, names: ['Filter01'] },
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
