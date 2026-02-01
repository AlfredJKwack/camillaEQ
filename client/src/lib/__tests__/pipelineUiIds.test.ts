/**
 * Pipeline UI identity tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getBlockId, resetIdProvider } from '../pipelineUiIds';
import { markFilterDisabled, markFilterEnabled, clearDisabledFilters } from '../disabledFiltersOverlay';
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

  it('generates stable IDs based on step signatures', () => {
    const step0 = mockConfig.pipeline[0];
    const step1 = mockConfig.pipeline[1];

    const id0 = getBlockId(step0, 0, mockConfig);
    const id1 = getBlockId(step1, 1, mockConfig);

    // IDs should be stable and based on content signature
    expect(id0).toMatch(/^block_\d+_Mixer:preamp$/);
    expect(id1).toMatch(/^block_\d+_Filter:0:HPF$/);
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

    // IDs should remain stable because signature is based on content, not position
    expect(id0_after).toBe(id0_before);
    expect(id1_after).toBe(id1_before);
  });

  it('maintains stable IDs across config clones with same content', () => {
    const step = mockConfig.pipeline[0];

    // Get ID with first config
    const id1 = getBlockId(step, 0, mockConfig);

    // Simulate config clone (different object reference, same content)
    const clonedConfig: CamillaDSPConfig = JSON.parse(JSON.stringify(mockConfig));
    const clonedStep = clonedConfig.pipeline[0];

    // Get ID with cloned config
    const id2 = getBlockId(clonedStep, 0, clonedConfig);

    // IDs should be the same because content signature matches
    expect(id1).toBe(id2);
  });

  it('handles steps without name property', () => {
    const filterStep = mockConfig.pipeline[1];

    const id = getBlockId(filterStep, 1, mockConfig);

    // Should generate ID based on channels and names
    expect(id).toMatch(/^block_\d+_Filter:0:HPF$/);
  });

  describe('stable blockId across enable/disable', () => {
    beforeEach(() => {
      clearDisabledFilters();
      // Note: We intentionally do NOT reset the ID provider here,
      // because we want to test that the same signature gets the same ID
    });

    afterEach(() => {
      clearDisabledFilters();
      resetIdProvider(); // Clean up after test
    });

    it('maintains same blockId when filter is disabled and re-enabled', () => {
      // Setup: Filter step with multiple filters
      mockConfig.pipeline = [
        { type: 'Filter', channels: [0], names: ['FilterA', 'FilterB', 'FilterC'] },
      ];

      const step = mockConfig.pipeline[0];

      // Get initial blockId
      const idBefore = getBlockId(step, 0, mockConfig);
      expect(idBefore).toMatch(/^block_\d+_Filter:0:FilterA,FilterB,FilterC$/);

      // Disable FilterB (simulate what disableFilter() does)
      markFilterDisabled('FilterB', 'Filter:ch0:idx0', 1);
      const stepAfterDisable = { type: 'Filter', channels: [0], names: ['FilterA', 'FilterC'] };
      mockConfig.pipeline = [stepAfterDisable];

      // Get blockId after disable - should be SAME because signature includes disabled filters
      const idAfterDisable = getBlockId(stepAfterDisable, 0, mockConfig);
      expect(idAfterDisable).toBe(idBefore);

      // Re-enable FilterB (simulate what enableFilter() does)
      markFilterEnabled('FilterB');
      const stepAfterEnable = { type: 'Filter', channels: [0], names: ['FilterA', 'FilterB', 'FilterC'] };
      mockConfig.pipeline = [stepAfterEnable];

      // Get blockId after re-enable - should STILL be same
      const idAfterEnable = getBlockId(stepAfterEnable, 0, mockConfig);
      expect(idAfterEnable).toBe(idBefore);
    });

    it('blockId changes when filter is actually removed (not just disabled)', () => {
      // Setup: Filter step with multiple filters
      mockConfig.pipeline = [
        { type: 'Filter', channels: [0], names: ['FilterA', 'FilterB', 'FilterC'] },
      ];

      const step = mockConfig.pipeline[0];

      // Get initial blockId
      const idBefore = getBlockId(step, 0, mockConfig);

      // Actually remove FilterB (not disabled, just removed)
      const stepAfterRemoval = { type: 'Filter', channels: [0], names: ['FilterA', 'FilterC'] };
      mockConfig.pipeline = [stepAfterRemoval];
      resetIdProvider(); // Force new ID generation

      // Get blockId after removal - should be DIFFERENT
      const idAfterRemoval = getBlockId(stepAfterRemoval, 0, mockConfig);
      expect(idAfterRemoval).not.toBe(idBefore);
      expect(idAfterRemoval).toMatch(/^block_\d+_Filter:0:FilterA,FilterC$/);
    });
  });
});
