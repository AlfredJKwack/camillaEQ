/**
 * Spectrum socket readiness tests
 * Verifies that getSpectrumData() handles "not ready yet" gracefully
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CamillaDSP } from '../camillaDSP';

describe('CamillaDSP spectrum socket readiness', () => {
  let dsp: CamillaDSP;
  let consoleErrorSpy: any;

  beforeEach(() => {
    dsp = new CamillaDSP();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('should return null silently when spectrum socket is not open', async () => {
    // Simulate spectrum socket not connected yet
    // (default state: wsSpectrum = null, spectrumConnected = false)
    
    const result = await dsp.getSpectrumData();
    
    // Should return null without error
    expect(result).toBeNull();
    
    // Should NOT have called console.error
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should check spectrum socket readiness helper', () => {
    // Initially not open
    expect(dsp.isSpectrumSocketOpen()).toBe(false);
    
    // After successful connection (tested in integration tests)
    // this should return true
  });

  it('should check control socket readiness helper', () => {
    // Initially not open
    expect(dsp.isControlSocketOpen()).toBe(false);
  });
});
