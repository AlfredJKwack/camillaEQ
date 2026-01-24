import { describe, it, expect } from 'vitest';
import { freqToX, gainToY, generateCurvePath } from './EqSvgRenderer';
import type { EqBand } from '../../dsp/filterResponse';

describe('EqSvgRenderer', () => {
  describe('freqToX', () => {
    it('maps 20 Hz to X=0', () => {
      const x = freqToX(20, 1000);
      expect(x).toBeCloseTo(0, 1);
    });

    it('maps 20000 Hz to X=width', () => {
      const x = freqToX(20000, 1000);
      expect(x).toBeCloseTo(1000, 1);
    });

    it('maps 200 Hz (1 decade up) to approximately X=333', () => {
      // log10(20) = 1.301, log10(20000) = 4.301 (3 decades total)
      // log10(200) = 2.301 (1 decade from start)
      // Normalized: (2.301 - 1.301) / 3 = 0.333
      const x = freqToX(200, 1000);
      expect(x).toBeCloseTo(333, 0);
    });

    it('maps 1000 Hz (mid frequency) correctly', () => {
      // log10(1000) = 3.0
      // Normalized: (3.0 - 1.301) / 3 ≈ 0.566
      const x = freqToX(1000, 1000);
      expect(x).toBeGreaterThan(500);
      expect(x).toBeLessThan(600);
    });
  });

  describe('gainToY', () => {
    it('maps +24 dB (max gain) to Y=0 (top)', () => {
      const y = gainToY(24, 400);
      expect(y).toBeCloseTo(0, 1);
    });

    it('maps -24 dB (min gain) to Y=height (bottom)', () => {
      const y = gainToY(-24, 400);
      expect(y).toBeCloseTo(400, 1);
    });

    it('maps 0 dB to Y=height/2 (middle)', () => {
      const y = gainToY(0, 400);
      expect(y).toBeCloseTo(200, 1);
    });

    it('maps +12 dB to Y=height/4 (upper quarter)', () => {
      const y = gainToY(12, 400);
      expect(y).toBeCloseTo(100, 1);
    });

    it('maps -12 dB to Y=3*height/4 (lower quarter)', () => {
      const y = gainToY(-12, 400);
      expect(y).toBeCloseTo(300, 1);
    });
  });

  describe('generateCurvePath', () => {
    it('returns empty string for empty bands array', () => {
      const path = generateCurvePath([], { width: 1000, height: 400 });
      expect(path).toBe('');
    });

    it('generates path string starting with M (moveto)', () => {
      const bands: EqBand[] = [
        { enabled: true, type: 'Peaking', freq: 1000, gain: 6, q: 1 },
      ];
      const path = generateCurvePath(bands, { width: 1000, height: 400 });
      expect(path).toMatch(/^M \d+/);
    });

    it('generates path with multiple L (lineto) commands', () => {
      const bands: EqBand[] = [
        { enabled: true, type: 'Peaking', freq: 1000, gain: 6, q: 1 },
      ];
      const path = generateCurvePath(bands, { width: 1000, height: 400, numPoints: 10 });
      
      // Should have 1 M command + 9 L commands for 10 points
      const lCommands = (path.match(/ L /g) || []).length;
      expect(lCommands).toBe(9);
    });

    it('generates stable output for same input', () => {
      const bands: EqBand[] = [
        { enabled: true, type: 'Peaking', freq: 1000, gain: 6, q: 1 },
        { enabled: true, type: 'Peaking', freq: 5000, gain: -3, q: 2 },
      ];
      const options = { width: 1000, height: 400, numPoints: 64 };
      
      const path1 = generateCurvePath(bands, options);
      const path2 = generateCurvePath(bands, options);
      
      expect(path1).toBe(path2);
    });

    it('clamps extreme gain values to viewport range', () => {
      const bands: EqBand[] = [
        { enabled: true, type: 'Peaking', freq: 1000, gain: 50, q: 0.5 }, // Extreme boost
      ];
      const path = generateCurvePath(bands, { 
        width: 1000, 
        height: 400, 
        numPoints: 256,
        gainMin: -24,
        gainMax: 24,
      });
      
      // Path should exist and not contain Y values outside [0, 400]
      expect(path).toBeTruthy();
      expect(path.length).toBeGreaterThan(0);
      
      // Extract Y coordinates and verify none exceed bounds
      const yMatches = path.match(/(\d+\.\d+|\d+)(?= |$)/g);
      if (yMatches) {
        const yValues = yMatches.filter((_, i) => i % 2 === 1).map(Number);
        yValues.forEach(y => {
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(400);
        });
      }
    });

    it('handles disabled bands by excluding them from response', () => {
      const bandsEnabled: EqBand[] = [
        { enabled: true, type: 'Peaking', freq: 1000, gain: 6, q: 1 },
      ];
      const bandsDisabled: EqBand[] = [
        { enabled: false, type: 'Peaking', freq: 1000, gain: 6, q: 1 },
      ];
      
      const pathEnabled = generateCurvePath(bandsEnabled, { width: 1000, height: 400, numPoints: 64 });
      const pathDisabled = generateCurvePath(bandsDisabled, { width: 1000, height: 400, numPoints: 64 });
      
      // Disabled band should produce flat (0 dB) curve at Y=200
      expect(pathEnabled).not.toBe(pathDisabled);
      
      // Disabled path should stay near Y=200 (0 dB line)
      const yMatches = pathDisabled.match(/(\d+\.\d+|\d+)(?= |$)/g);
      if (yMatches) {
        const yValues = yMatches.filter((_, i) => i % 2 === 1).map(Number);
        yValues.forEach(y => {
          expect(y).toBeCloseTo(200, 1); // All Y values should be near center (0 dB)
        });
      }
    });
  });
});
