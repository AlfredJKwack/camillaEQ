/**
 * Tests for shared parameter clamping utilities
 */

import { describe, it, expect } from 'vitest';
import { clampFreqHz, clampGainDb, clampQ } from '../eqParamClamp';

describe('eqParamClamp', () => {
  describe('clampFreqHz', () => {
    it('should clamp frequency to 20-20000 Hz range', () => {
      expect(clampFreqHz(10)).toBe(20);
      expect(clampFreqHz(20)).toBe(20);
      expect(clampFreqHz(1000)).toBe(1000);
      expect(clampFreqHz(20000)).toBe(20000);
      expect(clampFreqHz(25000)).toBe(20000);
    });

    it('should round to nearest Hz (no decimals)', () => {
      expect(clampFreqHz(1234.56)).toBe(1235);
      expect(clampFreqHz(99.4)).toBe(99);
      expect(clampFreqHz(99.6)).toBe(100);
    });
  });

  describe('clampGainDb', () => {
    it('should clamp gain to ±24 dB range', () => {
      expect(clampGainDb(-30)).toBe(-24);
      expect(clampGainDb(-24)).toBe(-24);
      expect(clampGainDb(0)).toBe(0);
      expect(clampGainDb(24)).toBe(24);
      expect(clampGainDb(30)).toBe(24);
    });

    it('should round to 1 decimal place', () => {
      expect(clampGainDb(5.67)).toBe(5.7);
      expect(clampGainDb(5.12)).toBe(5.1);
      expect(clampGainDb(-3.46)).toBe(-3.5);
    });
  });

  describe('clampQ', () => {
    it('should clamp Q to 0.1-10 range', () => {
      expect(clampQ(0.05)).toBe(0.1);
      expect(clampQ(0.1)).toBe(0.1);
      expect(clampQ(1.0)).toBe(1.0);
      expect(clampQ(10)).toBe(10);
      expect(clampQ(15)).toBe(10);
    });

    it('should round to 1 decimal place', () => {
      expect(clampQ(2.34)).toBe(2.3);
      expect(clampQ(2.36)).toBe(2.4);
      expect(clampQ(0.77)).toBe(0.8);
    });
  });
});
