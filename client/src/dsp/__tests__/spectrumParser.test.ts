/**
 * Unit tests for spectrum parser module
 */

import { describe, it, expect } from 'vitest';
import { parseSpectrumData, dbToLinear, decimateBins } from '../spectrumParser';

describe('spectrumParser', () => {
  describe('parseSpectrumData', () => {
    it('should parse real spectrum bins (length > 2)', () => {
      const input = [0.1, 0.2, 0.3, 0.4, 0.5];
      const result = parseSpectrumData(input);

      expect(result).toBeDefined();
      expect(result?.bins).toBeDefined();
      expect(result?.bins.length).toBe(5);
      // Should be normalized to max value (0.5)
      expect(result?.bins[4]).toBe(1.0); // Max value normalized to 1
      expect(result?.bins[0]).toBeCloseTo(0.2, 5); // 0.1/0.5 = 0.2
    });

    it('should handle legacy 2-channel peaks', () => {
      const input = [0.3, 0.4];
      const result = parseSpectrumData(input);

      expect(result).toBeDefined();
      expect(result?.bins).toBeDefined();
      expect(result?.bins.length).toBe(128); // Expanded to fake spectrum
      // Should have envelope shape
      if (result && result.bins[0] !== undefined && result.bins[64] !== undefined) {
        expect(result.bins[0]).toBeLessThan(result.bins[64]); // Center should be higher
      }
    });

    it('should return null for invalid input (not array)', () => {
      const result = parseSpectrumData('invalid');
      expect(result).toBeNull();
    });

    it('should return null for empty array', () => {
      const result = parseSpectrumData([]);
      expect(result).toBeNull();
    });

    it('should return null for single value', () => {
      const result = parseSpectrumData([0.5]);
      expect(result).toBeNull();
    });

    it('should normalize bins to [0..1] range', () => {
      const input = [2, 4, 6, 8, 10]; // Values > 1
      const result = parseSpectrumData(input);

      expect(result).toBeDefined();
      expect(result?.bins.every((v) => v >= 0 && v <= 1)).toBe(true);
      expect(result?.bins[4]).toBe(1.0); // Max value
    });

    it('should handle all-zero input', () => {
      const input = [0, 0, 0, 0];
      const result = parseSpectrumData(input);

      expect(result).toBeDefined();
      expect(result?.bins.every((v) => v === 0)).toBe(true);
    });

    it('should handle dB-scale values (negative)', () => {
      // Real CamillaDSP spectrum data in dBFS
      const input = [-88.2, -88.2, -83.5, -83.5, -82.9, -82.9, -78.7, -78.7];
      const result = parseSpectrumData(input);

      expect(result).toBeDefined();
      expect(result?.bins).toBeDefined();
      expect(result?.bins.every((v) => v >= 0 && v <= 1)).toBe(true);
      
      // With dB scale (-100 to 0 dB window):
      // -78.7 dB should be higher than -88.2 dB
      const idx78 = result?.bins[6]; // -78.7 dB
      const idx88 = result?.bins[0]; // -88.2 dB
      if (idx78 !== undefined && idx88 !== undefined) {
        expect(idx78).toBeGreaterThan(idx88);
      }
    });

    it('should detect and downmix stereo-interleaved data', () => {
      // Stereo-interleaved: pairs of identical values (L, R, L, R, ...)
      const input = [-80, -80, -85, -85, -90, -90, -88, -88];
      const result = parseSpectrumData(input);

      expect(result).toBeDefined();
      expect(result?.bins).toBeDefined();
      // Should be downmixed to half the length (4 bins)
      expect(result?.bins.length).toBe(4);
    });

    it('should NOT downmix non-interleaved data', () => {
      // Different values in pairs
      const input = [-80, -85, -82, -88, -90, -92, -88, -84];
      const result = parseSpectrumData(input);

      expect(result).toBeDefined();
      // Should keep original length (8 bins)
      expect(result?.bins.length).toBe(8);
    });

    it('should map -100 dB to near-zero and 0 dB to 1.0', () => {
      const input = [-100, -50, 0, 0]; // Mix of dB values
      const result = parseSpectrumData(input);

      expect(result).toBeDefined();
      expect(result?.bins[0]).toBeCloseTo(0, 2); // -100 dB → ~0
      expect(result?.bins[1]).toBeCloseTo(0.5, 2); // -50 dB → ~0.5
      expect(result?.bins[2]).toBeCloseTo(1.0, 2); // 0 dB → 1.0
    });

    it('should handle mixed positive/negative as linear (not dB)', () => {
      // Mixed positive/negative values should be treated as linear
      const input = [-1, 0, 1, 2];
      const result = parseSpectrumData(input);

      expect(result).toBeDefined();
      expect(result?.bins.every((v) => v >= 0 && v <= 1)).toBe(true);
      // Max is 2, so normalized: [-1/2, 0, 1/2, 1] → clamped: [0, 0, 0.5, 1]
      expect(result?.bins[3]).toBe(1.0); // Max value
    });
  });

  describe('dbToLinear', () => {
    it('should convert -60 dB to 0.0', () => {
      const result = dbToLinear(-60);
      expect(result).toBe(0.0);
    });

    it('should convert 0 dB to 1.0', () => {
      const result = dbToLinear(0);
      expect(result).toBe(1.0);
    });

    it('should convert -30 dB to 0.5', () => {
      const result = dbToLinear(-30);
      expect(result).toBe(0.5);
    });

    it('should clamp values below minDb', () => {
      const result = dbToLinear(-100, -60, 0);
      expect(result).toBe(0.0);
    });

    it('should clamp values above maxDb', () => {
      const result = dbToLinear(10, -60, 0);
      expect(result).toBe(1.0);
    });

    it('should accept custom min/max dB range', () => {
      const result = dbToLinear(-50, -100, 0);
      expect(result).toBe(0.5); // (-50 - (-100)) / (0 - (-100)) = 50/100 = 0.5
    });
  });

  describe('decimateBins', () => {
    it('should decimate bins to target count', () => {
      const input = [1, 2, 3, 4, 5, 6, 7, 8];
      const result = decimateBins(input, 4);

      expect(result.length).toBe(4);
      expect(result[0]).toBe(1.5); // Average of 1, 2
      expect(result[1]).toBe(3.5); // Average of 3, 4
      expect(result[2]).toBe(5.5); // Average of 5, 6
      expect(result[3]).toBe(7.5); // Average of 7, 8
    });

    it('should return original if target count >= input length', () => {
      const input = [1, 2, 3];
      const result = decimateBins(input, 5);

      expect(result).toEqual(input);
    });

    it('should handle exact division', () => {
      const input = [1, 2, 3, 4, 5, 6];
      const result = decimateBins(input, 3);

      expect(result.length).toBe(3);
      expect(result[0]).toBe(1.5); // Average of 1, 2
      expect(result[1]).toBe(3.5); // Average of 3, 4
      expect(result[2]).toBe(5.5); // Average of 5, 6
    });

    it('should handle non-exact division', () => {
      const input = [1, 2, 3, 4, 5];
      const result = decimateBins(input, 2);

      expect(result.length).toBe(2);
      // First bin: average of [1, 2]
      // Second bin: average of [3, 4, 5]
      expect(result[0]).toBeCloseTo(1.5, 5);
      expect(result[1]).toBeCloseTo(4, 5);
    });

    it('should handle single bin decimation', () => {
      const input = [1, 2, 3, 4, 5];
      const result = decimateBins(input, 1);

      expect(result.length).toBe(1);
      expect(result[0]).toBe(3); // Average of all values
    });
  });
});
