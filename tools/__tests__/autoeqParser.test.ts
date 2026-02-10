/**
 * Unit tests for AutoEQ ParametricEQ.txt parser
 */

import { describe, it, expect } from 'vitest';
import { parseParametricEQ, ParseError } from '../autoeqParser.js';

describe('AutoEQ Parser', () => {
  describe('parseParametricEQ', () => {
    it('should parse valid ParametricEQ.txt with all filter types', () => {
      const content = `Preamp: -6.1 dB
Filter 1: ON LSC Fc 105 Hz Gain 6.4 dB Q 0.7
Filter 2: ON PK Fc 8800 Hz Gain 5.1 dB Q 1.4
Filter 3: ON HSC Fc 10000 Hz Gain -2.1 dB Q 0.7
`;

      const result = parseParametricEQ(
        content,
        'Test Device',
        'headphones',
        'Test',
        'Device',
        undefined,
        'results/test/device'
      );

      expect(result.preset.presetType).toBe('eq');
      expect(result.preset.schemaVersion).toBe(1);
      expect(result.preset.name).toBe('Test Device');
      expect(result.preset.preampDb).toBe(-6.1);
      expect(result.preset.bands).toHaveLength(3);
      
      expect(result.preset.bands[0]).toEqual({
        type: 'LowShelf',
        freqHz: 105,
        gainDb: 6.4,
        q: 0.7,
        enabled: true,
      });
      
      expect(result.preset.bands[1]).toEqual({
        type: 'Peaking',
        freqHz: 8800,
        gainDb: 5.1,
        q: 1.4,
        enabled: true,
      });
      
      expect(result.preset.bands[2]).toEqual({
        type: 'HighShelf',
        freqHz: 10000,
        gainDb: -2.1,
        q: 0.7,
        enabled: true,
      });

      expect(result.preset.source).toBe('autoeq');
      expect(result.preset.readOnly).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should skip OFF filters', () => {
      const content = `Preamp: 0 dB
Filter 1: ON PK Fc 100 Hz Gain 2.0 dB Q 1.0
Filter 2: OFF PK Fc 200 Hz Gain 3.0 dB Q 1.0
Filter 3: ON PK Fc 300 Hz Gain 4.0 dB Q 1.0
`;

      const result = parseParametricEQ(
        content,
        'Test',
        'headphones',
        'Test',
        'Test',
        undefined,
        'test'
      );

      expect(result.preset.bands).toHaveLength(2);
      expect(result.preset.bands[0].freqHz).toBe(100);
      expect(result.preset.bands[1].freqHz).toBe(300);
    });

    it('should normalize frequency to integer', () => {
      const content = `Preamp: 0 dB
Filter 1: ON PK Fc 123.456 Hz Gain 1.0 dB Q 1.0
`;

      const result = parseParametricEQ(
        content,
        'Test',
        'headphones',
        'Test',
        'Test',
        undefined,
        'test'
      );

      expect(result.preset.bands[0].freqHz).toBe(123);
    });

    it('should normalize gain to 0.1 dB precision', () => {
      const content = `Preamp: -6.123 dB
Filter 1: ON PK Fc 100 Hz Gain 2.456 dB Q 1.0
`;

      const result = parseParametricEQ(
        content,
        'Test',
        'headphones',
        'Test',
        'Test',
        undefined,
        'test'
      );

      expect(result.preset.preampDb).toBe(-6.1);
      expect(result.preset.bands[0].gainDb).toBe(2.5);
    });

    it('should clamp Q to [0.1, 10] and produce warnings', () => {
      const content = `Preamp: 0 dB
Filter 1: ON PK Fc 100 Hz Gain 1.0 dB Q 0.05
Filter 2: ON PK Fc 200 Hz Gain 1.0 dB Q 15.0
Filter 3: ON PK Fc 300 Hz Gain 1.0 dB Q 2.35
`;

      const result = parseParametricEQ(
        content,
        'Test',
        'headphones',
        'Test',
        'Test',
        undefined,
        'test'
      );

      expect(result.preset.bands[0].q).toBe(0.1);
      expect(result.preset.bands[1].q).toBe(10);
      expect(result.preset.bands[2].q).toBe(2.4);

      // Parser warns for both clamping AND normalization
      expect(result.warnings).toHaveLength(3);
      expect(result.warnings[0].field).toContain('Filter 1');
      expect(result.warnings[1].field).toContain('Filter 2');
      expect(result.warnings[2].field).toContain('Filter 3');
    });

    it('should throw ParseError for malformed preamp line', () => {
      const content = `Preamp: invalid
Filter 1: ON PK Fc 100 Hz Gain 1.0 dB Q 1.0
`;

      expect(() =>
        parseParametricEQ(content, 'Test', 'headphones', 'Test', 'Test', undefined, 'test')
      ).toThrow(ParseError);
    });

    it('should throw ParseError for malformed filter line', () => {
      const content = `Preamp: 0 dB
Filter 1: ON INVALID Fc 100 Hz Gain 1.0 dB Q 1.0
`;

      expect(() =>
        parseParametricEQ(content, 'Test', 'headphones', 'Test', 'Test', undefined, 'test')
      ).toThrow(ParseError);
    });

    it('should throw ParseError for missing filter parameters', () => {
      const content = `Preamp: 0 dB
Filter 1: ON PK Fc 100 Hz Gain 1.0 dB
`;

      expect(() =>
        parseParametricEQ(content, 'Test', 'headphones', 'Test', 'Test', undefined, 'test')
      ).toThrow(ParseError);
    });

    it('should handle variant in device metadata', () => {
      const content = `Preamp: 0 dB
Filter 1: ON PK Fc 100 Hz Gain 1.0 dB Q 1.0
`;

      const result = parseParametricEQ(
        content,
        'Audeze LCD-X',
        'headphones',
        'Audeze',
        'LCD-X',
        '2021',
        'test'
      );

      expect(result.preset.device.manufacturer).toBe('Audeze');
      expect(result.preset.device.model).toBe('LCD-X');
      expect(result.preset.device.variant).toBe('2021');
    });

    it('should include sourceInfo metadata', () => {
      const content = `Preamp: 0 dB
Filter 1: ON PK Fc 100 Hz Gain 1.0 dB Q 1.0
`;

      const result = parseParametricEQ(
        content,
        'Test',
        'headphones',
        'Test',
        'Test',
        undefined,
        'results/oratory1990/over-ear/Test'
      );

      expect(result.preset.sourceInfo).toEqual({
        repo: 'https://github.com/jaakkopasanen/AutoEq',
        path: 'results/oratory1990/over-ear/Test',
      });
    });

    it('should handle empty content gracefully', () => {
      const content = `Preamp: 0 dB
`;

      const result = parseParametricEQ(
        content,
        'Test',
        'headphones',
        'Test',
        'Test',
        undefined,
        'test'
      );

      expect(result.preset.preampDb).toBe(0);
      expect(result.preset.bands).toHaveLength(0);
    });
  });
});
