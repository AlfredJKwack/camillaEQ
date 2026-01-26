import { describe, it, expect } from 'vitest';
import {
  formatTokenFrequency,
  formatTokenQ,
  qToSweepDeg,
  describeEllipseArcPath,
  shouldPlaceLabelsAbove,
  labelShiftFactor,
} from './tokenUtils';

describe('formatTokenFrequency', () => {
  it('formats frequencies below 1000 Hz without unit suffix', () => {
    expect(formatTokenFrequency(20)).toBe('20');
    expect(formatTokenFrequency(150)).toBe('150');
    expect(formatTokenFrequency(999)).toBe('999');
  });

  it('formats frequencies >= 1000 Hz with k suffix', () => {
    expect(formatTokenFrequency(1000)).toBe('1k');
    expect(formatTokenFrequency(1200)).toBe('1.2k');
    expect(formatTokenFrequency(2500)).toBe('2.5k');
    expect(formatTokenFrequency(10000)).toBe('10k');
    expect(formatTokenFrequency(20000)).toBe('20k');
  });

  it('rounds sub-Hz values', () => {
    expect(formatTokenFrequency(149.7)).toBe('150');
    expect(formatTokenFrequency(1234.56)).toBe('1.2k');
  });
});

describe('formatTokenQ', () => {
  it('formats Q value with 1 decimal place', () => {
    expect(formatTokenQ(0.1)).toBe('Q 0.1');
    expect(formatTokenQ(1.5)).toBe('Q 1.5');
    expect(formatTokenQ(2.0)).toBe('Q 2.0');
    expect(formatTokenQ(10)).toBe('Q 10.0');
  });

  it('rounds to 1 decimal place', () => {
    expect(formatTokenQ(2.567)).toBe('Q 2.6');
    expect(formatTokenQ(0.123)).toBe('Q 0.1');
  });
});

describe('qToSweepDeg', () => {
  it('maps minimum Q to minimum sweep', () => {
    expect(qToSweepDeg(0.1)).toBe(30);
  });

  it('maps maximum Q to maximum sweep', () => {
    expect(qToSweepDeg(10)).toBe(270);
  });

  it('maps mid-range Q values linearly', () => {
    // Q range: 0.1 to 10 (span of 9.9)
    // Sweep range: 30 to 270 (span of 240)
    // Mid Q = 5.05, should map to mid sweep = 150
    const midQ = 5.05;
    const sweep = qToSweepDeg(midQ);
    expect(sweep).toBeCloseTo(150, 1);
  });

  it('clamps Q values below minimum', () => {
    expect(qToSweepDeg(0.05)).toBe(30);
    expect(qToSweepDeg(-1)).toBe(30);
  });

  it('clamps Q values above maximum', () => {
    expect(qToSweepDeg(15)).toBe(270);
    expect(qToSweepDeg(100)).toBe(270);
  });
});

describe('describeEllipseArcPath', () => {
  it('generates a valid SVG arc path', () => {
    const path = describeEllipseArcPath({
      cx: 100,
      cy: 100,
      rx: 10,
      ry: 10,
      startDeg: -45,
      endDeg: 45,
    });

    expect(path).toMatch(/^M [\d.-]+ [\d.-]+ A/);
    expect(path).toContain('10 10'); // rx ry
  });

  it('uses single arc for sweeps <= 180°', () => {
    const path = describeEllipseArcPath({
      cx: 100,
      cy: 100,
      rx: 10,
      ry: 10,
      startDeg: -45,
      endDeg: 45,
    });

    // Single arc: should have only one 'A' command
    const arcCount = (path.match(/A/g) || []).length;
    expect(arcCount).toBe(1);
    
    // Path format: M x y A rx ry rotation largeArcFlag sweepFlag x y
    const parts = path.split(' ');
    const largeArcFlagIndex = parts.indexOf('A') + 4;
    expect(parts[largeArcFlagIndex]).toBe('0');
  });

  it('splits into two arcs for sweeps > 180°', () => {
    const path = describeEllipseArcPath({
      cx: 100,
      cy: 100,
      rx: 10,
      ry: 10,
      startDeg: -135,
      endDeg: 135,
    });

    // Two arcs: should have two 'A' commands
    const arcCount = (path.match(/A/g) || []).length;
    expect(arcCount).toBe(2);
    
    // Both segments should use largeArcFlag=0 (each < 180°)
    const parts = path.split(' ');
    const firstArcIndex = parts.indexOf('A');
    const secondArcIndex = parts.lastIndexOf('A');
    
    expect(parts[firstArcIndex + 4]).toBe('0');
    expect(parts[secondArcIndex + 4]).toBe('0');
  });

  it('handles ellipse with different rx/ry', () => {
    const path = describeEllipseArcPath({
      cx: 100,
      cy: 100,
      rx: 20,
      ry: 10,
      startDeg: 0,
      endDeg: 90,
    });

    expect(path).toContain('20 10'); // rx ry
  });

  it('returns non-empty path for zero-degree sweep', () => {
    const path = describeEllipseArcPath({
      cx: 100,
      cy: 100,
      rx: 10,
      ry: 10,
      startDeg: 0,
      endDeg: 0,
    });

    expect(path.length).toBeGreaterThan(0);
  });
  
  it('avoids largeArcFlag discontinuity at 180° boundary', () => {
    // Test just below 180°
    const path179 = describeEllipseArcPath({
      cx: 100,
      cy: 100,
      rx: 10,
      ry: 10,
      startDeg: -89.5,
      endDeg: 89.5,
    });
    
    // Test just above 180°
    const path181 = describeEllipseArcPath({
      cx: 100,
      cy: 100,
      rx: 10,
      ry: 10,
      startDeg: -90.5,
      endDeg: 90.5,
    });
    
    // 179° should be single arc
    expect((path179.match(/A/g) || []).length).toBe(1);
    
    // 181° should be split into two arcs
    expect((path181.match(/A/g) || []).length).toBe(2);
  });
});

describe('shouldPlaceLabelsAbove', () => {
  it('returns false when token is in upper portion of plot', () => {
    const plotHeightPx = 400;
    const cyViewBox = 100; // Well above threshold

    expect(shouldPlaceLabelsAbove(cyViewBox, plotHeightPx)).toBe(false);
  });

  it('returns true when token is near bottom of plot', () => {
    const plotHeightPx = 400;
    const cyViewBox = 380; // Near bottom

    expect(shouldPlaceLabelsAbove(cyViewBox, plotHeightPx)).toBe(true);
  });

  it('handles threshold boundary correctly', () => {
    const plotHeightPx = 400;
    // Threshold = (60 / 400) * 400 = 60 viewBox units from bottom
    // Boundary at y = 400 - 60 = 340

    expect(shouldPlaceLabelsAbove(339, plotHeightPx)).toBe(false);
    expect(shouldPlaceLabelsAbove(341, plotHeightPx)).toBe(true);
  });

  it('scales threshold proportionally with plot height', () => {
    // With smaller plot
    const smallPlotHeight = 200;
    // Threshold = (60 / 200) * 400 = 120 viewBox units
    // Boundary at y = 400 - 120 = 280

    expect(shouldPlaceLabelsAbove(275, smallPlotHeight)).toBe(false);
    expect(shouldPlaceLabelsAbove(285, smallPlotHeight)).toBe(true);

    // With larger plot
    const largePlotHeight = 800;
    // Threshold = (60 / 800) * 400 = 30 viewBox units
    // Boundary at y = 400 - 30 = 370

    expect(shouldPlaceLabelsAbove(365, largePlotHeight)).toBe(false);
    expect(shouldPlaceLabelsAbove(375, largePlotHeight)).toBe(true);
  });
});

describe('labelShiftFactor', () => {
  it('returns 0 when token is in upper portion of plot', () => {
    const plotHeightPx = 400;
    const cyViewBox = 100; // Well above transition zone

    expect(labelShiftFactor(cyViewBox, plotHeightPx)).toBe(0);
  });

  it('returns 1 when token is at bottom of plot', () => {
    const plotHeightPx = 400;
    const cyViewBox = 400; // At bottom

    expect(labelShiftFactor(cyViewBox, plotHeightPx)).toBe(1);
  });

  it('returns value between 0 and 1 in transition zone', () => {
    const plotHeightPx = 400;
    // Threshold = 60px = 60 viewBox units
    // Blend = 40px = 40 viewBox units
    // Boundary = 400 - 60 = 340
    // Transition zone: [340 - 40, 340 + 40] = [300, 380]

    const midTransition = 340;
    const factor = labelShiftFactor(midTransition, plotHeightPx);
    
    expect(factor).toBeGreaterThan(0);
    expect(factor).toBeLessThan(1);
    expect(factor).toBeCloseTo(0.5, 1); // Should be near 0.5 at boundary
  });

  it('uses smoothstep interpolation (monotonic and smooth)', () => {
    const plotHeightPx = 400;
    
    // Sample points through transition zone
    const y1 = 310;
    const y2 = 340;
    const y3 = 370;
    
    const f1 = labelShiftFactor(y1, plotHeightPx);
    const f2 = labelShiftFactor(y2, plotHeightPx);
    const f3 = labelShiftFactor(y3, plotHeightPx);
    
    // Should be monotonically increasing
    expect(f2).toBeGreaterThan(f1);
    expect(f3).toBeGreaterThan(f2);
    
    // All should be in [0, 1]
    expect(f1).toBeGreaterThanOrEqual(0);
    expect(f1).toBeLessThanOrEqual(1);
    expect(f2).toBeGreaterThanOrEqual(0);
    expect(f2).toBeLessThanOrEqual(1);
    expect(f3).toBeGreaterThanOrEqual(0);
    expect(f3).toBeLessThanOrEqual(1);
  });

  it('clamps values outside transition zone', () => {
    const plotHeightPx = 400;
    
    // Far above transition zone
    expect(labelShiftFactor(100, plotHeightPx)).toBe(0);
    
    // Far below transition zone
    expect(labelShiftFactor(395, plotHeightPx)).toBe(1);
  });

  it('scales with plot height', () => {
    // Smaller plot (threshold takes more viewBox space)
    const smallPlotHeight = 200;
    // Threshold = (60 / 200) * 400 = 120 viewBox units
    // Blend = (40 / 200) * 400 = 80 viewBox units
    // Boundary at 400 - 120 = 280
    // Transition zone: [280 - 80, 280 + 80] = [200, 360]
    
    expect(labelShiftFactor(150, smallPlotHeight)).toBe(0); // Well before transition
    expect(labelShiftFactor(380, smallPlotHeight)).toBe(1); // Well after transition
    
    // Larger plot (threshold takes less viewBox space)
    const largePlotHeight = 800;
    // Threshold = (60 / 800) * 400 = 30 viewBox units
    // Blend = (40 / 800) * 400 = 20 viewBox units
    // Boundary at 400 - 30 = 370
    // Transition zone: [370 - 20, 370 + 20] = [350, 390]
    
    expect(labelShiftFactor(320, largePlotHeight)).toBe(0); // Well before transition
    expect(labelShiftFactor(398, largePlotHeight)).toBe(1); // Well after transition
  });
});
