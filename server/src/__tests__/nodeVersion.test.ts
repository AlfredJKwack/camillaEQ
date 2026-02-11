import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { checkNodeVersion } from '../runtime/checkNodeVersion.js';

describe('Node.js Version Check', () => {
  let originalVersion: string;

  beforeEach(() => {
    // Save original version
    originalVersion = process.version;
  });

  afterEach(() => {
    // Restore original version
    Object.defineProperty(process, 'version', {
      value: originalVersion,
      writable: true,
      configurable: true,
    });
  });

  describe('checkNodeVersion()', () => {
    it('should accept Node 18.x', () => {
      Object.defineProperty(process, 'version', {
        value: 'v18.0.0',
        writable: true,
        configurable: true,
      });
      expect(checkNodeVersion()).toBe(true);
    });

    it('should accept Node 18.20.0', () => {
      Object.defineProperty(process, 'version', {
        value: 'v18.20.0',
        writable: true,
        configurable: true,
      });
      expect(checkNodeVersion()).toBe(true);
    });

    it('should accept Node 20.x', () => {
      Object.defineProperty(process, 'version', {
        value: 'v20.0.0',
        writable: true,
        configurable: true,
      });
      expect(checkNodeVersion()).toBe(true);
    });

    it('should accept Node 22.x', () => {
      Object.defineProperty(process, 'version', {
        value: 'v22.5.1',
        writable: true,
        configurable: true,
      });
      expect(checkNodeVersion()).toBe(true);
    });

    it('should reject Node 16.x', () => {
      Object.defineProperty(process, 'version', {
        value: 'v16.20.2',
        writable: true,
        configurable: true,
      });
      expect(checkNodeVersion()).toBe(false);
    });

    it('should reject Node 14.x', () => {
      Object.defineProperty(process, 'version', {
        value: 'v14.21.3',
        writable: true,
        configurable: true,
      });
      expect(checkNodeVersion()).toBe(false);
    });

    it('should accept Node 23.x', () => {
      Object.defineProperty(process, 'version', {
        value: 'v23.0.0',
        writable: true,
        configurable: true,
      });
      expect(checkNodeVersion()).toBe(true);
    });

    it('should accept Node 24.x', () => {
      Object.defineProperty(process, 'version', {
        value: 'v24.0.0',
        writable: true,
        configurable: true,
      });
      expect(checkNodeVersion()).toBe(true);
    });

    it('should reject Node 25.x (future version beyond range)', () => {
      Object.defineProperty(process, 'version', {
        value: 'v25.0.0',
        writable: true,
        configurable: true,
      });
      expect(checkNodeVersion()).toBe(false);
    });

    it('should reject invalid version format', () => {
      Object.defineProperty(process, 'version', {
        value: 'invalid',
        writable: true,
        configurable: true,
      });
      expect(checkNodeVersion()).toBe(false);
    });

    it('should reject empty version string', () => {
      Object.defineProperty(process, 'version', {
        value: '',
        writable: true,
        configurable: true,
      });
      expect(checkNodeVersion()).toBe(false);
    });
  });
});
