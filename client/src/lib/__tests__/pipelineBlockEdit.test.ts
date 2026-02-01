/**
 * Tests for pipeline block add/remove helpers
 */

import { describe, it, expect } from 'vitest';
import {
  insertPipelineStep,
  removePipelineStep,
  createNewFilterStep,
  createNewMixerBlock,
  createNewProcessorBlock,
  cleanupOrphanDefinitions,
} from '../pipelineBlockEdit';
import type { CamillaDSPConfig } from '../camillaDSP';

describe('pipelineBlockEdit', () => {
  const baseConfig: CamillaDSPConfig = {
    devices: {
      capture: { channels: 2 },
      playback: { channels: 2 },
    },
    filters: {},
    mixers: {},
    pipeline: [],
    processors: {},
  };

  describe('insertPipelineStep', () => {
    it('inserts step at specified index', () => {
      const config = {
        ...baseConfig,
        pipeline: [
          { type: 'Mixer', name: 'mixer1' },
          { type: 'Filter', channels: [0], names: [] },
        ],
      };

      const newStep = { type: 'Mixer', name: 'mixer2' };
      const result = insertPipelineStep(config, 1, newStep);

      expect(result.pipeline).toHaveLength(3);
      expect(result.pipeline[1]).toEqual(newStep);
    });

    it('clamps index to valid range', () => {
      const config = { ...baseConfig, pipeline: [{ type: 'Mixer', name: 'mixer1' }] };
      const newStep = { type: 'Mixer', name: 'mixer2' };

      const result = insertPipelineStep(config, 999, newStep);
      expect(result.pipeline[result.pipeline.length - 1]).toEqual(newStep);
    });
  });

  describe('removePipelineStep', () => {
    it('removes step at specified index', () => {
      const config = {
        ...baseConfig,
        pipeline: [
          { type: 'Mixer', name: 'mixer1' },
          { type: 'Mixer', name: 'mixer2' },
        ],
      };

      const result = removePipelineStep(config, 0);
      expect(result.pipeline).toHaveLength(1);
      expect((result.pipeline[0] as any).name).toBe('mixer2');
    });

    it('throws on invalid index', () => {
      expect(() => removePipelineStep(baseConfig, 0)).toThrow('Invalid step index');
    });
  });

  describe('createNewFilterStep', () => {
    it('creates Filter step with channel 0', () => {
      const step = createNewFilterStep(baseConfig);

      expect(step.type).toBe('Filter');
      expect((step as any).channels).toEqual([0]);
      expect((step as any).names).toEqual([]);
    });
  });

  describe('createNewMixerBlock', () => {
    it('creates unique mixer name', () => {
      const config = {
        ...baseConfig,
        mixers: {
          mixer_1: { channels: { in: 2, out: 2 }, mapping: [] },
        },
      };

      const result = createNewMixerBlock(config);
      expect(result.mixerName).toBe('mixer_2');
    });

    it('creates 2→2 passthrough mixer', () => {
      const result = createNewMixerBlock(baseConfig);

      expect(result.mixerDef.channels).toEqual({ in: 2, out: 2 });
      expect(result.mixerDef.mapping).toHaveLength(2);
      expect(result.step.type).toBe('Mixer');
      expect(result.step.name).toBe(result.mixerName);
    });
  });

  describe('createNewProcessorBlock', () => {
    it('creates processor with unique name', () => {
      const config = {
        ...baseConfig,
        processors: { proc: {} },
      };

      const result = createNewProcessorBlock(config, 'Processor', 'proc');
      expect(result.processorName).toBe('proc_1');
    });

    it('creates processor definition and step', () => {
      const result = createNewProcessorBlock(baseConfig, 'Processor', 'test');

      expect(result.processorName).toBe('test');
      expect(result.processorDef).toEqual({});
      expect(result.step.type).toBe('Processor');
      expect((result.step as any).name).toBe('test');
    });
  });

  describe('cleanupOrphanDefinitions', () => {
    it('removes orphaned mixer', () => {
      const config: CamillaDSPConfig = {
        ...baseConfig,
        mixers: {
          used: { channels: { in: 2, out: 2 }, mapping: [] },
          orphaned: { channels: { in: 2, out: 2 }, mapping: [] },
        },
        pipeline: [{ type: 'Mixer', name: 'used' }],
      };

      const result = cleanupOrphanDefinitions(config);
      expect(result.mixers).toHaveProperty('used');
      expect(result.mixers).not.toHaveProperty('orphaned');
    });

    it('removes orphaned processor', () => {
      const config: CamillaDSPConfig = {
        ...baseConfig,
        processors: {
          used: {},
          orphaned: {},
        },
        pipeline: [{ type: 'Processor', name: 'used' }],
      };

      const result = cleanupOrphanDefinitions(config);
      expect(result.processors).toHaveProperty('used');
      expect(result.processors).not.toHaveProperty('orphaned');
    });

    it('removes orphaned filter', () => {
      const config: CamillaDSPConfig = {
        ...baseConfig,
        filters: {
          used: { type: 'Biquad', parameters: {} },
          orphaned: { type: 'Biquad', parameters: {} },
        },
        pipeline: [{ type: 'Filter', channels: [0], names: ['used'] }],
      };

      const result = cleanupOrphanDefinitions(config);
      expect(result.filters).toHaveProperty('used');
      expect(result.filters).not.toHaveProperty('orphaned');
    });

    it('keeps referenced definitions', () => {
      const config: CamillaDSPConfig = {
        ...baseConfig,
        mixers: { mixer1: { channels: { in: 2, out: 2 }, mapping: [] } },
        filters: { filter1: { type: 'Biquad', parameters: {} } },
        processors: { proc1: {} },
        pipeline: [
          { type: 'Mixer', name: 'mixer1' },
          { type: 'Filter', channels: [0], names: ['filter1'] },
          { type: 'Processor', name: 'proc1' },
        ],
      };

      const result = cleanupOrphanDefinitions(config);
      expect(Object.keys(result.mixers)).toEqual(['mixer1']);
      expect(Object.keys(result.filters)).toEqual(['filter1']);
      expect(Object.keys(result.processors!)).toEqual(['proc1']);
    });
  });
});
