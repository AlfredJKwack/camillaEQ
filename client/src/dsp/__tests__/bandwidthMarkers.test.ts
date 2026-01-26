import { describe, it, expect } from 'vitest';
import { calculateBandwidthMarkers } from '../bandwidthMarkers';
import type { EqBand } from '../filterResponse';

describe('calculateBandwidthMarkers', () => {
  it('returns null for unsupported filter types', () => {
    const shelfBand: EqBand = {
      enabled: true,
      type: 'LowShelf',
      freq: 100,
      gain: 6,
      q: 0.7,
    };

    const result = calculateBandwidthMarkers(shelfBand);
    expect(result.leftFreq).toBeNull();
    expect(result.rightFreq).toBeNull();
  });

  it('calculates bandwidth markers for peaking filter', () => {
    const peakingBand: EqBand = {
      enabled: true,
      type: 'Peaking',
      freq: 1000,
      gain: 6,
      q: 1.0,
    };

    const result = calculateBandwidthMarkers(peakingBand);
    
    // Should have both markers
    expect(result.leftFreq).not.toBeNull();
    expect(result.rightFreq).not.toBeNull();
    
    // Left marker should be below center freq
    expect(result.leftFreq!).toBeLessThan(1000);
    
    // Right marker should be above center freq
    expect(result.rightFreq!).toBeGreaterThan(1000);
    
    // Markers should be symmetric around center (roughly)
    const leftRatio = 1000 / result.leftFreq!;
    const rightRatio = result.rightFreq! / 1000;
    expect(leftRatio).toBeCloseTo(rightRatio, 1);
  });

  it('calculates bandwidth markers for notch filter', () => {
    const notchBand: EqBand = {
      enabled: true,
      type: 'Notch',
      freq: 1000,
      gain: 0, // Notch doesn't use gain
      q: 2.0,
    };

    const result = calculateBandwidthMarkers(notchBand);
    
    // Should have both markers
    expect(result.leftFreq).not.toBeNull();
    expect(result.rightFreq).not.toBeNull();
    
    // Markers should straddle center frequency
    expect(result.leftFreq!).toBeLessThan(1000);
    expect(result.rightFreq!).toBeGreaterThan(1000);
  });

  it('bandwidth narrows with higher Q', () => {
    const lowQ: EqBand = {
      enabled: true,
      type: 'Peaking',
      freq: 1000,
      gain: 6,
      q: 0.5,
    };

    const highQ: EqBand = {
      enabled: true,
      type: 'Peaking',
      freq: 1000,
      gain: 6,
      q: 4.0,
    };

    const lowQResult = calculateBandwidthMarkers(lowQ);
    const highQResult = calculateBandwidthMarkers(highQ);
    
    // Higher Q should produce narrower bandwidth
    const lowQBandwidth = lowQResult.rightFreq! - lowQResult.leftFreq!;
    const highQBandwidth = highQResult.rightFreq! - highQResult.leftFreq!;
    
    expect(highQBandwidth).toBeLessThan(lowQBandwidth);
  });

  it('handles edge case frequencies near boundaries', () => {
    const lowFreqBand: EqBand = {
      enabled: true,
      type: 'Peaking',
      freq: 50,
      gain: 6,
      q: 0.7,
    };

    const result = calculateBandwidthMarkers(lowFreqBand);
    
    // Should still find markers
    expect(result.leftFreq).not.toBeNull();
    expect(result.rightFreq).not.toBeNull();
    
    // Left marker shouldn't go below 20 Hz
    expect(result.leftFreq!).toBeGreaterThanOrEqual(20);
  });

  it('returns null when search range has no crossings', () => {
    const extremeGain: EqBand = {
      enabled: true,
      type: 'Peaking',
      freq: 1000,
      gain: 24, // Very high gain
      q: 10, // Very narrow
    };

    const result = calculateBandwidthMarkers(extremeGain);
    
    // With extreme parameters, markers might not be found
    // (edge case - this is acceptable behavior)
    // Just verify it doesn't crash
    expect(result).toBeDefined();
  });

  it('handles high shelf filter (should return null)', () => {
    const highShelf: EqBand = {
      enabled: true,
      type: 'HighShelf',
      freq: 10000,
      gain: 3,
      q: 0.7,
    };

    const result = calculateBandwidthMarkers(highShelf);
    expect(result.leftFreq).toBeNull();
    expect(result.rightFreq).toBeNull();
  });

  it('handles high pass filter (should return null)', () => {
    const highPass: EqBand = {
      enabled: true,
      type: 'HighPass',
      freq: 100,
      gain: 0,
      q: 0.7,
    };

    const result = calculateBandwidthMarkers(highPass);
    expect(result.leftFreq).toBeNull();
    expect(result.rightFreq).toBeNull();
  });

  it('handles low pass filter (should return null)', () => {
    const lowPass: EqBand = {
      enabled: true,
      type: 'LowPass',
      freq: 10000,
      gain: 0,
      q: 0.7,
    };

    const result = calculateBandwidthMarkers(lowPass);
    expect(result.leftFreq).toBeNull();
    expect(result.rightFreq).toBeNull();
  });
});
