import { describe, it, expect } from 'vitest';
import {
  isKnownProcessorType,
  isKnownEditableFilter,
  getFilterNotEditableReason,
} from '../knownTypes';

describe('knownTypes', () => {
  describe('isKnownProcessorType', () => {
    it('should return true for Compressor', () => {
      expect(isKnownProcessorType('Compressor')).toBe(true);
    });

    it('should return true for NoiseGate', () => {
      expect(isKnownProcessorType('NoiseGate')).toBe(true);
    });

    it('should return false for unknown processor type', () => {
      expect(isKnownProcessorType('Limiter')).toBe(false);
      expect(isKnownProcessorType('Unknown')).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isKnownProcessorType(undefined)).toBe(false);
    });
  });

  describe('isKnownEditableFilter', () => {
    it('should return true for known Biquad types', () => {
      expect(
        isKnownEditableFilter({
          type: 'Biquad',
          parameters: { type: 'Peaking', freq: 1000, q: 1.0, gain: 0 },
        })
      ).toBe(true);

      expect(
        isKnownEditableFilter({
          type: 'Biquad',
          parameters: { type: 'Highpass', freq: 100, q: 0.707 },
        })
      ).toBe(true);

      expect(
        isKnownEditableFilter({
          type: 'Biquad',
          parameters: { type: 'Lowpass', freq: 10000, q: 0.707 },
        })
      ).toBe(true);
    });

    it('should return true for PascalCase variants', () => {
      expect(
        isKnownEditableFilter({
          type: 'Biquad',
          parameters: { type: 'HighShelf', freq: 8000, q: 0.707, gain: 3 },
        })
      ).toBe(true);

      expect(
        isKnownEditableFilter({
          type: 'Biquad',
          parameters: { type: 'LowShelf', freq: 200, q: 0.707, gain: -2 },
        })
      ).toBe(true);
    });

    it('should return false for non-Biquad filters', () => {
      expect(
        isKnownEditableFilter({
          type: 'Conv',
          parameters: { filename: 'impulse.wav' },
        })
      ).toBe(false);

      expect(
        isKnownEditableFilter({
          type: 'Delay',
          parameters: { delay: 100 },
        })
      ).toBe(false);
    });

    it('should return false for unknown Biquad subtypes', () => {
      expect(
        isKnownEditableFilter({
          type: 'Biquad',
          parameters: { type: 'UnknownType', freq: 1000, q: 1.0 },
        })
      ).toBe(false);
    });

    it('should return false for missing type parameter', () => {
      expect(
        isKnownEditableFilter({
          type: 'Biquad',
          parameters: { freq: 1000, q: 1.0 },
        })
      ).toBe(false);
    });

    it('should return false for null or missing definition', () => {
      expect(isKnownEditableFilter(null)).toBe(false);
      expect(isKnownEditableFilter(undefined)).toBe(false);
      expect(isKnownEditableFilter({})).toBe(false);
    });
  });

  describe('getFilterNotEditableReason', () => {
    it('should return reason for non-Biquad filter', () => {
      const reason = getFilterNotEditableReason({
        type: 'Conv',
        parameters: {},
      });
      expect(reason).toContain('Unsupported filter type');
      expect(reason).toContain('Conv');
    });

    it('should return reason for missing Biquad type', () => {
      const reason = getFilterNotEditableReason({
        type: 'Biquad',
        parameters: {},
      });
      expect(reason).toBe('Biquad type not specified');
    });

    it('should return reason for unknown Biquad subtype', () => {
      const reason = getFilterNotEditableReason({
        type: 'Biquad',
        parameters: { type: 'UnknownSubtype' },
      });
      expect(reason).toContain('Unsupported Biquad subtype');
      expect(reason).toContain('UnknownSubtype');
    });

    it('should return reason for missing definition', () => {
      const reason = getFilterNotEditableReason(null);
      expect(reason).toBe('Filter definition missing');
    });
  });
});
