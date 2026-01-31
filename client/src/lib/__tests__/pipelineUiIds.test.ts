/**
 * Pipeline UI identity tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getBlockId, resetIdProvider } from '../pipelineUiIds';
import type { CamillaDSPConfig } from '../camillaDSP';

describe('pipelineUiIds', () => {
  let mockConfig: CamillaDSPConfig;

  beforeEach(() => {
    resetIdProvider();
    mockConfig = {
      devices: { capture: { channels: 2 }, playback: { channels: 2 } },
      filters: {},
      mixers: {},
      pipeline: [
        { type: 'Mixer', name: 'preamp' },
        { type: 'Filter', channels: [0], names: ['HPF'] },
        { type: 'Filter', channels: [1], names: ['LPF'] },
      ],
    };
  });

  it('generates stable IDs based on type, name, and index', () => {
    const step0 = mockConfig.pipeline[0];
    const step1 = mockConfig.pipeline[1];

    const id0 = getBlockId(step0, 0, mockConfig);
    const id1 = getBlockId(step1, 1, mockConfig);

    expect(id0).toBe('Mixer:preamp:0');
    expect(id1).toBe('Filter::1');
  });

  it('returns same ID when called multiple times with same step object', () => {
    const step = mockConfig.pipeline[0];

    const id1 = getBlockId(step, 0, mockConfig);
    const id2 = getBlockId(step, 0, mockConfig);
    const id3 = getBlockId(step, 0, mockConfig);

    expect(id1).toBe(id2);
    expect(id2).toBe(id3);
  });

  it('IDs remain stable across reorders (step object identity preserved)', () => {
    const step0 = mockConfig.pipeline[0];
    const step1 = mockConfig.pipeline[1];

    // Get initial IDs
    const id0_before = getBlockId(step0, 0, mockConfig);
    const id1_before = getBlockId(step1, 1, mockConfig);

    // Simulate reorder (swap positions)
    mockConfig.pipeline = [step1, step0, mockConfig.pipeline[2]];

    // Get IDs again (same objects, different indices)
    const id0_after = getBlockId(step0, 1, mockConfig); // Now at index 1
    const id1_after = getBlockId(step1, 0, mockConfig); // Now at index 0

    // IDs should be stable (based on initial index at load time)
    expect(id0_after).toBe(id0_before);
    expect(id1_after).toBe(id1_before);
  });

  it('resets IDs when config reference changes', () => {
    const step = mockConfig.pipeline[0];

    // Get ID with first config
    const id1 = getBlockId(step, 0, mockConfig);

    // Create new config (new reference)
    const newConfig: CamillaDSPConfig = {
      devices: { capture: { channels: 2 }, playback: { channels: 2 } },
      filters: {},
      mixers: {},
      pipeline: [{ type: 'Mixer', name: 'different' }],
    };

    const newStep = newConfig.pipeline[0];

    // Get ID with new config
    const id2 = getBlockId(newStep, 0, newConfig);

    // IDs should be regenerated
    expect(id2).toBe('Mixer:different:0');
  });

  it('handles steps without name property', () => {
    const filterStep = mockConfig.pipeline[1];

    const id = getBlockId(filterStep, 1, mockConfig);

    expect(id).toBe('Filter::1'); // Empty name string
  });
});
