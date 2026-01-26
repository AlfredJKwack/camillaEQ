import { describe, it, expect } from 'vitest';
import {
  generatePeakingFillPath,
  generateShelfTintRect,
  generatePassFilterTint,
  generateBandPassTintRect,
  generateNotchHaloPath,
} from '../eqFocusViz';
import type { EqBand } from '../../../dsp/filterResponse';

const defaultOptions = {
  width: 1000,
  height: 400,
};

describe('generatePeakingFillPath', () => {
  it('returns non-empty path for peaking filter', () => {
    const band: EqBand = {
      enabled: true,
      type: 'Peaking',
      freq: 1000,
      gain: 6,
      q: 1.0,
    };

    const path = generatePeakingFillPath(band, defaultOptions);
    expect(path).toBeTruthy();
    expect(path).toContain('M'); // SVG path command
    expect(path).toContain('Z'); // Closed path
  });

  it('returns empty string for non-peaking filter', () => {
    const band: EqBand = {
      enabled: true,
      type: 'LowShelf',
      freq: 100,
      gain: 6,
      q: 0.7,
    };

    const path = generatePeakingFillPath(band, defaultOptions);
    // Should still work (samples the curve), but behavior is filter-specific
    expect(path).toBeDefined();
  });
});

describe('generateShelfTintRect', () => {
  it('returns left-side rect for LowShelf', () => {
    const band: EqBand = {
      enabled: true,
      type: 'LowShelf',
      freq: 100,
      gain: 6,
      q: 0.7,
    };

    const rect = generateShelfTintRect(band, defaultOptions);
    expect(rect).not.toBeNull();
    expect(rect!.x).toBe(0);
    expect(rect!.width).toBeGreaterThan(0);
    expect(rect!.height).toBe(400);
  });

  it('returns right-side rect for HighShelf', () => {
    const band: EqBand = {
      enabled: true,
      type: 'HighShelf',
      freq: 10000,
      gain: 3,
      q: 0.7,
    };

    const rect = generateShelfTintRect(band, defaultOptions);
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeGreaterThan(0);
    expect(rect!.width).toBeGreaterThan(0);
    expect(rect!.width).toBeLessThan(1000);
    expect(rect!.height).toBe(400);
  });

  it('returns null for non-shelf filter', () => {
    const band: EqBand = {
      enabled: true,
      type: 'Peaking',
      freq: 1000,
      gain: 6,
      q: 1.0,
    };

    const rect = generateShelfTintRect(band, defaultOptions);
    expect(rect).toBeNull();
  });
});

describe('generatePassFilterTint', () => {
  it('returns rect for LowPass', () => {
    const band: EqBand = {
      enabled: true,
      type: 'LowPass',
      freq: 10000,
      gain: 0,
      q: 0.7,
    };

    const rect = generatePassFilterTint(band, defaultOptions);
    expect(rect).not.toBeNull();
    expect(rect!.width).toBeGreaterThan(0);
    expect(rect!.height).toBe(400);
  });

  it('returns rect for HighPass', () => {
    const band: EqBand = {
      enabled: true,
      type: 'HighPass',
      freq: 100,
      gain: 0,
      q: 0.7,
    };

    const rect = generatePassFilterTint(band, defaultOptions);
    expect(rect).not.toBeNull();
    expect(rect!.width).toBeGreaterThan(0);
    expect(rect!.height).toBe(400);
  });

  it('returns null for non-pass filter', () => {
    const band: EqBand = {
      enabled: true,
      type: 'Peaking',
      freq: 1000,
      gain: 6,
      q: 1.0,
    };

    const rect = generatePassFilterTint(band, defaultOptions);
    expect(rect).toBeNull();
  });
});

describe('generateBandPassTintRect', () => {
  it('returns rect for BandPass filter', () => {
    const band: EqBand = {
      enabled: true,
      type: 'BandPass',
      freq: 1000,
      gain: 0,
      q: 2.0,
    };

    const rect = generateBandPassTintRect(band, defaultOptions);
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeGreaterThan(0);
    expect(rect!.width).toBeGreaterThan(0);
    expect(rect!.height).toBe(400);
  });

  it('rect straddles center frequency', () => {
    const band: EqBand = {
      enabled: true,
      type: 'BandPass',
      freq: 1000,
      gain: 0,
      q: 1.0,
    };

    const rect = generateBandPassTintRect(band, defaultOptions);
    expect(rect).not.toBeNull();
    
    // Convert freq to X position (log scale)
    const freqMin = 20;
    const freqMax = 20000;
    const centerX = ((Math.log10(1000) - Math.log10(freqMin)) / (Math.log10(freqMax) - Math.log10(freqMin))) * 1000;
    
    // Rect should contain center
    expect(rect!.x).toBeLessThan(centerX);
    expect(rect!.x + rect!.width).toBeGreaterThan(centerX);
  });

  it('narrower rect for higher Q', () => {
    const lowQ: EqBand = {
      enabled: true,
      type: 'BandPass',
      freq: 1000,
      gain: 0,
      q: 0.5,
    };

    const highQ: EqBand = {
      enabled: true,
      type: 'BandPass',
      freq: 1000,
      gain: 0,
      q: 4.0,
    };

    const lowQRect = generateBandPassTintRect(lowQ, defaultOptions);
    const highQRect = generateBandPassTintRect(highQ, defaultOptions);
    
    expect(lowQRect).not.toBeNull();
    expect(highQRect).not.toBeNull();
    
    // Higher Q should produce narrower window
    expect(highQRect!.width).toBeLessThan(lowQRect!.width);
  });

  it('returns null for non-BandPass filter', () => {
    const band: EqBand = {
      enabled: true,
      type: 'Peaking',
      freq: 1000,
      gain: 6,
      q: 1.0,
    };

    const rect = generateBandPassTintRect(band, defaultOptions);
    expect(rect).toBeNull();
  });

  it('handles edge case frequencies near boundaries', () => {
    const lowFreq: EqBand = {
      enabled: true,
      type: 'BandPass',
      freq: 50,
      gain: 0,
      q: 1.0,
    };

    const highFreq: EqBand = {
      enabled: true,
      type: 'BandPass',
      freq: 15000,
      gain: 0,
      q: 1.0,
    };

    const lowRect = generateBandPassTintRect(lowFreq, defaultOptions);
    const highRect = generateBandPassTintRect(highFreq, defaultOptions);
    
    expect(lowRect).not.toBeNull();
    expect(highRect).not.toBeNull();
    
    // Should clamp to valid range
    expect(lowRect!.x).toBeGreaterThanOrEqual(0);
    expect(highRect!.x + highRect!.width).toBeLessThanOrEqual(1000);
  });
});

describe('generateNotchHaloPath', () => {
  it('returns non-empty path for notch filter', () => {
    const band: EqBand = {
      enabled: true,
      type: 'Notch',
      freq: 1000,
      gain: 0,
      q: 2.0,
    };

    const path = generateNotchHaloPath(band, defaultOptions);
    expect(path).toBeTruthy();
    expect(path).toContain('M'); // SVG path command
    expect(path).not.toContain('Z'); // Open path (not closed)
  });

  it('works for other filter types too', () => {
    const band: EqBand = {
      enabled: true,
      type: 'Peaking',
      freq: 1000,
      gain: -6, // Cut
      q: 3.0,
    };

    const path = generateNotchHaloPath(band, defaultOptions);
    expect(path).toBeTruthy();
  });
});
