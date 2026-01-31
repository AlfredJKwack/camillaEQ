/**
 * dspStore lifecycle event tests
 * Verifies degraded/error state derivation and failure logging
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import type { SocketLifecycleEvent, DspEventInfo } from '../../lib/camillaDSP';

// Mock CamillaDSP module - this will be applied to all imports
vi.mock('../../lib/camillaDSP', () => {
  class MockCamillaDSP {
    connected = false;
    spectrumConnected = false;
    config = {
      devices: { capture: { channels: 2 }, playback: { channels: 2 } },
      filters: {},
      mixers: {},
      pipeline: [],
      processors: {},
    };
    
    onDspSuccess?: (info: DspEventInfo) => void;
    onDspFailure?: (info: DspEventInfo) => void;
    onSocketLifecycleEvent?: (event: SocketLifecycleEvent) => void;

    constructor() {
      // Constructor called when dspStore creates instance
    }

    async connect() {
      this.connected = true;
      this.spectrumConnected = true;
      return true;
    }

    disconnect() {
      this.connected = false;
      this.spectrumConnected = false;
    }

    isControlSocketOpen() {
      return this.connected;
    }

    isSpectrumSocketOpen() {
      return this.spectrumConnected;
    }

    async getVolume() {
      return 0;
    }

    async getVersion() {
      return '1.0.0';
    }

    async getAvailableCaptureDevices() {
      return [];
    }

    async getAvailablePlaybackDevices() {
      return [];
    }

    async getConfigYaml() {
      return '';
    }

    async getConfigTitle() {
      return '';
    }

    async getConfigDescription() {
      return '';
    }

    async getSpectrumData() {
      return null;
    }
  }

  return {
    CamillaDSP: MockCamillaDSP,
  };
});

// Import after mock is registered
import { dspState, connect, disconnect, getDspInstance } from '../dspStore';

describe('dspStore lifecycle event handling', () => {
  beforeEach(() => {
    // Mock localStorage
    const mockLocalStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(() => null),
    };
    global.localStorage = mockLocalStorage as any;

    // Clean up from previous test
    disconnect();
  });

  it('should transition to degraded when spectrum socket closes', async () => {
    // Connect (this wires up callbacks)
    await connect('127.0.0.1', 1234, 1235);

    // Get the DSP instance and its lifecycle callback
    const dsp = getDspInstance();
    expect(dsp).toBeDefined();
    expect(dsp?.onSocketLifecycleEvent).toBeDefined();

    const lifecycleCallback = dsp!.onSocketLifecycleEvent!;

    // Simulate both sockets opening
    lifecycleCallback({
      socket: 'control',
      type: 'open',
      message: 'Control socket connected',
      timestampMs: Date.now(),
    });

    lifecycleCallback({
      socket: 'spectrum',
      type: 'open',
      message: 'Spectrum socket connected',
      timestampMs: Date.now(),
    });

    // Verify state is connected
    let state = get(dspState);
    expect(state.connectionState).toBe('connected');
    expect(state.controlConnected).toBe(true);
    expect(state.spectrumConnected).toBe(true);

    // Simulate spectrum socket closing
    lifecycleCallback({
      socket: 'spectrum',
      type: 'close',
      message: 'WebSocket closed',
      timestampMs: Date.now(),
    });

    // Verify state is now degraded
    state = get(dspState);
    expect(state.connectionState).toBe('degraded');
    expect(state.controlConnected).toBe(true);
    expect(state.spectrumConnected).toBe(false);
  });

  it('should transition to error when control socket closes', async () => {
    // Connect
    await connect('127.0.0.1', 1234, 1235);

    const dsp = getDspInstance();
    const lifecycleCallback = dsp!.onSocketLifecycleEvent!;

    // Simulate both sockets opening
    lifecycleCallback({
      socket: 'control',
      type: 'open',
      message: 'Control socket connected',
      timestampMs: Date.now(),
    });

    lifecycleCallback({
      socket: 'spectrum',
      type: 'open',
      message: 'Spectrum socket connected',
      timestampMs: Date.now(),
    });

    // Simulate control socket closing
    lifecycleCallback({
      socket: 'control',
      type: 'close',
      message: 'WebSocket closed',
      timestampMs: Date.now(),
    });

    // Verify state is now error
    const state = get(dspState);
    expect(state.connectionState).toBe('error');
    expect(state.controlConnected).toBe(false);
  });

  it('should log socket lifecycle close/error events to failures', async () => {
    // Connect
    await connect('127.0.0.1', 1234, 1235);

    const dsp = getDspInstance();
    const lifecycleCallback = dsp!.onSocketLifecycleEvent!;

    // Get initial failure count
    let state = get(dspState);
    const initialFailureCount = state.failures.length;

    // Simulate spectrum socket closing
    const closeEvent: SocketLifecycleEvent = {
      socket: 'spectrum',
      type: 'close',
      message: 'Connection lost',
      timestampMs: Date.now(),
    };

    lifecycleCallback(closeEvent);

    // Verify failure was logged
    state = get(dspState);
    expect(state.failures.length).toBe(initialFailureCount + 1);

    const lifecycleFailure = state.failures.find(
      f => f.command === 'Socket Lifecycle' && f.socket === 'spectrum'
    );

    expect(lifecycleFailure).toBeDefined();
    expect(lifecycleFailure?.request).toBe('close');
    expect(lifecycleFailure?.response).toContain('Connection lost');
  });

  it('should handle spectrum open->close->open cycle correctly', async () => {
    // Connect
    await connect('127.0.0.1', 1234, 1235);

    const dsp = getDspInstance();
    const lifecycleCallback = dsp!.onSocketLifecycleEvent!;

    // Simulate initial open events to establish proper state
    lifecycleCallback({
      socket: 'control',
      type: 'open',
      message: 'Control socket connected',
      timestampMs: Date.now(),
    });

    lifecycleCallback({
      socket: 'spectrum',
      type: 'open',
      message: 'Spectrum socket connected',
      timestampMs: Date.now(),
    });

    // After both open events, verify fully connected
    let state = get(dspState);
    expect(state.connectionState).toBe('connected');
    expect(state.controlConnected).toBe(true);
    expect(state.spectrumConnected).toBe(true);

    // Close spectrum
    lifecycleCallback({
      socket: 'spectrum',
      type: 'close',
      message: 'Connection lost',
      timestampMs: Date.now(),
    });

    // Verify degraded
    state = get(dspState);
    expect(state.connectionState).toBe('degraded');
    expect(state.spectrumConnected).toBe(false);

    // Reopen spectrum
    lifecycleCallback({
      socket: 'spectrum',
      type: 'open',
      message: 'Spectrum socket reconnected',
      timestampMs: Date.now(),
    });

    // Verify back to connected
    state = get(dspState);
    expect(state.connectionState).toBe('connected');
    expect(state.spectrumConnected).toBe(true);
  });

  it('should apply exponential backoff to reconnect attempts', async () => {
    // Use fake timers to control time
    vi.useFakeTimers();

    // Enable auto-reconnect in localStorage
    const mockLocalStorage = {
      getItem: vi.fn((key: string) => {
        if (key === 'camillaDSP.autoReconnect') return 'true';
        if (key === 'camillaDSP.server') return '127.0.0.1';
        if (key === 'camillaDSP.controlPort') return '1234';
        if (key === 'camillaDSP.spectrumPort') return '1235';
        return null;
      }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(() => null),
    };
    global.localStorage = mockLocalStorage as any;

    // Spy on console.log to verify backoff messages
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // First establish a successful connection
    await connect('127.0.0.1', 1234, 1235);
    const dsp = getDspInstance();
    const lifecycleCallback = dsp!.onSocketLifecycleEvent!;

    // Now mock CamillaDSP to always fail reconnection attempts
    const { CamillaDSP } = await import('../../lib/camillaDSP');
    const originalConnect = CamillaDSP.prototype.connect;
    CamillaDSP.prototype.connect = vi.fn().mockResolvedValue(false);

    try {
      consoleLogSpy.mockClear();

      // Simulate control socket close (triggers attemptReconnect)
      lifecycleCallback({
        socket: 'control',
        type: 'close',
        message: 'Connection lost',
        timestampMs: Date.now(),
      });

      // Run timers to trigger reconnect attempts
      await vi.advanceTimersByTimeAsync(1000); // First attempt
      await vi.advanceTimersByTimeAsync(2000); // Second attempt  
      await vi.advanceTimersByTimeAsync(5000); // Third attempt

      // Verify exponential backoff by checking console.log messages
      const reconnectLogs = consoleLogSpy.mock.calls
        .map(call => call[0])
        .filter((msg: string) => typeof msg === 'string' && msg.includes('Reconnect attempt'));

      expect(reconnectLogs.length).toBeGreaterThanOrEqual(3);
      expect(reconnectLogs[0]).toContain('Reconnect attempt 1/10 in 1000ms');
      expect(reconnectLogs[1]).toContain('Reconnect attempt 2/10 in 2000ms');
      expect(reconnectLogs[2]).toContain('Reconnect attempt 3/10 in 5000ms');

    } finally {
      // Restore original implementation
      CamillaDSP.prototype.connect = originalConnect;
      vi.useRealTimers();
      consoleLogSpy.mockRestore();
    }
  });
});
