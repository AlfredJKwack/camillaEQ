/**
 * EqPage behavior tests
 * Tests EQ interactions and store integration
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

describe('EqPage behavior', () => {
  beforeEach(() => {
    // Reset modules to get fresh stores
    vi.resetModules();
  });

  it('should expose EQ bands from eqStore', async () => {
    const { bands } = await import('../../state/eqStore');
    
    const bandsValue = get(bands);
    
    // Should be an array (empty initially or with bands)
    expect(Array.isArray(bandsValue)).toBe(true);
  });

  it('should provide band update functions', async () => {
    const eqStore = await import('../../state/eqStore');
    
    // Should export functions for updating bands
    expect(typeof eqStore.setBandGain).toBe('function');
    expect(typeof eqStore.setBandFreq).toBe('function');
    expect(typeof eqStore.setBandQ).toBe('function');
    expect(typeof eqStore.toggleBandEnabled).toBe('function');
  });

  it('should provide preamp control', async () => {
    const eqStore = await import('../../state/eqStore');
    
    // Should export preamp control
    expect(typeof eqStore.setPreampGain).toBe('function');
  });

  it('should update band gain correctly', async () => {
    const { bands, setBandGain, initializeFromConfig } = await import('../../state/eqStore');
    
    // Initialize with mock config
    const mockConfig = {
      devices: { capture: {}, playback: {} },
      filters: {
        Filter1: {
          type: 'Biquad',
          parameters: {
            type: 'Peaking',
            freq: 1000,
            q: 1.0,
            gain: 3.0,
          },
        },
      },
      mixers: {},
      pipeline: [
        {
          type: 'Filter',
          channels: [0, 1],
          names: ['Filter1'],
        },
      ],
    };
    
    initializeFromConfig(mockConfig as any);
    
    // Set band gain
    setBandGain(0, 6.0);
    
    const bandsValue = get(bands);
    
    // Should have updated gain
    expect(bandsValue.length).toBeGreaterThan(0);
    expect(bandsValue[0].gain).toBe(6.0);
  });

  it('should update band frequency correctly', async () => {
    const { bands, setBandFreq, initializeFromConfig } = await import('../../state/eqStore');
    
    // Initialize with mock config
    const mockConfig = {
      devices: { capture: {}, playback: {} },
      filters: {
        Filter1: {
          type: 'Biquad',
          parameters: {
            type: 'Peaking',
            freq: 1000,
            q: 1.0,
            gain: 3.0,
          },
        },
      },
      mixers: {},
      pipeline: [
        {
          type: 'Filter',
          channels: [0, 1],
          names: ['Filter1'],
        },
      ],
    };
    
    initializeFromConfig(mockConfig as any);
    
    // Set band frequency
    setBandFreq(0, 500);
    
    const bandsValue = get(bands);
    
    // Should have updated frequency
    expect(bandsValue.length).toBeGreaterThan(0);
    expect(bandsValue[0].freq).toBe(500);
  });

  it('should toggle band enabled state', async () => {
    const { bands, toggleBandEnabled, initializeFromConfig } = await import('../../state/eqStore');
    
    // Initialize with mock config
    const mockConfig = {
      devices: { capture: {}, playback: {} },
      filters: {
        Filter1: {
          type: 'Biquad',
          parameters: {
            type: 'Peaking',
            freq: 1000,
            q: 1.0,
            gain: 3.0,
          },
        },
      },
      mixers: {},
      pipeline: [
        {
          type: 'Filter',
          channels: [0, 1],
          names: ['Filter1'],
        },
      ],
    };
    
    initializeFromConfig(mockConfig as any);
    
    const initialBands = get(bands);
    const initialEnabled = initialBands[0]?.enabled ?? true;
    
    // Toggle enabled state
    toggleBandEnabled(0);
    
    const updatedBands = get(bands);
    
    // Should have toggled
    expect(updatedBands[0].enabled).toBe(!initialEnabled);
  });
});
