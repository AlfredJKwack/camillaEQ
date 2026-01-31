/**
 * Unit tests for spectrum parser module - MVP-16 (dB-domain)
 */

import { describe, it, expect } from 'vitest';
import { parseSpectrumData, dbToNormalized, dbArrayToNormalized } from '../spectrumParser';

describe('spectrumParser', () => {
  describe('parseSpectrumData', () => {
    it('should return null for non-array input', () => {
      expect(parseSpectrumData(null)).toBeNull();
      expect(parseSpectrumData(undefined)).toBeNull();
      expect(parseSpectrumData({})).toBeNull();
      expect(parseSpectrumData('string')).toBeNull();
    });

    it('should return null for arrays with length < 3 (reject legacy format)', () => {
      expect(parseSpectrumData([])).toBeNull();
      expect(parseSpectrumData([0.5])).toBeNull();
      expect(parseSpectrumData([0.5, 0.6])).toBeNull();
    });

    it('should parse dBFS spectrum bins', () => {
      const input = [-100, -80, -60, -40, -20, -12];
      const result = parseSpectrumData(input);

      expect(result).toBeDefined();
      expect(result?.binsDb).toBeDefined();
      expect(result?.binsDb.length).toBe(6);
      expect(result?.binsDb).toEqual(input);
    });

    it('should accept any bin count without downmixing', () => {
      // Various bin counts should all be preserved
      const input128 = Array(128).fill(-80);
      const result128 = parseSpectrumData(input128);
      expect(result128?.binsDb.length).toBe(128);

      const input256 = Array(256).fill(-80);
      const result256 = parseSpectrumData(input256);
      expect(result256?.binsDb.length).toBe(256);

      const input512 = Array(512).fill(-80);
      const result512 = parseSpectrumData(input512);
      expect(result512?.binsDb.length).toBe(512);
    });

    it('should NOT halve bins when all values are identical (silent feed)', () => {
      // Regression test: silence (all bins at floor) should not trigger halving
      const input = Array(256).fill(-100);
      const result = parseSpectrumData(input);

      expect(result).toBeDefined();
      expect(result?.binsDb.length).toBe(256); // Should stay 256, not become 128
      expect(result?.binsDb).toEqual(input);
    });

    it('should NOT halve bins when values are very similar', () => {
      // Even if adjacent values are nearly identical, don't downmix
      const input = [-80.00, -80.01, -80.02, -80.03, -80.04, -80.05];
      const result = parseSpectrumData(input);

      expect(result).toBeDefined();
      expect(result?.binsDb.length).toBe(6); // Should stay 6
    });

    it('should return null if array contains non-numbers', () => {
      expect(parseSpectrumData([1, 2, 'three'])).toBeNull();
      expect(parseSpectrumData([1, 2, null])).toBeNull();
      expect(parseSpectrumData([1, 2, undefined])).toBeNull();
      expect(parseSpectrumData([1, 2, NaN])).toBeNull();
    });

    it('should handle typical CamillaDSP spectrum data', () => {
      const input = [-88.2, -83.5, -82.9, -78.7, -75.1, -70.3];
      const result = parseSpectrumData(input);

      expect(result).toBeDefined();
      expect(result?.binsDb).toBeDefined();
      expect(result?.binsDb.length).toBe(6);
      expect(result?.binsDb).toEqual(input);
    });
  });

  describe('dbToNormalized', () => {
    it('should convert -100 dB to 0.0 (with default range)', () => {
      const result = dbToNormalized(-100);
      expect(result).toBe(0.0);
    });

    it('should convert 0 dB to 1.0 (with default range)', () => {
      const result = dbToNormalized(0);
      expect(result).toBe(1.0);
    });

    it('should convert -50 dB to 0.5 (with default range)', () => {
      const result = dbToNormalized(-50);
      expect(result).toBe(0.5);
    });

    it('should clamp values below minDb', () => {
      const result = dbToNormalized(-120, -100, 0);
      expect(result).toBe(0.0);
    });

    it('should clamp values above maxDb', () => {
      const result = dbToNormalized(10, -100, 0);
      expect(result).toBe(1.0);
    });

    it('should accept custom min/max dB range', () => {
      const result = dbToNormalized(-50, -100, 0);
      expect(result).toBe(0.5); // (-50 - (-100)) / (0 - (-100)) = 50/100 = 0.5
    });

    it('should handle typical spectrum values', () => {
      // -12 dBFS is typical peak for music
      const result = dbToNormalized(-12, -100, 0);
      expect(result).toBeCloseTo(0.88, 2);
    });
  });

  describe('dbArrayToNormalized', () => {
    it('should convert array of dB values to normalized', () => {
      const input = [-100, -75, -50, -25, 0];
      const result = dbArrayToNormalized(input);

      expect(result.length).toBe(5);
      expect(result[0]).toBe(0.0);
      expect(result[1]).toBe(0.25);
      expect(result[2]).toBe(0.5);
      expect(result[3]).toBe(0.75);
      expect(result[4]).toBe(1.0);
    });

    it('should handle empty array', () => {
      const result = dbArrayToNormalized([]);
      expect(result).toEqual([]);
    });

    it('should use custom range if provided', () => {
      const input = [-60, -30, 0];
      const result = dbArrayToNormalized(input, -60, 0);

      expect(result[0]).toBe(0.0);
      expect(result[1]).toBe(0.5);
      expect(result[2]).toBe(1.0);
    });
  });
});
