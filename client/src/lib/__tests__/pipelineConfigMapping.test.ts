import { describe, it, expect } from 'vitest';
import { pipelineConfigToCamillaDSP, camillaDSPToPipelineConfig } from '../pipelineConfigMapping';
import type { PipelineConfig } from '../pipelineConfigMapping';
import type { CamillaDSPConfig } from '../camillaDSP';

describe('pipelineConfigMapping', () => {
  describe('pipelineConfigToCamillaDSP', () => {
    it('should handle legacy format (filterArray only)', () => {
      const pipelineConfig: PipelineConfig = {
        configName: 'Test EQ',
        filterArray: [
          { Filter01: { type: 'Peaking', freq: 1000, q: 1.0, gain: 6.0 } },
          { Preamp: { gain: -3.0 } },
        ],
      };

      const result = pipelineConfigToCamillaDSP(pipelineConfig);

      expect(result.filters).toHaveProperty('Filter01');
      expect(result.filters.Filter01.type).toBe('Biquad');
      expect(result.filters.Filter01.parameters).toMatchObject({
        type: 'Peaking',
        freq: 1000,
        q: 1.0,
        gain: 6.0,
      });

      // Should have preamp mixer
      expect(result.mixers).toHaveProperty('preamp');
      
      // Should have pipeline with mixer + 2 filter steps
      expect(result.pipeline).toHaveLength(3);
      expect(result.pipeline[0]).toMatchObject({ type: 'Mixer', name: 'preamp' });
      expect(result.pipeline[1]).toMatchObject({ type: 'Filter', channels: [0] });
      expect(result.pipeline[2]).toMatchObject({ type: 'Filter', channels: [1] });
    });

    it('should handle extended format with full pipeline', () => {
      const pipelineConfig: PipelineConfig = {
        configName: 'Test Pipeline',
        accessKey: '',
        filterArray: [],
        title: 'Test Pipeline Title',
        description: 'Test pipeline description',
        filters: {
          peaking1: {
            type: 'Biquad',
            parameters: { type: 'Peaking', freq: 1000, gain: 6.0, q: 1.0 },
          },
          gain1: {
            type: 'Gain',
            parameters: { gain: -3.0 },
          },
        },
        mixers: {
          passthrough: {
            channels: { in: 2, out: 2 },
            mapping: [
              { dest: 0, sources: [{ channel: 0, gain: 0, inverted: false, mute: false, scale: 'dB' }] },
              { dest: 1, sources: [{ channel: 1, gain: 0, inverted: false, mute: false, scale: 'dB' }] },
            ],
          },
        },
        processors: {
          comp1: {
            type: 'Compressor',
            parameters: { channels: 2, threshold: -20, factor: 3.0 },
          },
        },
        pipeline: [
          { type: 'Mixer', name: 'passthrough' },
          { type: 'Filter', channels: [0, 1], names: ['peaking1', 'gain1'] },
          { type: 'Processor', name: 'comp1' },
        ],
      };

      const result = pipelineConfigToCamillaDSP(pipelineConfig);

      // Should use filters directly from pipelineConfig
      expect(result.filters).toEqual(pipelineConfig.filters);

      // Should use mixers directly from pipelineConfig
      expect(result.mixers).toEqual(pipelineConfig.mixers);

      // Should use pipeline directly from pipelineConfig
      expect(result.pipeline).toEqual(pipelineConfig.pipeline);

      // Should include processors
      expect((result as any).processors).toEqual(pipelineConfig.processors);

      // Should include title/description
      expect((result as any).title).toBe('Test Pipeline Title');
      expect((result as any).description).toBe('Test pipeline description');

      // Devices should come from defaults (not stored)
      expect(result.devices).toBeDefined();
      expect(result.devices.samplerate).toBe(48000);
    });

    it('should use devices from templateConfig when provided', () => {
      const pipelineConfig: PipelineConfig = {
        configName: 'Test',
        filterArray: [],
        pipeline: [{ type: 'Mixer', name: 'test' }],
        mixers: { test: { channels: { in: 2, out: 2 }, mapping: [] } },
      };

      const templateConfig: CamillaDSPConfig = {
        devices: {
          samplerate: 96000,
          chunksize: 2048,
          capture: { type: 'Alsa', channels: 2, device: 'custom_hw', format: 'S32LE' },
          playback: { type: 'Alsa', channels: 2, device: 'custom_out', format: 'S32LE' },
        },
        filters: {},
        mixers: {},
        pipeline: [],
      };

      const result = pipelineConfigToCamillaDSP(pipelineConfig, templateConfig);

      // Should use templateConfig devices
      expect(result.devices.samplerate).toBe(96000);
      expect(result.devices.chunksize).toBe(2048);
      expect(result.devices.capture.device).toBe('custom_hw');
      expect(result.devices.playback.device).toBe('custom_out');
    });

    it('should prefer extended format over filterArray when both present', () => {
      const pipelineConfig: PipelineConfig = {
        configName: 'Mixed Format',
        filterArray: [
          { Filter01: { type: 'Peaking', freq: 500, q: 1.0, gain: 3.0 } },
        ],
        filters: {
          customFilter: {
            type: 'Biquad',
            parameters: { type: 'Peaking', freq: 2000, gain: -6.0, q: 2.0 },
          },
        },
        pipeline: [
          { type: 'Filter', channels: [0], names: ['customFilter'] },
        ],
      };

      const result = pipelineConfigToCamillaDSP(pipelineConfig);

      // Should use extended format (pipeline present)
      expect(result.filters).toHaveProperty('customFilter');
      expect(result.filters).not.toHaveProperty('Filter01');
      expect(result.pipeline).toHaveLength(1);
      expect((result.pipeline[0] as any).names).toEqual(['customFilter']);
    });
  });

  describe('camillaDSPToPipelineConfig', () => {
    it('should convert CamillaDSP config to legacy filterArray format', () => {
      const camillaConfig: CamillaDSPConfig = {
        devices: {
          samplerate: 48000,
          chunksize: 1024,
          capture: { type: 'Alsa', channels: 2, device: 'hw:0', format: 'S32LE' },
          playback: { type: 'Alsa', channels: 2, device: 'hw:1', format: 'S32LE' },
        },
        filters: {
          Filter01: {
            type: 'Biquad',
            parameters: { type: 'Peaking', freq: 1000, q: 1.0, gain: 6.0 },
          },
          Filter02: {
            type: 'Biquad',
            parameters: { type: 'Highshelf', freq: 5000, q: 0.7, gain: 3.0 },
          },
        },
        mixers: {
          preamp: {
            channels: { in: 2, out: 2 },
            mapping: [
              { dest: 0, sources: [{ channel: 0, gain: -2.5, inverted: false, mute: false, scale: 'dB' }], mute: false },
              { dest: 1, sources: [{ channel: 1, gain: -2.5, inverted: false, mute: false, scale: 'dB' }], mute: false },
            ],
          },
        },
        pipeline: [
          { type: 'Mixer', name: 'preamp' },
          { type: 'Filter', channels: [0], names: ['Filter01', 'Filter02'] },
          { type: 'Filter', channels: [1], names: ['Filter01', 'Filter02'] },
        ],
      };

      const result = camillaDSPToPipelineConfig(camillaConfig, 'Test Config');

      expect(result.configName).toBe('Test Config');
      expect(result.filterArray).toHaveLength(4); // 2 filters + preamp + volume

      // Check filters
      expect(result.filterArray[0]).toHaveProperty('Filter01');
      expect(result.filterArray[0].Filter01).toMatchObject({
        type: 'Peaking',
        freq: 1000,
        q: 1.0,
        gain: 6.0,
      });

      expect(result.filterArray[1]).toHaveProperty('Filter02');

      // Check preamp
      expect(result.filterArray[2]).toHaveProperty('Preamp');
      expect(result.filterArray[2].Preamp.gain).toBe(-2.5);

      // Check volume placeholder
      expect(result.filterArray[3]).toHaveProperty('Volume');
    });

    it('should ignore non-Biquad filters', () => {
      const camillaConfig: CamillaDSPConfig = {
        devices: {
          samplerate: 48000,
          chunksize: 1024,
          capture: { type: 'Alsa', channels: 2, device: 'hw:0', format: 'S32LE' },
          playback: { type: 'Alsa', channels: 2, device: 'hw:1', format: 'S32LE' },
        },
        filters: {
          gain1: {
            type: 'Gain',
            parameters: { gain: -3.0 },
          },
          delay1: {
            type: 'Delay',
            parameters: { delay: 0.5, unit: 'ms' },
          },
        },
        mixers: {},
        pipeline: [],
      };

      const result = camillaDSPToPipelineConfig(camillaConfig);

      // Should only have Volume placeholder (no Biquad filters)
      expect(result.filterArray).toHaveLength(1);
      expect(result.filterArray[0]).toHaveProperty('Volume');
    });
  });
});
