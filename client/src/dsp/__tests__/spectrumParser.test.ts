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

    it('should detect and downmix stereo-interleaved data', () => {
      // Stereo-interleaved: pairs of identical values (L, R, L, R, ...)
      const input = [-80, -80, -85, -85, -90, -90, -88, -88];
      const result = parseSpectrumData(input);

      expect(result).toBeDefined();
      expect(result?.binsDb).toBeDefined();
      // Should be downmixed to half the length (4 bins) using max of each pair
      expect(result?.binsDb.length).toBe(4);
      expect(result?.binsDb).toEqual([-80, -85, -90, -88]);
    });

    it('should NOT downmix non-interleaved data', () => {
      // Different values in pairs (difference > 0.1 dB)
      const input = [-80, -85, -82, -88, -90, -92, -88, -84];
      const result = parseSpectrumData(input);

      expect(result).toBeDefined();
      // Should keep original length (8 bins)
      expect(result?.binsDb.length).toBe(8);
    });

    it('should downmix with max when pairs are similar', () => {
      // Pairs differ by < 0.1 dB (considered interleaved)
      const input = [-80.00, -80.05, -85.01, -85.03];
      const result = parseSpectrumData(input);

      expect(result).toBeDefined();
      // Should be downmixed (4 → 2 bins)
      expect(result?.binsDb.length).toBe(2);
      // Max of each pair
      expect(result?.binsDb[0]).toBeCloseTo(-80.00, 2);
      expect(result?.binsDb[1]).toBeCloseTo(-85.01, 2);
    });

    it('should handle typical CamillaDSP spectrum data', () => {
      const input = [-88.2, -88.2, -83.5, -83.5, -82.9, -82.9, -78.7, -78.7];
      const result = parseSpectrumData(input);

      expect(result).toBeDefined();
      expect(result?.binsDb).toBeDefined();
      // Should detect stereo interleaving and downmix to 4 bins
      expect(result?.binsDb.length).toBe(4);
      expect(result?.binsDb).toEqual([-88.2, -83.5, -82.9, -78.7]);
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
