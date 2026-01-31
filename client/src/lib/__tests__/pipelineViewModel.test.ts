/**
 * Pipeline view model tests
 */

import { describe, it, expect } from 'vitest';
import { buildPipelineViewModel } from '../pipelineViewModel';
import type { CamillaDSPConfig } from '../camillaDSP';

describe('pipelineViewModel', () => {
  it('returns empty array for empty pipeline', () => {
    const config: CamillaDSPConfig = {
      devices: { capture: { channels: 2 }, playback: { channels: 2 } },
      filters: {},
      mixers: {},
      pipeline: [],
    };
    
    const blocks = buildPipelineViewModel(config);
    
    expect(blocks).toEqual([]);
  });

  it('builds FilterBlockVm for Filter step with existing filters', () => {
    const config: CamillaDSPConfig = {
      devices: { capture: { channels: 2 }, playback: { channels: 2 } },
      filters: {
        EQ1: {
          type: 'Biquad',
          parameters: {
            type: 'Peaking',
            freq: 1000,
            q: 1.0,
            gain: 3.0,
          },
        },
        EQ2: {
          type: 'Biquad',
          parameters: {
            type: 'Highshelf',
            freq: 8000,
            q: 0.7,
            gain: 2.0,
            bypassed: true,
          },
        },
      },
      mixers: {},
      pipeline: [
        {
          type: 'Filter',
          channels: [0, 1],
          names: ['EQ1', 'EQ2'],
        },
      ],
    };
    
    const blocks = buildPipelineViewModel(config);
    
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: 'filter',
      stepIndex: 0,
      blockId: 'Filter:0',
      channels: [0, 1],
      bypassed: false,
      filters: [
        {
          name: 'EQ1',
          iconType: 'Peaking',
          exists: true,
          bypassed: false,
        },
        {
          name: 'EQ2',
          iconType: 'Highshelf',
          exists: true,
          bypassed: true,
        },
      ],
    });
  });

  it('marks missing filters in FilterBlockVm', () => {
    const config: CamillaDSPConfig = {
      devices: { capture: { channels: 2 }, playback: { channels: 2 } },
      filters: {
        EQ1: {
          type: 'Biquad',
          parameters: {
            type: 'Peaking',
            freq: 1000,
            q: 1.0,
            gain: 3.0,
          },
        },
      },
      mixers: {},
      pipeline: [
        {
          type: 'Filter',
          channels: [0],
          names: ['EQ1', 'MissingFilter'],
        },
      ],
    };
    
    const blocks = buildPipelineViewModel(config);
    
    expect(blocks[0]).toMatchObject({
      kind: 'filter',
      filters: [
        {
          name: 'EQ1',
          exists: true,
        },
        {
          name: 'MissingFilter',
          iconType: null,
          exists: false,
          bypassed: false,
        },
      ],
    });
  });

  it('handles non-Biquad filters (no icon)', () => {
    const config: CamillaDSPConfig = {
      devices: { capture: { channels: 2 }, playback: { channels: 2 } },
      filters: {
        GainFilter: {
          type: 'Gain',
          parameters: {
            gain: 5.0,
          },
        },
      },
      mixers: {},
      pipeline: [
        {
          type: 'Filter',
          channels: [0],
          names: ['GainFilter'],
        },
      ],
    };
    
    const blocks = buildPipelineViewModel(config);
    
    expect(blocks[0]).toMatchObject({
      kind: 'filter',
      filters: [
        {
          name: 'GainFilter',
          iconType: null, // No icon for non-Biquad
          exists: true,
        },
      ],
    });
  });

  it('builds MixerBlockVm for Mixer step with existing mixer', () => {
    const config: CamillaDSPConfig = {
      devices: { capture: { channels: 2 }, playback: { channels: 2 } },
      filters: {},
      mixers: {
        stereo_to_mono: {
          channels: { in: 2, out: 1 },
          mapping: [
            {
              dest: 0,
              sources: [
                { channel: 0, gain: -3, inverted: false, mute: false, scale: 'dB' },
                { channel: 1, gain: -3, inverted: false, mute: false, scale: 'dB' },
              ],
              mute: false,
            },
          ],
        },
      },
      pipeline: [
        {
          type: 'Mixer',
          name: 'stereo_to_mono',
        },
      ],
    };
    
    const blocks = buildPipelineViewModel(config);
    
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: 'mixer',
      stepIndex: 0,
      name: 'stereo_to_mono',
      bypassed: false,
      channelsInOut: { in: 2, out: 1 },
      exists: true,
    });
  });

  it('marks missing mixer in MixerBlockVm', () => {
    const config: CamillaDSPConfig = {
      devices: { capture: { channels: 2 }, playback: { channels: 2 } },
      filters: {},
      mixers: {},
      pipeline: [
        {
          type: 'Mixer',
          name: 'missing_mixer',
          bypassed: true,
        },
      ],
    };
    
    const blocks = buildPipelineViewModel(config);
    
    expect(blocks[0]).toMatchObject({
      kind: 'mixer',
      name: 'missing_mixer',
      bypassed: true,
      exists: false,
      channelsInOut: undefined,
    });
  });

  it('builds ProcessorBlockVm for unknown step types', () => {
    const config: CamillaDSPConfig = {
      devices: { capture: { channels: 2 }, playback: { channels: 2 } },
      filters: {},
      mixers: {},
      pipeline: [
        {
          type: 'Limiter',
          name: 'my_limiter',
          bypassed: false,
        } as any,
      ],
    };
    
    const blocks = buildPipelineViewModel(config);
    
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      kind: 'processor',
      stepIndex: 0,
      typeLabel: 'Limiter',
      name: 'my_limiter',
      bypassed: false,
    });
  });

  it('builds mixed pipeline with all block types', () => {
    const config: CamillaDSPConfig = {
      devices: { capture: { channels: 2 }, playback: { channels: 2 } },
      filters: {
        HPF: {
          type: 'Biquad',
          parameters: {
            type: 'Highpass',
            freq: 80,
            q: 0.7,
          },
        },
      },
      mixers: {
        preamp: {
          channels: { in: 2, out: 2 },
          mapping: [
            {
              dest: 0,
              sources: [{ channel: 0, gain: -3, inverted: false, mute: false, scale: 'dB' }],
              mute: false,
            },
            {
              dest: 1,
              sources: [{ channel: 1, gain: -3, inverted: false, mute: false, scale: 'dB' }],
              mute: false,
            },
          ],
        },
      },
      pipeline: [
        {
          type: 'Mixer',
          name: 'preamp',
        },
        {
          type: 'Filter',
          channels: [0, 1],
          names: ['HPF'],
        },
        {
          type: 'Compressor',
          name: 'dynamics',
        } as any,
      ],
    };
    
    const blocks = buildPipelineViewModel(config);
    
    expect(blocks).toHaveLength(3);
    expect(blocks[0].kind).toBe('mixer');
    expect(blocks[1].kind).toBe('filter');
    expect(blocks[2].kind).toBe('processor');
  });

  it('handles pipeline-level bypass on Filter step', () => {
    const config: CamillaDSPConfig = {
      devices: { capture: { channels: 2 }, playback: { channels: 2 } },
      filters: {
        EQ1: {
          type: 'Biquad',
          parameters: {
            type: 'Peaking',
            freq: 1000,
            q: 1.0,
            gain: 3.0,
          },
        },
      },
      mixers: {},
      pipeline: [
        {
          type: 'Filter',
          channels: [0],
          names: ['EQ1'],
          bypassed: true, // Pipeline-level bypass
        },
      ],
    };
    
    const blocks = buildPipelineViewModel(config);
    
    expect(blocks[0]).toMatchObject({
      kind: 'filter',
      bypassed: true, // Pipeline-level
      filters: [
        {
          name: 'EQ1',
          bypassed: false, // Filter-level not set
        },
      ],
    });
  });
});
