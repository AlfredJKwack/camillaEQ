/**
 * Tests for pipeline mixer editing helpers
 */

import { describe, it, expect } from 'vitest';
import {
  setMixerSourceGain,
  toggleMixerSourceMute,
  toggleMixerSourceInverted,
  setMixerDestMute,
  addMixerSource,
  removeMixerSource,
} from '../pipelineMixerEdit';
import type { CamillaDSPConfig } from '../camillaDSP';

describe('pipelineMixerEdit', () => {
  const createTestConfig = (): CamillaDSPConfig => ({
    devices: {
      capture: { channels: 4 },
      playback: { channels: 2 },
    },
    filters: {},
    mixers: {
      testMixer: {
        channels: { in: 4, out: 2 },
        mapping: [
          {
            dest: 0,
            sources: [
              { channel: 0, gain: 0, inverted: false, mute: false, scale: 'dB' },
              { channel: 2, gain: -6, inverted: false, mute: false, scale: 'dB' },
            ],
            mute: false,
          },
          {
            dest: 1,
            sources: [
              { channel: 1, gain: 0, inverted: false, mute: false, scale: 'dB' },
            ],
            mute: false,
          },
        ],
      },
    },
    pipeline: [],
  });

  describe('setMixerSourceGain', () => {
    it('sets gain for a source', () => {
      const config = createTestConfig();
      const result = setMixerSourceGain(config, 'testMixer', 0, 1, -12);

      expect(result.mixers.testMixer.mapping[0].sources[1].gain).toBe(-12);
      // Original unchanged
      expect(config.mixers.testMixer.mapping[0].sources[1].gain).toBe(-6);
    });

    it('clamps gain to -150 dB minimum', () => {
      const config = createTestConfig();
      const result = setMixerSourceGain(config, 'testMixer', 0, 0, -200);

      expect(result.mixers.testMixer.mapping[0].sources[0].gain).toBe(-150);
    });

    it('clamps gain to +50 dB maximum', () => {
      const config = createTestConfig();
      const result = setMixerSourceGain(config, 'testMixer', 0, 0, 100);

      expect(result.mixers.testMixer.mapping[0].sources[0].gain).toBe(50);
    });

    it('throws error for non-existent mixer', () => {
      const config = createTestConfig();
      expect(() => setMixerSourceGain(config, 'nonExistent', 0, 0, -6)).toThrow();
    });

    it('throws error for non-existent destination', () => {
      const config = createTestConfig();
      expect(() => setMixerSourceGain(config, 'testMixer', 99, 0, -6)).toThrow();
    });

    it('throws error for non-existent source', () => {
      const config = createTestConfig();
      expect(() => setMixerSourceGain(config, 'testMixer', 0, 99, -6)).toThrow();
    });
  });

  describe('toggleMixerSourceMute', () => {
    it('toggles mute from false to true', () => {
      const config = createTestConfig();
      const result = toggleMixerSourceMute(config, 'testMixer', 0, 0);

      expect(result.mixers.testMixer.mapping[0].sources[0].mute).toBe(true);
      // Original unchanged
      expect(config.mixers.testMixer.mapping[0].sources[0].mute).toBe(false);
    });

    it('toggles mute from true to false', () => {
      const config = createTestConfig();
      config.mixers.testMixer.mapping[0].sources[0].mute = true;
      const result = toggleMixerSourceMute(config, 'testMixer', 0, 0);

      expect(result.mixers.testMixer.mapping[0].sources[0].mute).toBe(false);
    });
  });

  describe('toggleMixerSourceInverted', () => {
    it('toggles inverted from false to true', () => {
      const config = createTestConfig();
      const result = toggleMixerSourceInverted(config, 'testMixer', 0, 0);

      expect(result.mixers.testMixer.mapping[0].sources[0].inverted).toBe(true);
      // Original unchanged
      expect(config.mixers.testMixer.mapping[0].sources[0].inverted).toBe(false);
    });

    it('toggles inverted from true to false', () => {
      const config = createTestConfig();
      config.mixers.testMixer.mapping[0].sources[0].inverted = true;
      const result = toggleMixerSourceInverted(config, 'testMixer', 0, 0);

      expect(result.mixers.testMixer.mapping[0].sources[0].inverted).toBe(false);
    });
  });

  describe('setMixerDestMute', () => {
    it('sets destination mute to true', () => {
      const config = createTestConfig();
      const result = setMixerDestMute(config, 'testMixer', 0, true);

      expect(result.mixers.testMixer.mapping[0].mute).toBe(true);
      // Original unchanged
      expect(config.mixers.testMixer.mapping[0].mute).toBe(false);
    });

    it('sets destination mute to false', () => {
      const config = createTestConfig();
      config.mixers.testMixer.mapping[0].mute = true;
      const result = setMixerDestMute(config, 'testMixer', 0, false);

      expect(result.mixers.testMixer.mapping[0].mute).toBe(false);
    });
  });

  describe('addMixerSource', () => {
    it('adds a new source to destination', () => {
      const config = createTestConfig();
      const result = addMixerSource(config, 'testMixer', 0, 3);

      expect(result.mixers.testMixer.mapping[0].sources).toHaveLength(3);
      const newSource = result.mixers.testMixer.mapping[0].sources[2];
      expect(newSource.channel).toBe(3);
      expect(newSource.gain).toBe(0);
      expect(newSource.inverted).toBe(false);
      expect(newSource.mute).toBe(false);
      expect(newSource.scale).toBe('dB');
      // Original unchanged
      expect(config.mixers.testMixer.mapping[0].sources).toHaveLength(2);
    });

    it('throws error when adding duplicate channel', () => {
      const config = createTestConfig();
      expect(() => addMixerSource(config, 'testMixer', 0, 0)).toThrow('already exists');
    });
  });

  describe('removeMixerSource', () => {
    it('removes a source from destination', () => {
      const config = createTestConfig();
      const result = removeMixerSource(config, 'testMixer', 0, 1);

      expect(result.mixers.testMixer.mapping[0].sources).toHaveLength(1);
      expect(result.mixers.testMixer.mapping[0].sources[0].channel).toBe(0);
      // Original unchanged
      expect(config.mixers.testMixer.mapping[0].sources).toHaveLength(2);
    });

    it('throws error when removing non-existent source', () => {
      const config = createTestConfig();
      expect(() => removeMixerSource(config, 'testMixer', 0, 99)).toThrow();
    });
  });

  describe('immutability', () => {
    it('does not modify original config', () => {
      const config = createTestConfig();
      const originalJson = JSON.stringify(config);

      setMixerSourceGain(config, 'testMixer', 0, 0, -12);
      toggleMixerSourceMute(config, 'testMixer', 0, 0);
      toggleMixerSourceInverted(config, 'testMixer', 0, 0);
      setMixerDestMute(config, 'testMixer', 0, true);
      addMixerSource(config, 'testMixer', 0, 3);

      const afterJson = JSON.stringify(config);
      expect(afterJson).toBe(originalJson);
    });
  });
});
