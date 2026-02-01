/**
 * Tests for mixer routing validation
 */

import { describe, it, expect } from 'vitest';
import { validateMixerRouting } from '../mixerRoutingValidation';
import type { MixerDefinition } from '../camillaDSP';

describe('mixerRoutingValidation', () => {
  describe('validateMixerRouting', () => {
    it('validates valid passthrough mixer (no errors or warnings)', () => {
      const mixer: MixerDefinition = {
        channels: { in: 2, out: 2 },
        mapping: [
          {
            dest: 0,
            sources: [{ channel: 0, gain: 0, inverted: false, mute: false, scale: 'dB' }],
            mute: false,
          },
          {
            dest: 1,
            sources: [{ channel: 1, gain: 0, inverted: false, mute: false, scale: 'dB' }],
            mute: false,
          },
        ],
      };

      const result = validateMixerRouting(mixer);

      expect(result.valid).toBe(true);
      expect(result.perDest).toHaveLength(2);
      expect(result.perDest[0].errors).toHaveLength(0);
      expect(result.perDest[0].warnings).toHaveLength(0);
      expect(result.perDest[1].errors).toHaveLength(0);
      expect(result.perDest[1].warnings).toHaveLength(0);
    });

    it('detects silent channel loss (no unmuted sources)', () => {
      const mixer: MixerDefinition = {
        channels: { in: 2, out: 2 },
        mapping: [
          {
            dest: 0,
            sources: [
              { channel: 0, gain: 0, inverted: false, mute: true, scale: 'dB' },
              { channel: 1, gain: 0, inverted: false, mute: true, scale: 'dB' },
            ],
            mute: false,
          },
          {
            dest: 1,
            sources: [{ channel: 1, gain: 0, inverted: false, mute: false, scale: 'dB' }],
            mute: false,
          },
        ],
      };

      const result = validateMixerRouting(mixer);

      expect(result.valid).toBe(false);
      expect(result.perDest[0].errors).toHaveLength(1);
      expect(result.perDest[0].errors[0]).toContain('Silent channel');
      expect(result.perDest[1].errors).toHaveLength(0);
    });

    it('allows muted destination with no sources', () => {
      const mixer: MixerDefinition = {
        channels: { in: 2, out: 2 },
        mapping: [
          {
            dest: 0,
            sources: [],
            mute: true, // Dest is muted, so no sources is OK
          },
          {
            dest: 1,
            sources: [{ channel: 1, gain: 0, inverted: false, mute: false, scale: 'dB' }],
            mute: false,
          },
        ],
      };

      const result = validateMixerRouting(mixer);

      expect(result.valid).toBe(true);
      expect(result.perDest[0].errors).toHaveLength(0);
    });

    it('warns about summing (>1 unmuted source)', () => {
      const mixer: MixerDefinition = {
        channels: { in: 4, out: 2 },
        mapping: [
          {
            dest: 0,
            sources: [
              { channel: 0, gain: -6, inverted: false, mute: false, scale: 'dB' },
              { channel: 2, gain: -6, inverted: false, mute: false, scale: 'dB' },
            ],
            mute: false,
          },
          {
            dest: 1,
            sources: [{ channel: 1, gain: 0, inverted: false, mute: false, scale: 'dB' }],
            mute: false,
          },
        ],
      };

      const result = validateMixerRouting(mixer);

      expect(result.valid).toBe(true);
      expect(result.perDest[0].warnings).toHaveLength(1);
      expect(result.perDest[0].warnings[0]).toContain('Summing 2 sources');
      expect(result.perDest[1].warnings).toHaveLength(0);
    });

    it('warns about summing with gain > 0 dB', () => {
      const mixer: MixerDefinition = {
        channels: { in: 4, out: 2 },
        mapping: [
          {
            dest: 0,
            sources: [
              { channel: 0, gain: 3, inverted: false, mute: false, scale: 'dB' },
              { channel: 2, gain: -6, inverted: false, mute: false, scale: 'dB' },
            ],
            mute: false,
          },
          {
            dest: 1,
            sources: [{ channel: 1, gain: 0, inverted: false, mute: false, scale: 'dB' }],
            mute: false,
          },
        ],
      };

      const result = validateMixerRouting(mixer);

      expect(result.valid).toBe(true);
      expect(result.perDest[0].warnings).toHaveLength(2);
      expect(result.perDest[0].warnings[0]).toContain('Summing 2 sources');
      expect(result.perDest[0].warnings[1]).toContain('gain > 0 dB');
    });

    it('handles empty mapping gracefully', () => {
      const mixer: MixerDefinition = {
        channels: { in: 2, out: 2 },
        mapping: [],
      };

      const result = validateMixerRouting(mixer);

      expect(result.valid).toBe(true);
      expect(result.perDest).toHaveLength(0);
    });

    it('handles mixer without mapping', () => {
      const mixer: MixerDefinition = {
        channels: { in: 2, out: 2 },
      } as any;

      const result = validateMixerRouting(mixer);

      expect(result.valid).toBe(true);
      expect(result.perDest).toHaveLength(0);
    });

    it('ignores muted sources when counting for summing warning', () => {
      const mixer: MixerDefinition = {
        channels: { in: 4, out: 2 },
        mapping: [
          {
            dest: 0,
            sources: [
              { channel: 0, gain: 0, inverted: false, mute: false, scale: 'dB' },
              { channel: 2, gain: 0, inverted: false, mute: true, scale: 'dB' }, // Muted
            ],
            mute: false,
          },
        ],
      };

      const result = validateMixerRouting(mixer);

      expect(result.valid).toBe(true);
      expect(result.perDest[0].warnings).toHaveLength(0); // No summing warning (only 1 unmuted)
    });
  });
});
