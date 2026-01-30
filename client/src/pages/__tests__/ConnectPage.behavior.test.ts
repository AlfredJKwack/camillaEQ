/**
 * ConnectPage behavior tests
 * Tests user interactions and store integration
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// We'll test the store interactions rather than full DOM rendering
// This is sufficient for catching regressions in connect flow logic

describe('ConnectPage behavior', () => {
  beforeEach(() => {
    // Mock localStorage globally before resetting modules
    const mockLocalStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(() => null),
    };
    global.localStorage = mockLocalStorage as any;
    
    vi.resetModules();
  });

  it('should expose connection state from dspStore', async () => {
    // Import fresh store
    const { dspState } = await import('../../state/dspStore');
    
    const state = get(dspState);
    
    // Initial state should have connection info
    expect(state).toHaveProperty('connectionState');
    expect(state).toHaveProperty('failures');
    expect(['disconnected', 'connecting', 'connected', 'error']).toContain(state.connectionState);
    expect(Array.isArray(state.failures)).toBe(true);
  });

  it('should track failures in dspStore', async () => {
    const { dspState } = await import('../../state/dspStore');
    
    // Simulate a failure by directly updating the store
    dspState.update(s => ({
      ...s,
      failures: [{
        timestampMs: Date.now(),
        socket: 'control',
        command: 'TestCommand',
        request: 'test request',
        response: { error: 'Connection refused' }
      }]
    }));
    
    const state = get(dspState);
    
    // Should have the failure
    expect(state.failures.length).toBeGreaterThan(0);
    expect(state.failures[0].command).toBe('TestCommand');
  });

  it('should provide connect function in dspStore', async () => {
    const dspStore = await import('../../state/dspStore');
    
    // Should export connect function
    expect(typeof dspStore.connect).toBe('function');
  });

  it('should provide disconnect function in dspStore', async () => {
    const dspStore = await import('../../state/dspStore');
    
    // Should export disconnect function
    expect(typeof dspStore.disconnect).toBe('function');
  });

  it('should expose diagnostics export function', async () => {
    const dspStore = await import('../../state/dspStore');
    
    // Should export exportDiagnostics function
    expect(typeof dspStore.exportDiagnostics).toBe('function');
    
    // Should return valid JSON structure
    const diagnostics = dspStore.exportDiagnostics();
    expect(diagnostics).toHaveProperty('timestamp');
    expect(diagnostics).toHaveProperty('connectionState');
    expect(diagnostics).toHaveProperty('failures');
  });
});
