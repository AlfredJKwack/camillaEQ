/**
 * Pipeline reorder utilities tests
 */

import { describe, it, expect } from 'vitest';
import { arrayMove, reorderPipeline, reorderFilterNamesInStep, reorderFiltersWithDisabled } from '../pipelineReorder';
import type { CamillaDSPConfig } from '../camillaDSP';

describe('pipeline Reorder', () => {
  describe('arrayMove', () => {
    it('moves element forward', () => {
      const arr = ['a', 'b', 'c', 'd'];
      const result = arrayMove(arr, 1, 3);
      expect(result).toEqual(['a', 'c', 'd', 'b']);
    });

    it('moves element backward', () => {
      const arr = ['a', 'b', 'c', 'd'];
      const result = arrayMove(arr, 3, 1);
      expect(result).toEqual(['a', 'd', 'b', 'c']);
    });

    it('no-op when from === to', () => {
      const arr = ['a', 'b', 'c'];
      const result = arrayMove(arr, 1, 1);
      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('does not mutate original array', () => {
      const arr = ['a', 'b', 'c'];
      const orig = [...arr];
      arrayMove(arr, 0, 2);
      expect(arr).toEqual(orig);
    });
  });

  describe('reorderPipeline', () => {
    it('reorders pipeline blocks', () => {
      const config: CamillaDSPConfig = {
        devices: { capture: { channels: 2 }, playback: { channels: 2 } },
        filters: {},
        mixers: {},
        pipeline: [
          { type: 'Mixer', name: 'preamp' },
          { type: 'Filter', channels: [0], names: ['HPF'] },
          { type: 'Filter', channels: [1], names: ['LPF'] },
        ],
      };

      const result = reorderPipeline(config, 0, 2);

      expect(result.pipeline).toHaveLength(3);
      expect(result.pipeline[0].type).toBe('Filter');
      expect((result.pipeline[0] as any).names).toEqual(['HPF']);
      expect(result.pipeline[1].type).toBe('Filter');
      expect(result.pipeline[2].type).toBe('Mixer');
    });

    it('does not mutate original config', () => {
      const config: CamillaDSPConfig = {
        devices: { capture: { channels: 2 }, playback: { channels: 2 } },
        filters: {},
        mixers: {},
        pipeline: [
          { type: 'Mixer', name: 'a' },
          { type: 'Mixer', name: 'b' },
        ],
      };

      const origPipelineLen = config.pipeline.length;
      const origFirstType = config.pipeline[0].type;

      reorderPipeline(config, 0, 1);

      expect(config.pipeline).toHaveLength(origPipelineLen);
      expect(config.pipeline[0].type).toBe(origFirstType);
    });
  });

  describe('reorderFilterNamesInStep', () => {
    it('reorders filter names within a Filter step', () => {
      const config: CamillaDSPConfig = {
        devices: { capture: { channels: 2 }, playback: { channels: 2 } },
        filters: {},
        mixers: {},
        pipeline: [
          { type: 'Filter', channels: [0], names: ['A', 'B', 'C'] },
        ],
      };

      const result = reorderFilterNamesInStep(config, 0, 0, 2);

      const names = (result.pipeline[0] as any).names;
      expect(names).toEqual(['B', 'C', 'A']);
    });

    it('throws error if step is not a Filter', () => {
      const config: CamillaDSPConfig = {
        devices: { capture: { channels: 2 }, playback: { channels: 2 } },
        filters: {},
        mixers: {},
        pipeline: [
          { type: 'Mixer', name: 'preamp' },
        ],
      };

      expect(() => reorderFilterNamesInStep(config, 0, 0, 1)).toThrow(
        'Invalid step index or step is not a Filter'
      );
    });

    it('throws error if step index is invalid', () => {
      const config: CamillaDSPConfig = {
        devices: { capture: { channels: 2 }, playback: { channels: 2 } },
        filters: {},
        mixers: {},
        pipeline: [],
      };

      expect(() => reorderFilterNamesInStep(config, 0, 0, 1)).toThrow(
        'Invalid step index or step is not a Filter'
      );
    });

    it('does not mutate original config', () => {
      const config: CamillaDSPConfig = {
        devices: { capture: { channels: 2 }, playback: { channels: 2 } },
        filters: {},
        mixers: {},
        pipeline: [
          { type: 'Filter', channels: [0], names: ['A', 'B'] },
        ],
      };

      const origNames = [...(config.pipeline[0] as any).names];

      reorderFilterNamesInStep(config, 0, 0, 1);

      expect((config.pipeline[0] as any).names).toEqual(origNames);
    });
  });

  describe('reorderFiltersWithDisabled', () => {
    it('handles disable 2, then drag 3 to between 4 and 5 (failing scenario)', () => {
      // Original: [1, 2, 3, 4, 5]
      // After disable 2: [1, disabled(2), 3, 4, 5] (UI display)
      // Drag 3 (index 2) to end (toIndex 4 after arrayMove semantics)
      // arrayMove(2, 4): remove at 2 → [1, disabled(2), 4, 5], insert '3' at 4 → [1, disabled(2), 4, 5, 3]
      
      const filters = [
        { name: '1', disabled: false },
        { name: '2', disabled: true },
        { name: '3', disabled: false },
        { name: '4', disabled: false },
        { name: '5', disabled: false },
      ];

      const result = reorderFiltersWithDisabled(filters, 2, 4);

      // Enabled names should be [1, 4, 5, 3] (3 goes to end)
      expect(result.enabledNames).toEqual(['1', '4', '5', '3']);
      
      // Disabled filter '2' should stay at index 1
      expect(result.disabledIndices['2']).toBe(1);
    });

    it('handles disable 4, then drag 3 to between 1 and 2 (working scenario)', () => {
      // Original: [1, 2, 3, 4, 5, 6]
      // After disable 4: [1, 2, 3, disabled(4), 5, 6] (UI display)
      // Drag 3 (index 2) to between 1 and 2 (to index 1)
      // Expected result: [1, 3, 2, disabled(4), 5, 6]
      
      const filters = [
        { name: '1', disabled: false },
        { name: '2', disabled: false },
        { name: '3', disabled: false },
        { name: '4', disabled: true },
        { name: '5', disabled: false },
        { name: '6', disabled: false },
      ];

      const result = reorderFiltersWithDisabled(filters, 2, 1);

      // Enabled names should be [1, 3, 2, 5, 6]
      expect(result.enabledNames).toEqual(['1', '3', '2', '5', '6']);
      
      // Disabled filter '4' should stay at index 3
      expect(result.disabledIndices['4']).toBe(3);
    });

    it('handles multiple disabled filters during drag', () => {
      // [1, disabled(2), disabled(3), 4, 5]
      // Drag 4 (index 3) to front (index 0)
      // After arrayMove: [4, 1, disabled(2), disabled(3), 5]
      // Expected: disabled(2) at index 2, disabled(3) at index 3
      
      const filters = [
        { name: '1', disabled: false },
        { name: '2', disabled: true },
        { name: '3', disabled: true },
        { name: '4', disabled: false },
        { name: '5', disabled: false },
      ];

      const result = reorderFiltersWithDisabled(filters, 3, 0);

      expect(result.enabledNames).toEqual(['4', '1', '5']);
      expect(result.disabledIndices['2']).toBe(2);
      expect(result.disabledIndices['3']).toBe(3);
    });

    it('handles dragging a disabled filter', () => {
      // [1, disabled(2), 3, 4]
      // Drag disabled(2) (index 1) to index 3 (after 3, before 4)
      // After arrayMove: [1, 3, 4, disabled(2)]
      // Expected: disabled(2) at index 3
      
      const filters = [
        { name: '1', disabled: false },
        { name: '2', disabled: true },
        { name: '3', disabled: false },
        { name: '4', disabled: false },
      ];

      const result = reorderFiltersWithDisabled(filters, 1, 3);

      expect(result.enabledNames).toEqual(['1', '3', '4']);
      expect(result.disabledIndices['2']).toBe(3);
    });

    it('no-op when from === to', () => {
      const filters = [
        { name: 'A', disabled: false },
        { name: 'B', disabled: true },
        { name: 'C', disabled: false },
      ];

      const result = reorderFiltersWithDisabled(filters, 1, 1);

      expect(result.enabledNames).toEqual(['A', 'C']);
      expect(result.disabledIndices['B']).toBe(1);
    });
  });
});
