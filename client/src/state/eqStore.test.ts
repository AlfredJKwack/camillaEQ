import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
  bands,
  selectedBandIndex,
  setBandFreq,
  setBandGain,
  setBandQ,
  toggleBandEnabled,
  selectBand,
} from './eqStore';

describe('eqStore', () => {
  beforeEach(() => {
    // Reset to initial state before each test
    bands.set([
      { enabled: true, type: 'Peaking', freq: 1000, gain: 0, q: 1.0 },
      { enabled: true, type: 'Peaking', freq: 5000, gain: -3, q: 2.0 },
    ]);
    selectedBandIndex.set(null);
  });

  describe('setBandFreq', () => {
    it('updates frequency and rounds to nearest Hz', () => {
      setBandFreq(0, 1234.56);
      expect(get(bands)[0].freq).toBe(1235);
    });

    it('clamps frequency to minimum 20 Hz', () => {
      setBandFreq(0, 10);
      expect(get(bands)[0].freq).toBe(20);
    });

    it('clamps frequency to maximum 20000 Hz', () => {
      setBandFreq(0, 25000);
      expect(get(bands)[0].freq).toBe(20000);
    });

    it('does not affect other band parameters', () => {
      const original = get(bands)[0];
      setBandFreq(0, 2000);
      const updated = get(bands)[0];
      
      expect(updated.gain).toBe(original.gain);
      expect(updated.q).toBe(original.q);
      expect(updated.enabled).toBe(original.enabled);
      expect(updated.type).toBe(original.type);
    });
  });

  describe('setBandGain', () => {
    it('updates gain and rounds to 1 decimal', () => {
      setBandGain(0, 3.456);
      expect(get(bands)[0].gain).toBe(3.5);
    });

    it('clamps gain to minimum -24 dB', () => {
      setBandGain(0, -30);
      expect(get(bands)[0].gain).toBe(-24);
    });

    it('clamps gain to maximum +24 dB', () => {
      setBandGain(0, 30);
      expect(get(bands)[0].gain).toBe(24);
    });

    it('handles negative gain rounding correctly', () => {
      setBandGain(0, -5.67);
      expect(get(bands)[0].gain).toBe(-5.7);
    });
  });

  describe('setBandQ', () => {
    it('updates Q and rounds to 1 decimal', () => {
      setBandQ(0, 1.456);
      expect(get(bands)[0].q).toBe(1.5);
    });

    it('clamps Q to minimum 0.1', () => {
      setBandQ(0, 0.05);
      expect(get(bands)[0].q).toBe(0.1);
    });

    it('clamps Q to maximum 10', () => {
      setBandQ(0, 15);
      expect(get(bands)[0].q).toBe(10);
    });

    it('handles Q values at boundaries', () => {
      setBandQ(0, 0.1);
      expect(get(bands)[0].q).toBe(0.1);
      
      setBandQ(0, 10);
      expect(get(bands)[0].q).toBe(10);
    });
  });

  describe('toggleBandEnabled', () => {
    it('toggles enabled from true to false', () => {
      expect(get(bands)[0].enabled).toBe(true);
      toggleBandEnabled(0);
      expect(get(bands)[0].enabled).toBe(false);
    });

    it('toggles enabled from false to true', () => {
      toggleBandEnabled(0);
      expect(get(bands)[0].enabled).toBe(false);
      toggleBandEnabled(0);
      expect(get(bands)[0].enabled).toBe(true);
    });

    it('only affects the specified band', () => {
      toggleBandEnabled(0);
      expect(get(bands)[0].enabled).toBe(false);
      expect(get(bands)[1].enabled).toBe(true);
    });
  });

  describe('selectBand', () => {
    it('sets selected band index', () => {
      selectBand(1);
      expect(get(selectedBandIndex)).toBe(1);
    });

    it('can deselect by setting null', () => {
      selectBand(1);
      expect(get(selectedBandIndex)).toBe(1);
      
      selectBand(null);
      expect(get(selectedBandIndex)).toBe(null);
    });
  });

  describe('immutability', () => {
    it('creates new array on update', () => {
      const originalArray = get(bands);
      setBandFreq(0, 2000);
      const updatedArray = get(bands);
      
      expect(updatedArray).not.toBe(originalArray);
    });

    it('creates new band object on update', () => {
      const originalBand = get(bands)[0];
      setBandGain(0, 5);
      const updatedBand = get(bands)[0];
      
      expect(updatedBand).not.toBe(originalBand);
    });
  });
});
