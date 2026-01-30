import { describe, it, expect } from 'vitest';
import {
  isBiquadFilter,
  isGainFilter,
  isGainCapable,
  normalizePipelineStep,
  type BiquadFilterDefinition,
  type GainFilterDefinition,
} from '../camillaTypes';

describe('camillaTypes', () => {
  describe('Type guards', () => {
    it('should identify biquad filters', () => {
      const biquad: BiquadFilterDefinition = {
        type: 'Biquad',
        parameters: {
          type: 'Peaking',
          freq: 1000,
          q: 1.0,
          gain: 3.0,
        },
      };

      expect(isBiquadFilter(biquad)).toBe(true);
      expect(isGainFilter(biquad)).toBe(false);
    });

    it('should identify gain filters', () => {
      const gain: GainFilterDefinition = {
        type: 'Gain',
        parameters: {
          gain: 6.0,
        },
      };

      expect(isGainFilter(gain)).toBe(true);
      expect(isBiquadFilter(gain)).toBe(false);
    });

    it('should identify gain-capable biquad types', () => {
      expect(isGainCapable('Peaking')).toBe(true);
      expect(isGainCapable('Highshelf')).toBe(true);
      expect(isGainCapable('Lowshelf')).toBe(true);
      expect(isGainCapable('Notch')).toBe(true);
      
      expect(isGainCapable('HighPass')).toBe(false);
      expect(isGainCapable('LowPass')).toBe(false);
      expect(isGainCapable('Bandpass')).toBe(false);
      expect(isGainCapable('Allpass')).toBe(false);
    });
  });

  describe('normalizePipelineStep', () => {
    it('should normalize v2 channel to v3 channels array', () => {
      const v2Step = {
        type: 'Filter',
        channel: 0,
        names: ['Filter1'],
      };

      const normalized = normalizePipelineStep(v2Step);

      expect(normalized).toEqual({
        type: 'Filter',
        channels: [0],
        names: ['Filter1'],
        bypassed: undefined,
      });
    });

    it('should keep v3 channels array unchanged', () => {
      const v3Step = {
        type: 'Filter',
        channels: [0, 1],
        names: ['Filter1', 'Filter2'],
      };

      const normalized = normalizePipelineStep(v3Step);

      expect(normalized).toEqual({
        type: 'Filter',
        channels: [0, 1],
        names: ['Filter1', 'Filter2'],
        bypassed: undefined,
      });
    });

    it('should handle bypassed flag', () => {
      const step = {
        type: 'Filter',
        channels: [0],
        names: ['Filter1'],
        bypassed: true,
      };

      const normalized = normalizePipelineStep(step);

      expect(normalized?.bypassed).toBe(true);
    });

    it('should handle Mixer steps with name', () => {
      const step = {
        type: 'Mixer',
        name: 'MainMixer',
        channels: [0, 1],
      };

      const normalized = normalizePipelineStep(step);

      expect(normalized).toEqual({
        type: 'Mixer',
        name: 'MainMixer',
        channels: [0, 1],
        bypassed: undefined,
      });
    });

    it('should handle Processor steps with name', () => {
      const step = {
        type: 'Processor',
        name: 'Compressor',
        channel: 0,
      };

      const normalized = normalizePipelineStep(step);

      expect(normalized).toEqual({
        type: 'Processor',
        name: 'Compressor',
        channels: [0],
        bypassed: undefined,
      });
    });

    it('should return null for malformed steps', () => {
      expect(normalizePipelineStep(null)).toBeNull();
      expect(normalizePipelineStep(undefined)).toBeNull();
      expect(normalizePipelineStep('string')).toBeNull();
      expect(normalizePipelineStep(123)).toBeNull();
    });

    it('should handle steps without channel info', () => {
      const step = {
        type: 'Filter',
        names: ['Filter1'],
      };

      const normalized = normalizePipelineStep(step);

      expect(normalized).toEqual({
        type: 'Filter',
        names: ['Filter1'],
        channels: undefined,
        bypassed: undefined,
      });
    });

    it('should prefer v3 channels if both formats present', () => {
      const mixedStep = {
        type: 'Filter',
        channel: 0,
        channels: [1, 2],
        names: ['Filter1'],
      };

      const normalized = normalizePipelineStep(mixedStep);

      expect(normalized?.channels).toEqual([1, 2]);
    });
  });
});
