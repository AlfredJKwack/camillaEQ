/**
 * Pipeline reorder utilities tests
 */

import { describe, it, expect } from 'vitest';
import { arrayMove, reorderPipeline, reorderFilterNamesInStep } from '../pipelineReorder';
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
});
