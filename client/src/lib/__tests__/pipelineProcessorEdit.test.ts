/**
 * Tests for processor parameter editing helpers
 */

import { describe, it, expect } from 'vitest';
import {
  setProcessorStepBypassed,
  setCompressorParam,
  setNoiseGateParam,
} from '../pipelineProcessorEdit';
import type { CamillaDSPConfig } from '../camillaDSP';

describe('pipelineProcessorEdit', () => {
  // Helper to create minimal test config
  function createTestConfig(): CamillaDSPConfig {
    return {
      devices: {
        capture: { channels: 2 },
        playback: { channels: 2 },
      },
      filters: {},
      mixers: {},
      pipeline: [
        {
          type: 'Processor',
          name: 'comp1',
          bypassed: false,
        },
        {
          type: 'Processor',
          name: 'gate1',
          bypassed: false,
        },
      ],
      processors: {
        comp1: {
          type: 'Compressor',
          parameters: {
            channels: 2,
            threshold: -20,
            factor: 2,
            attack: 0.01,
            release: 0.1,
          },
        },
        gate1: {
          type: 'NoiseGate',
          parameters: {
            channels: 2,
            threshold: -50,
            attenuation: -60,
            attack: 0.01,
            release: 0.1,
          },
        },
      },
    };
  }

  describe('setProcessorStepBypassed', () => {
    it('sets processor step bypass state to true', () => {
      const config = createTestConfig();
      const updated = setProcessorStepBypassed(config, 0, true);

      expect(updated.pipeline[0].bypassed).toBe(true);
      // Original unchanged
      expect(config.pipeline[0].bypassed).toBe(false);
    });

    it('sets processor step bypass state to false', () => {
      const config = createTestConfig();
      config.pipeline[0].bypassed = true;

      const updated = setProcessorStepBypassed(config, 0, false);

      expect(updated.pipeline[0].bypassed).toBe(false);
    });

    it('throws error for non-processor step', () => {
      const config = createTestConfig();
      config.pipeline[0] = { type: 'Filter', channels: [0], names: [] };

      expect(() => setProcessorStepBypassed(config, 0, true)).toThrow(
        'Pipeline step 0 is not a Processor step'
      );
    });
  });

  describe('setCompressorParam', () => {
    it('sets threshold parameter', () => {
      const config = createTestConfig();
      const updated = setCompressorParam(config, 'comp1', 'threshold', -30);

      expect(updated.processors!.comp1.parameters.threshold).toBe(-30);
      // Original unchanged
      expect(config.processors!.comp1.parameters.threshold).toBe(-20);
    });

    it('sets attack parameter (clamped to >= 0)', () => {
      const config = createTestConfig();
      const updated = setCompressorParam(config, 'comp1', 'attack', 0.05);

      expect(updated.processors!.comp1.parameters.attack).toBe(0.05);
    });

    it('clamps negative attack to 0', () => {
      const config = createTestConfig();
      const updated = setCompressorParam(config, 'comp1', 'attack', -0.1);

      expect(updated.processors!.comp1.parameters.attack).toBe(0);
    });

    it('sets release parameter (clamped to >= 0)', () => {
      const config = createTestConfig();
      const updated = setCompressorParam(config, 'comp1', 'release', 0.5);

      expect(updated.processors!.comp1.parameters.release).toBe(0.5);
    });

    it('sets factor parameter (clamped to >= 1)', () => {
      const config = createTestConfig();
      const updated = setCompressorParam(config, 'comp1', 'factor', 5);

      expect(updated.processors!.comp1.parameters.factor).toBe(5);
    });

    it('clamps factor below 1 to 1', () => {
      const config = createTestConfig();
      const updated = setCompressorParam(config, 'comp1', 'factor', 0.5);

      expect(updated.processors!.comp1.parameters.factor).toBe(1);
    });

    it('sets channels parameter (clamped to integer >= 1)', () => {
      const config = createTestConfig();
      const updated = setCompressorParam(config, 'comp1', 'channels', 4);

      expect(updated.processors!.comp1.parameters.channels).toBe(4);
    });

    it('floors channels to integer', () => {
      const config = createTestConfig();
      const updated = setCompressorParam(config, 'comp1', 'channels', 3.7);

      expect(updated.processors!.comp1.parameters.channels).toBe(3);
    });

    it('sets makeup_gain parameter (no clamping)', () => {
      const config = createTestConfig();
      config.processors!.comp1.parameters.makeup_gain = 0;

      const updated = setCompressorParam(config, 'comp1', 'makeup_gain', 6);

      expect(updated.processors!.comp1.parameters.makeup_gain).toBe(6);
    });

    it('throws error for non-existent processor', () => {
      const config = createTestConfig();

      expect(() => setCompressorParam(config, 'nonexistent', 'threshold', -30)).toThrow(
        'Processor "nonexistent" not found'
      );
    });

    it('throws error for wrong processor type', () => {
      const config = createTestConfig();

      expect(() => setCompressorParam(config, 'gate1', 'threshold', -30)).toThrow(
        'Processor "gate1" is not a Compressor'
      );
    });
  });

  describe('setNoiseGateParam', () => {
    it('sets threshold parameter', () => {
      const config = createTestConfig();
      const updated = setNoiseGateParam(config, 'gate1', 'threshold', -40);

      expect(updated.processors!.gate1.parameters.threshold).toBe(-40);
      // Original unchanged
      expect(config.processors!.gate1.parameters.threshold).toBe(-50);
    });

    it('sets attenuation parameter', () => {
      const config = createTestConfig();
      const updated = setNoiseGateParam(config, 'gate1', 'attenuation', -80);

      expect(updated.processors!.gate1.parameters.attenuation).toBe(-80);
    });

    it('sets attack parameter (clamped to >= 0)', () => {
      const config = createTestConfig();
      const updated = setNoiseGateParam(config, 'gate1', 'attack', 0.02);

      expect(updated.processors!.gate1.parameters.attack).toBe(0.02);
    });

    it('clamps negative attack to 0', () => {
      const config = createTestConfig();
      const updated = setNoiseGateParam(config, 'gate1', 'attack', -0.05);

      expect(updated.processors!.gate1.parameters.attack).toBe(0);
    });

    it('sets release parameter (clamped to >= 0)', () => {
      const config = createTestConfig();
      const updated = setNoiseGateParam(config, 'gate1', 'release', 0.3);

      expect(updated.processors!.gate1.parameters.release).toBe(0.3);
    });

    it('sets channels parameter (clamped to integer >= 1)', () => {
      const config = createTestConfig();
      const updated = setNoiseGateParam(config, 'gate1', 'channels', 4);

      expect(updated.processors!.gate1.parameters.channels).toBe(4);
    });

    it('floors channels to integer', () => {
      const config = createTestConfig();
      const updated = setNoiseGateParam(config, 'gate1', 'channels', 2.9);

      expect(updated.processors!.gate1.parameters.channels).toBe(2);
    });

    it('throws error for non-existent processor', () => {
      const config = createTestConfig();

      expect(() => setNoiseGateParam(config, 'nonexistent', 'threshold', -40)).toThrow(
        'Processor "nonexistent" not found'
      );
    });

    it('throws error for wrong processor type', () => {
      const config = createTestConfig();

      expect(() => setNoiseGateParam(config, 'comp1', 'threshold', -40)).toThrow(
        'Processor "comp1" is not a NoiseGate'
      );
    });
  });

  describe('immutability', () => {
    it('does not mutate original config', () => {
      const config = createTestConfig();
      const original = JSON.parse(JSON.stringify(config));

      setProcessorStepBypassed(config, 0, true);
      setCompressorParam(config, 'comp1', 'threshold', -30);
      setNoiseGateParam(config, 'gate1', 'attenuation', -70);

      expect(config).toEqual(original);
    });
  });
});
