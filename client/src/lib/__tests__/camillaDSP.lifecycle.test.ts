/**
 * CamillaDSP lifecycle event tests
 * Verifies socket lifecycle events and transport-level error logging
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketServer } from 'ws';
import { CamillaDSP, type SocketLifecycleEvent, type DspEventInfo } from '../camillaDSP';

describe('CamillaDSP lifecycle events', () => {
  let wsServer: WebSocketServer;
  let wsSpectrumServer: WebSocketServer;
  let dsp: CamillaDSP;
  let controlPort: number;
  let spectrumPort: number;

  beforeEach(() => {
    dsp = new CamillaDSP();
    
    // Use ephemeral ports to avoid collisions in parallel test runs
    wsServer = new WebSocketServer({ port: 0 });
    wsSpectrumServer = new WebSocketServer({ port: 0 });
    
    // Get assigned ports
    controlPort = (wsServer.address() as any).port;
    spectrumPort = (wsSpectrumServer.address() as any).port;
  });

  afterEach(async () => {
    if (dsp) {
      dsp.disconnect();
    }

    // Close WebSocket servers
    if (wsServer) {
      wsServer.clients.forEach((client) => client.close());
      await new Promise<void>((resolve) => wsServer.close(() => resolve()));
    }

    if (wsSpectrumServer) {
      wsSpectrumServer.clients.forEach((client) => client.close());
      await new Promise<void>((resolve) => wsSpectrumServer.close(() => resolve()));
    }
  });

  it('should emit open lifecycle events for both sockets on successful connect', async () => {
    const lifecycleEvents: SocketLifecycleEvent[] = [];

    wsServer.on('connection', (ws) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg === 'GetConfigJson') {
          ws.send(JSON.stringify({ GetConfigJson: { result: 'Ok', value: '{}' } }));
        }
      });
    });

    wsSpectrumServer.on('connection', (ws) => {
      ws.on('message', () => {
        // Spectrum socket - no responses needed for this test
      });
    });

    // Hook up lifecycle callback
    dsp.onSocketLifecycleEvent = (event) => {
      lifecycleEvents.push(event);
    };

    // Connect
    await dsp.connect('127.0.0.1', controlPort, spectrumPort);

    // Wait a bit for events to propagate
    await new Promise(resolve => setTimeout(resolve, 50));

    // Should have received open events for both sockets
    expect(lifecycleEvents.length).toBeGreaterThanOrEqual(2);

    const controlOpen = lifecycleEvents.find(e => e.socket === 'control' && e.type === 'open');
    const spectrumOpen = lifecycleEvents.find(e => e.socket === 'spectrum' && e.type === 'open');

    expect(controlOpen).toBeDefined();
    expect(controlOpen?.message).toContain('connected');

    expect(spectrumOpen).toBeDefined();
    expect(spectrumOpen?.message).toContain('connected');
  });

  it('should emit close lifecycle event when spectrum socket closes', async () => {
    const lifecycleEvents: SocketLifecycleEvent[] = [];

    wsServer.on('connection', (ws) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg === 'GetConfigJson') {
          ws.send(JSON.stringify({ GetConfigJson: { result: 'Ok', value: '{}' } }));
        }
      });
    });

    wsSpectrumServer.on('connection', (ws) => {
      ws.on('message', () => {});
    });

    dsp.onSocketLifecycleEvent = (event) => {
      lifecycleEvents.push(event);
    };

    // Connect
    await dsp.connect('127.0.0.1', controlPort, spectrumPort);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Clear events from connection
    lifecycleEvents.length = 0;

    // Close spectrum socket
    wsSpectrumServer.clients.forEach((client) => client.close());

    // Wait for close event
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should have received close event for spectrum
    const spectrumClose = lifecycleEvents.find(e => e.socket === 'spectrum' && e.type === 'close');
    expect(spectrumClose).toBeDefined();
  });

  it('should route transport errors through onDspFailure callback', async () => {
    const failures: DspEventInfo[] = [];

    wsServer.on('connection', (ws) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg === 'GetConfigJson') {
          ws.send(JSON.stringify({ GetConfigJson: { result: 'Ok', value: '{}' } }));
        }
        // Also respond to spectrum commands that go through sendOnce
        const parsed = JSON.parse(data.toString());
        if (parsed.GetConfigTitle || parsed.GetConfig) {
          // Don't respond - this will cause timeout/error
        }
      });
    });

    wsSpectrumServer.on('connection', (ws) => {
      ws.on('message', () => {
        // Spectrum socket - don't respond to cause failures
      });
    });

    // Hook up failure callback
    dsp.onDspFailure = (info) => {
      failures.push(info);
    };

    // Connect
    await dsp.connect('127.0.0.1', controlPort, spectrumPort);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Clear any connection failures
    failures.length = 0;

    // Close spectrum socket to trigger transport error
    wsSpectrumServer.clients.forEach((client) => client.close());
    await new Promise(resolve => setTimeout(resolve, 100));

    // Try to call a spectrum method that will hit sendOnce()
    // getConfigTitle goes through sendOnce even when socket is closed
    await dsp.getConfigTitle('spectrum').catch(() => {});

    // Should have logged a transport-level failure
    const transportFailure = failures.find(f => 
      f.socket === 'spectrum' && 
      f.response && 
      f.response.toString().includes('Transport error')
    );

    expect(transportFailure).toBeDefined();
    expect(transportFailure?.socket).toBe('spectrum');
  });

  it('should emit close event when control socket closes', async () => {
    const lifecycleEvents: SocketLifecycleEvent[] = [];

    wsServer.on('connection', (ws) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg === 'GetConfigJson') {
          ws.send(JSON.stringify({ GetConfigJson: { result: 'Ok', value: '{}' } }));
        }
      });
    });

    wsSpectrumServer.on('connection', (ws) => {
      ws.on('message', () => {});
    });

    dsp.onSocketLifecycleEvent = (event) => {
      lifecycleEvents.push(event);
    };

    // Connect
    await dsp.connect('127.0.0.1', controlPort, spectrumPort);
    await new Promise(resolve => setTimeout(resolve, 50));

    // Clear events from connection
    lifecycleEvents.length = 0;

    // Close control socket
    wsServer.clients.forEach((client) => client.close());

    // Wait for close event
    await new Promise(resolve => setTimeout(resolve, 100));

    // Should have received close event for control
    const controlClose = lifecycleEvents.find(e => e.socket === 'control' && e.type === 'close');
    expect(controlClose).toBeDefined();
  });
});
