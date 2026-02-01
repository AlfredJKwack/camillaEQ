/**
 * Pipeline view model tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildPipelineViewModel } from '../pipelineViewModel';
import type { CamillaDSPConfig } from '../camillaDSP';
import * as disabledFiltersOverlay from '../disabledFiltersOverlay';

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
  
  it('handles disabled filters with duplicate indices (adjacent disables)', () => {
    const config: CamillaDSPConfig = {
      devices: { capture: { channels: 2 }, playback: { channels: 2 } },
      filters: {
        EQ1: {
          type: 'Biquad',
          parameters: { type: 'Peaking', freq: 100, q: 1.0, gain: 3.0 },
        },
        EQ2: {
          type: 'Biquad',
          parameters: { type: 'Peaking', freq: 200, q: 1.0, gain: 3.0 },
        },
        EQ3: {
          type: 'Biquad',
          parameters: { type: 'Peaking', freq: 300, q: 1.0, gain: 3.0 },
        },
        EQ4: {
          type: 'Biquad',
          parameters: { type: 'Peaking', freq: 400, q: 1.0, gain: 3.0 },
        },
      },
      mixers: {},
      pipeline: [
        {
          type: 'Filter',
          channels: [0, 1],
          names: ['EQ3', 'EQ4'], // EQ1 and EQ2 are disabled
        },
      ],
    };
    
    // Mock overlay: EQ1 and EQ2 both disabled at index 0 (happens when you disable adjacent filters)
    vi.spyOn(disabledFiltersOverlay, 'getDisabledFiltersForStep').mockReturnValue([
      { filterName: 'EQ1', stepKey: 'Filter:ch0,1:idx0', index: 0 },
      { filterName: 'EQ2', stepKey: 'Filter:ch0,1:idx0', index: 0 }, // Same index!
    ]);
    
    const blocks = buildPipelineViewModel(config);
    
    expect(blocks).toHaveLength(1);
    const filterBlock = blocks[0];
    expect(filterBlock.kind).toBe('filter');
    
    // Both disabled filters should appear at the front (not at the end)
    if (filterBlock.kind === 'filter') {
      expect(filterBlock.filters).toHaveLength(4);
      expect(filterBlock.filters[0]).toMatchObject({ name: 'EQ1', disabled: true });
      expect(filterBlock.filters[1]).toMatchObject({ name: 'EQ2', disabled: true });
      expect(filterBlock.filters[2]).toMatchObject({ name: 'EQ3', disabled: false });
      expect(filterBlock.filters[3]).toMatchObject({ name: 'EQ4', disabled: false });
    }
    
    vi.restoreAllMocks();
  });
  
  it('handles disabled filters at various positions', () => {
    const config: CamillaDSPConfig = {
      devices: { capture: { channels: 2 }, playback: { channels: 2 } },
      filters: {
        EQ1: {
          type: 'Biquad',
          parameters: { type: 'Peaking', freq: 100, q: 1.0, gain: 3.0 },
        },
        EQ2: {
          type: 'Biquad',
          parameters: { type: 'Peaking', freq: 200, q: 1.0, gain: 3.0 },
        },
        EQ3: {
          type: 'Biquad',
          parameters: { type: 'Peaking', freq: 300, q: 1.0, gain: 3.0 },
        },
        EQ4: {
          type: 'Biquad',
          parameters: { type: 'Peaking', freq: 400, q: 1.0, gain: 3.0 },
        },
      },
      mixers: {},
      pipeline: [
        {
          type: 'Filter',
          channels: [0],
          names: ['EQ1', 'EQ4'], // EQ2 and EQ3 disabled
        },
      ],
    };
    
    // Mock overlay: EQ2 at index 1, EQ3 at index 2
    vi.spyOn(disabledFiltersOverlay, 'getDisabledFiltersForStep').mockReturnValue([
      { filterName: 'EQ2', stepKey: 'Filter:ch0:idx0', index: 1 },
      { filterName: 'EQ3', stepKey: 'Filter:ch0:idx0', index: 2 },
    ]);
    
    const blocks = buildPipelineViewModel(config);
    
    const filterBlock = blocks[0];
    if (filterBlock.kind === 'filter') {
      expect(filterBlock.filters).toHaveLength(4);
      // Expected order: EQ1 (active, idx 0), EQ2 (disabled, idx 1), EQ3 (disabled, idx 2), EQ4 (active, originally idx 3)
      expect(filterBlock.filters[0]).toMatchObject({ name: 'EQ1', disabled: false });
      expect(filterBlock.filters[1]).toMatchObject({ name: 'EQ2', disabled: true });
      expect(filterBlock.filters[2]).toMatchObject({ name: 'EQ3', disabled: true });
      expect(filterBlock.filters[3]).toMatchObject({ name: 'EQ4', disabled: false });
    }
    
    vi.restoreAllMocks();
  });
  
  it('handles disabling filter 5 then filter 4 from [1,2,3,4,5,6]', () => {
    const config: CamillaDSPConfig = {
      devices: { capture: { channels: 2 }, playback: { channels: 2 } },
      filters: {
        F1: { type: 'Biquad', parameters: { type: 'Peaking', freq: 100, q: 1.0, gain: 0 } },
        F2: { type: 'Biquad', parameters: { type: 'Peaking', freq: 200, q: 1.0, gain: 0 } },
        F3: { type: 'Biquad', parameters: { type: 'Peaking', freq: 300, q: 1.0, gain: 0 } },
        F4: { type: 'Biquad', parameters: { type: 'Peaking', freq: 400, q: 1.0, gain: 0 } },
        F5: { type: 'Biquad', parameters: { type: 'Peaking', freq: 500, q: 1.0, gain: 0 } },
        F6: { type: 'Biquad', parameters: { type: 'Peaking', freq: 600, q: 1.0, gain: 0 } },
      },
      mixers: {},
      pipeline: [
        {
          type: 'Filter',
          channels: [0],
          names: ['F1', 'F2', 'F3', 'F6'], // F4 and F5 disabled
        },
      ],
    };
    
    // Mock overlay: F5 was disabled at index 4, then F4 at index 3
    vi.spyOn(disabledFiltersOverlay, 'getDisabledFiltersForStep').mockReturnValue([
      { filterName: 'F5', stepKey: 'Filter:ch0:idx0', index: 4 },
      { filterName: 'F4', stepKey: 'Filter:ch0:idx0', index: 3 },
    ]);
    
    const blocks = buildPipelineViewModel(config);
    
    const filterBlock = blocks[0];
    if (filterBlock.kind === 'filter') {
      expect(filterBlock.filters).toHaveLength(6);
      // Expected order: [F1, F2, F3, F4, F5, F6] with F4 and F5 disabled
      expect(filterBlock.filters[0]).toMatchObject({ name: 'F1', disabled: false });
      expect(filterBlock.filters[1]).toMatchObject({ name: 'F2', disabled: false });
      expect(filterBlock.filters[2]).toMatchObject({ name: 'F3', disabled: false });
      expect(filterBlock.filters[3]).toMatchObject({ name: 'F4', disabled: true });
      expect(filterBlock.filters[4]).toMatchObject({ name: 'F5', disabled: true });
      expect(filterBlock.filters[5]).toMatchObject({ name: 'F6', disabled: false });
    }
    
    vi.restoreAllMocks();
  });
  
  it('handles disabling filter 3 then filter 5 from [1,2,3,4,5,6]', () => {
    const config: CamillaDSPConfig = {
      devices: { capture: { channels: 2 }, playback: { channels: 2 } },
      filters: {
        F1: { type: 'Biquad', parameters: { type: 'Peaking', freq: 100, q: 1.0, gain: 0 } },
        F2: { type: 'Biquad', parameters: { type: 'Peaking', freq: 200, q: 1.0, gain: 0 } },
        F3: { type: 'Biquad', parameters: { type: 'Peaking', freq: 300, q: 1.0, gain: 0 } },
        F4: { type: 'Biquad', parameters: { type: 'Peaking', freq: 400, q: 1.0, gain: 0 } },
        F5: { type: 'Biquad', parameters: { type: 'Peaking', freq: 500, q: 1.0, gain: 0 } },
        F6: { type: 'Biquad', parameters: { type: 'Peaking', freq: 600, q: 1.0, gain: 0 } },
      },
      mixers: {},
      pipeline: [
        {
          type: 'Filter',
          channels: [0],
          names: ['F1', 'F2', 'F4', 'F6'], // F3 and F5 disabled
        },
      ],
    };
    
    // Mock overlay: F3 was disabled at index 2, then F5 at index 4
    vi.spyOn(disabledFiltersOverlay, 'getDisabledFiltersForStep').mockReturnValue([
      { filterName: 'F3', stepKey: 'Filter:ch0:idx0', index: 2 },
      { filterName: 'F5', stepKey: 'Filter:ch0:idx0', index: 4 },
    ]);
    
    const blocks = buildPipelineViewModel(config);
    
    const filterBlock = blocks[0];
    if (filterBlock.kind === 'filter') {
      expect(filterBlock.filters).toHaveLength(6);
      // Expected order: [F1, F2, F3, F4, F5, F6] with F3 and F5 disabled
      expect(filterBlock.filters[0]).toMatchObject({ name: 'F1', disabled: false });
      expect(filterBlock.filters[1]).toMatchObject({ name: 'F2', disabled: false });
      expect(filterBlock.filters[2]).toMatchObject({ name: 'F3', disabled: true });
      expect(filterBlock.filters[3]).toMatchObject({ name: 'F4', disabled: false });
      expect(filterBlock.filters[4]).toMatchObject({ name: 'F5', disabled: true });
      expect(filterBlock.filters[5]).toMatchObject({ name: 'F6', disabled: false });
    }
    
    vi.restoreAllMocks();
  });
});
