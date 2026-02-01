/**
 * Tests for pipeline filter editing utilities
 */

import { describe, it, expect } from 'vitest';
import {
  setBiquadFreq,
  setBiquadQ,
  setBiquadGain,
  removeFilterFromStep,
  removeFilterDefinitionIfOrphaned,
} from '../pipelineFilterEdit';
import type { CamillaDSPConfig } from '../camillaDSP';

// Helper to create a minimal valid config
function createTestConfig(): CamillaDSPConfig {
  return {
    devices: {
      capture: { channels: 2 },
      playback: { channels: 2 },
    },
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
          type: 'Highpass',
          freq: 80,
          q: 0.7,
        },
      },
    },
    mixers: {},
    pipeline: [
      {
        type: 'Filter',
        channels: [0],
        names: ['EQ1', 'EQ2'],
      },
    ],
  };
}

describe('pipelineFilterEdit', () => {
  describe('setBiquadFreq', () => {
    it('should update filter frequency with clamping', () => {
      const config = createTestConfig();
      const updated = setBiquadFreq(config, 'EQ1', 2000);
      
      expect(updated.filters['EQ1'].parameters.freq).toBe(2000);
      // Original config should not be mutated
      expect(config.filters['EQ1'].parameters.freq).toBe(1000);
    });

    it('should clamp frequency to 20-20000 Hz', () => {
      const config = createTestConfig();
      
      const low = setBiquadFreq(config, 'EQ1', 10);
      expect(low.filters['EQ1'].parameters.freq).toBe(20);
      
      const high = setBiquadFreq(config, 'EQ1', 30000);
      expect(high.filters['EQ1'].parameters.freq).toBe(20000);
    });

    it('should throw if filter does not exist', () => {
      const config = createTestConfig();
      expect(() => setBiquadFreq(config, 'NonExistent', 1000)).toThrow();
    });

    it('should throw if filter is not a Biquad', () => {
      const config = createTestConfig();
      config.filters['Gain1'] = {
        type: 'Gain',
        parameters: { gain: 0 },
      };
      expect(() => setBiquadFreq(config, 'Gain1', 1000)).toThrow();
    });
  });

  describe('setBiquadQ', () => {
    it('should update filter Q with clamping', () => {
      const config = createTestConfig();
      const updated = setBiquadQ(config, 'EQ1', 2.5);
      
      expect(updated.filters['EQ1'].parameters.q).toBe(2.5);
      expect(config.filters['EQ1'].parameters.q).toBe(1.0);
    });

    it('should clamp Q to 0.1-10 range', () => {
      const config = createTestConfig();
      
      const low = setBiquadQ(config, 'EQ1', 0.05);
      expect(low.filters['EQ1'].parameters.q).toBe(0.1);
      
      const high = setBiquadQ(config, 'EQ1', 15);
      expect(high.filters['EQ1'].parameters.q).toBe(10);
    });
  });

  describe('setBiquadGain', () => {
    it('should update filter gain for gain-capable types', () => {
      const config = createTestConfig();
      const updated = setBiquadGain(config, 'EQ1', 6.0);
      
      expect(updated.filters['EQ1'].parameters.gain).toBe(6.0);
      expect(config.filters['EQ1'].parameters.gain).toBe(3.0);
    });

    it('should clamp gain to ±24 dB', () => {
      const config = createTestConfig();
      
      const low = setBiquadGain(config, 'EQ1', -30);
      expect(low.filters['EQ1'].parameters.gain).toBe(-24);
      
      const high = setBiquadGain(config, 'EQ1', 30);
      expect(high.filters['EQ1'].parameters.gain).toBe(24);
    });

    it('should throw for non-gain-capable filter types', () => {
      const config = createTestConfig();
      expect(() => setBiquadGain(config, 'EQ2', 5.0)).toThrow();
    });
  });

  describe('removeFilterFromStep', () => {
    it('should remove filter from pipeline step names array', () => {
      const config = createTestConfig();
      const updated = removeFilterFromStep(config, 0, 'EQ1');
      
      const step = updated.pipeline[0] as any;
      expect(step.names).toEqual(['EQ2']);
      expect(step.names.length).toBe(1);
    });

    it('should handle removal from middle of array', () => {
      const config = createTestConfig();
      (config.pipeline[0] as any).names = ['EQ1', 'EQ2', 'EQ1']; // Duplicate for testing
      
      const updated = removeFilterFromStep(config, 0, 'EQ2');
      
      const step = updated.pipeline[0] as any;
      expect(step.names).toEqual(['EQ1', 'EQ1']);
    });

    it('should throw if step is not a Filter type', () => {
      const config = createTestConfig();
      config.pipeline.push({ type: 'Mixer', name: 'mixer1' });
      
      expect(() => removeFilterFromStep(config, 1, 'EQ1')).toThrow();
    });

    it('should throw if filter not found in step', () => {
      const config = createTestConfig();
      expect(() => removeFilterFromStep(config, 0, 'NonExistent')).toThrow();
    });
  });

  describe('removeFilterDefinitionIfOrphaned', () => {
    it('should remove filter definition when not referenced', () => {
      const config = createTestConfig();
      // Remove EQ1 from pipeline first
      (config.pipeline[0] as any).names = ['EQ2'];
      
      const updated = removeFilterDefinitionIfOrphaned(config, 'EQ1');
      
      expect(updated.filters['EQ1']).toBeUndefined();
      expect(updated.filters['EQ2']).toBeDefined();
    });

    it('should NOT remove filter definition when still referenced', () => {
      const config = createTestConfig();
      // EQ1 is still in pipeline
      
      const updated = removeFilterDefinitionIfOrphaned(config, 'EQ1');
      
      expect(updated.filters['EQ1']).toBeDefined();
    });

    it('should check all pipeline steps for references', () => {
      const config = createTestConfig();
      config.pipeline.push({
        type: 'Filter',
        channels: [1],
        names: ['EQ1'], // EQ1 referenced in second step
      });
      
      // Remove EQ1 from first step
      (config.pipeline[0] as any).names = ['EQ2'];
      
      const updated = removeFilterDefinitionIfOrphaned(config, 'EQ1');
      
      // Should still exist because referenced in step 1
      expect(updated.filters['EQ1']).toBeDefined();
    });
  });
});
