/**
 * Tests for WebSocket request safety: serialization, timeouts, and cancellation
 * Addresses audit findings R1, R2, R4
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import { CamillaDSP } from '../camillaDSP';

// Polyfill WebSocket and localStorage for Node.js test environment (module scope like integration test)
globalThis.WebSocket = WsWebSocket as any;
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  length: 0,
  key: () => null,
};

// Silence console output during tests
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('CamillaDSP Request Safety', () => {
  let wsServer: WebSocketServer;
  let wsSpectrumServer: WebSocketServer;
  let dsp: CamillaDSP;
  let testPort: number;
  let testSpectrumPort: number;

  // Mock config for GetConfigJson
  const mockConfig = {
    devices: {
      capture: { channels: 2, type: 'Alsa', device: 'hw:0' },
      playback: { channels: 2, type: 'Alsa', device: 'hw:1' },
    },
    filters: {},
    mixers: {},
    pipeline: [],
    processors: {},
  };

  beforeEach(async () => {
    // Create control WebSocket server with ephemeral port (port 0)
    wsServer = new WebSocketServer({ port: 0 });
    
    // Create spectrum WebSocket server with ephemeral port (port 0)
    wsSpectrumServer = new WebSocketServer({ port: 0 });
    
    // Wait for servers to be listening and get assigned ports
    await new Promise<void>((resolve) => {
      let controlReady = false;
      let spectrumReady = false;
      
      const checkReady = () => {
        if (controlReady && spectrumReady) {
          testPort = (wsServer.address() as any).port;
          testSpectrumPort = (wsSpectrumServer.address() as any).port;
          resolve();
        }
      };
      
      wsServer.on('listening', () => {
        controlReady = true;
        checkReady();
      });
      
      wsSpectrumServer.on('listening', () => {
        spectrumReady = true;
        checkReady();
      });
    });
  });

  afterEach(async () => {
    if (dsp) {
      dsp.disconnect();
    }
    
    // Close all connections
    wsServer.clients.forEach((client) => client.close());
    wsSpectrumServer.clients.forEach((client) => client.close());
    
    // Close servers
    await new Promise<void>((resolve) => wsServer.close(() => resolve()));
    await new Promise<void>((resolve) => wsSpectrumServer.close(() => resolve()));
  });

  describe('Request Serialization (R1)', () => {
    it('should process requests serially - second waits for first', async () => {
      const responses: string[] = [];
      let firstRequestReceived = false;
      let resolveFirstRequest: (() => void) | null = null;
      const firstRequestPromise = new Promise<void>((resolve) => {
        resolveFirstRequest = resolve;
      });

      // Setup server to delay first GetVersion response
      wsServer.on('connection', (ws) => {
        ws.on('message', async (data) => {
          const request = JSON.parse(data.toString());
          const command = typeof request === 'string' ? request : Object.keys(request)[0];
          
          if (command === 'GetConfigJson') {
            // Always respond immediately to GetConfigJson for connection init
            ws.send(JSON.stringify({
              GetConfigJson: { result: 'Ok', value: JSON.stringify(mockConfig) },
            }));
          } else if (command === 'GetVersion') {
            if (!firstRequestReceived) {
              firstRequestReceived = true;
              responses.push('first-received');
              
              // Wait for manual trigger before responding
              await firstRequestPromise;
              
              ws.send(JSON.stringify({
                GetVersion: { result: 'Ok', value: '1.0.0-first' },
              }));
              responses.push('first-sent');
            } else {
              responses.push('second-received');
              ws.send(JSON.stringify({
                GetVersion: { result: 'Ok', value: '1.0.0-second' },
              }));
              responses.push('second-sent');
            }
          }
        });
      });

      wsSpectrumServer.on('connection', (ws) => {
        ws.on('message', () => {}); // Spectrum socket exists but unused in this test
      });

      // Connect DSP
      dsp = new CamillaDSP({ controlTimeoutMs: 5000 });
      await dsp.connect('localhost', testPort, testSpectrumPort);

      // Start both requests simultaneously
      const promise1 = dsp.getVersion();
      const promise2 = dsp.getVersion();

      // Wait a bit to ensure second request is queued
      await new Promise((resolve) => setTimeout(resolve, 50));

      // At this point, first should be received, second should NOT be
      expect(responses).toEqual(['first-received']);
      expect(firstRequestReceived).toBe(true);

      // Now allow first request to complete
      resolveFirstRequest!();
      
      // Wait for both to complete
      const [version1, version2] = await Promise.all([promise1, promise2]);

      expect(version1).toBe('1.0.0-first');
      expect(version2).toBe('1.0.0-second');
      
      // Verify order: first received -> first sent -> second received -> second sent
      expect(responses).toEqual([
        'first-received',
        'first-sent',
        'second-received',
        'second-sent',
      ]);
    });

    it('should handle multiple commands without overlap', async () => {
      let activeRequests = 0;
      let maxConcurrent = 0;

      wsServer.on('connection', (ws) => {
        ws.on('message', (data) => {
          const request = JSON.parse(data.toString());
          const command = typeof request === 'string' ? request : Object.keys(request)[0];
          
          if (command === 'GetConfigJson') {
            ws.send(JSON.stringify({
              GetConfigJson: { result: 'Ok', value: JSON.stringify(mockConfig) },
            }));
            return;
          }
          
          activeRequests++;
          maxConcurrent = Math.max(maxConcurrent, activeRequests);
          
          // Simulate some processing time
          setTimeout(() => {
            activeRequests--;
            ws.send(JSON.stringify({
              [command]: { result: 'Ok', value: `response-${command}` },
            }));
          }, 10);
        });
      });

      wsSpectrumServer.on('connection', (ws) => {
        ws.on('message', () => {});
      });

      dsp = new CamillaDSP();
      await dsp.connect('localhost', testPort, testSpectrumPort);

      // Fire multiple requests
      const promises = [
        dsp.getVersion(),
        dsp.getState(),
        dsp.getVolume(),
      ];

      await Promise.all(promises);

      // Should never have more than 1 concurrent request
      expect(maxConcurrent).toBe(1);
    });
  });

  describe('Request Timeouts (R2)', () => {
    it('should timeout if server never responds (via private method)', async () => {
      // Server that never responds to non-init requests
      wsServer.on('connection', (ws) => {
        ws.on('message', (data) => {
          const request = JSON.parse(data.toString());
          const command = typeof request === 'string' ? request : Object.keys(request)[0];
          
          if (command === 'GetConfigJson') {
            ws.send(JSON.stringify({
              GetConfigJson: { result: 'Ok', value: JSON.stringify(mockConfig) },
            }));
          }
          // Don't respond to other commands
        });
      });

      wsSpectrumServer.on('connection', (ws) => {
        ws.on('message', () => {});
      });

      dsp = new CamillaDSP({ controlTimeoutMs: 500 });
      await dsp.connect('localhost', testPort, testSpectrumPort);

      // Test via private method to verify timeout rejection
      await expect((dsp as any).sendDSPMessage('GetVersion')).rejects.toThrow(/timed out/i);
      
      // Public API should return null
      const version = await dsp.getVersion();
      expect(version).toBe(null);
    });

    it('should respect custom timeout values', async () => {
      wsServer.on('connection', (ws) => {
        ws.on('message', (data) => {
          const request = JSON.parse(data.toString());
          const command = typeof request === 'string' ? request : Object.keys(request)[0];
          
          if (command === 'GetConfigJson') {
            ws.send(JSON.stringify({
              GetConfigJson: { result: 'Ok', value: JSON.stringify(mockConfig) },
            }));
          }
          // Never respond to other requests
        });
      });

      wsSpectrumServer.on('connection', (ws) => {
        ws.on('message', () => {});
      });

      const shortTimeout = 200;
      dsp = new CamillaDSP({ controlTimeoutMs: shortTimeout });
      await dsp.connect('localhost', testPort, testSpectrumPort);

      const start = Date.now();
      const version = await dsp.getVersion();
      const elapsed = Date.now() - start;
      
      // Should return null after timeout
      expect(version).toBe(null);
      // Should timeout around the specified time (with some tolerance)
      expect(elapsed).toBeGreaterThanOrEqual(shortTimeout - 50);
      expect(elapsed).toBeLessThan(shortTimeout + 300);
    });

    it('should allow subsequent requests after timeout', async () => {
      let requestCount = 0;

      wsServer.on('connection', (ws) => {
        ws.on('message', (data) => {
          const request = JSON.parse(data.toString());
          const command = typeof request === 'string' ? request : Object.keys(request)[0];
          
          if (command === 'GetConfigJson') {
            ws.send(JSON.stringify({
              GetConfigJson: { result: 'Ok', value: JSON.stringify(mockConfig) },
            }));
            return;
          }
          
          requestCount++;
          
          // Only respond to second request
          if (requestCount === 2) {
            ws.send(JSON.stringify({
              [command]: { result: 'Ok', value: '1.0.0' },
            }));
          }
          // First request: never respond (will timeout)
        });
      });

      wsSpectrumServer.on('connection', (ws) => {
        ws.on('message', () => {});
      });

      dsp = new CamillaDSP({ controlTimeoutMs: 300 });
      await dsp.connect('localhost', testPort, testSpectrumPort);

      // First request should timeout and return null
      const version1 = await dsp.getVersion();
      expect(version1).toBe(null);

      // Second request should succeed
      const version2 = await dsp.getVersion();
      expect(version2).toBe('1.0.0');
      expect(requestCount).toBe(2);
    });

    it('should timeout spectrum requests independently', async () => {
      // Control socket responds normally
      wsServer.on('connection', (ws) => {
        ws.on('message', (data) => {
          const request = JSON.parse(data.toString());
          const command = typeof request === 'string' ? request : Object.keys(request)[0];
          ws.send(JSON.stringify({
            [command]: { result: 'Ok', value: command === 'GetConfigJson' ? JSON.stringify(mockConfig) : 'control-ok' },
          }));
        });
      });

      // Spectrum socket never responds
      wsSpectrumServer.on('connection', (ws) => {
        ws.on('message', () => {
          // Never respond
        });
      });

      dsp = new CamillaDSP({ 
        controlTimeoutMs: 2000,
        spectrumTimeoutMs: 300 // Short spectrum timeout
      });
      await dsp.connect('localhost', testPort, testSpectrumPort);

      // Control request should succeed
      const version = await dsp.getVersion();
      expect(version).toBe('control-ok');

      // Spectrum request should timeout and return null
      const spectrum = await dsp.getSpectrumData();
      expect(spectrum).toBe(null);
    });
  });

  describe('Request Cancellation (R1, R4)', () => {
    it('should cancel in-flight request on disconnect (via private method)', async () => {
      let requestReceived = false;

      wsServer.on('connection', (ws) => {
        ws.on('message', async (data) => {
          const request = JSON.parse(data.toString());
          const command = typeof request === 'string' ? request : Object.keys(request)[0];
          
          if (command === 'GetConfigJson') {
            ws.send(JSON.stringify({
              GetConfigJson: { result: 'Ok', value: JSON.stringify(mockConfig) },
            }));
            return;
          }
          
          requestReceived = true;
          // Never send response - but track that we received it
        });
      });

      wsSpectrumServer.on('connection', (ws) => {
        ws.on('message', () => {});
      });

      dsp = new CamillaDSP({ controlTimeoutMs: 5000 });
      await dsp.connect('localhost', testPort, testSpectrumPort);

      // Start request via private method
      const promise = (dsp as any).sendDSPMessage('GetVersion');

      // Wait for request to be received by server
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(requestReceived).toBe(true);

      // Disconnect before response
      dsp.disconnect();

      // Request should reject with cancellation error
      await expect(promise).rejects.toThrow(/cancelled|Disconnected/i);
    });

    it('should cancel queued requests on disconnect', async () => {
      wsServer.on('connection', (ws) => {
        ws.on('message', (data) => {
          const request = JSON.parse(data.toString());
          const command = typeof request === 'string' ? request : Object.keys(request)[0];
          
          if (command === 'GetConfigJson') {
            ws.send(JSON.stringify({
              GetConfigJson: { result: 'Ok', value: JSON.stringify(mockConfig) },
            }));
          }
          // Never respond to other commands to keep first request pending
        });
      });

      wsSpectrumServer.on('connection', (ws) => {
        ws.on('message', () => {});
      });

      dsp = new CamillaDSP({ controlTimeoutMs: 5000 });
      await dsp.connect('localhost', testPort, testSpectrumPort);

      // Start multiple requests via private method (second+ will be queued)
      const promise1 = (dsp as any).sendDSPMessage('GetVersion');
      const promise2 = (dsp as any).sendDSPMessage('GetState');
      const promise3 = (dsp as any).sendDSPMessage('GetVolume');

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Disconnect
      dsp.disconnect();

      // All should reject
      await expect(promise1).rejects.toThrow();
      await expect(promise2).rejects.toThrow();
      await expect(promise3).rejects.toThrow();
    });
  });

  describe('Cleanup and Memory Safety', () => {
    it('should not leave listeners after timeout', async () => {
      wsServer.on('connection', (ws) => {
        ws.on('message', (data) => {
          const request = JSON.parse(data.toString());
          const command = typeof request === 'string' ? request : Object.keys(request)[0];
          
          if (command === 'GetConfigJson') {
            ws.send(JSON.stringify({
              GetConfigJson: { result: 'Ok', value: JSON.stringify(mockConfig) },
            }));
          }
          // Never respond to other commands
        });
      });

      wsSpectrumServer.on('connection', (ws) => {
        ws.on('message', () => {});
      });

      dsp = new CamillaDSP({ controlTimeoutMs: 200 });
      await dsp.connect('localhost', testPort, testSpectrumPort);

      // First request times out
      const version = await dsp.getVersion();
      expect(version).toBe(null);

      // Get the WebSocket instance (hack for testing)
      const ws = (dsp as any).ws;
      const listenerCount = ws.listenerCount('message');

      // Should have cleaned up the message listener
      // Note: There might be 0 or 1 depending on internal state, but not accumulating
      expect(listenerCount).toBeLessThanOrEqual(1);
    });

    it('should handle rapid connect/disconnect cycles', async () => {
      wsServer.on('connection', (ws) => {
        ws.on('message', (data) => {
          const request = JSON.parse(data.toString());
          const command = typeof request === 'string' ? request : Object.keys(request)[0];
          ws.send(JSON.stringify({
            [command]: { result: 'Ok', value: command === 'GetConfigJson' ? JSON.stringify(mockConfig) : 'response' },
          }));
        });
      });

      wsSpectrumServer.on('connection', (ws) => {
        ws.on('message', (data) => {
          const request = JSON.parse(data.toString());
          const command = typeof request === 'string' ? request : Object.keys(request)[0];
          ws.send(JSON.stringify({
            [command]: { result: 'Ok', value: 'response' },
          }));
        });
      });

      // Rapid cycles
      for (let i = 0; i < 5; i++) {
        dsp = new CamillaDSP({ controlTimeoutMs: 1000 });
        await dsp.connect('localhost', testPort, testSpectrumPort);
        
        // Maybe start a request
        if (i % 2 === 0) {
          const promise = (dsp as any).sendDSPMessage('GetVersion');
          dsp.disconnect(); // Disconnect immediately
          await expect(promise).rejects.toThrow();
        } else {
          dsp.disconnect();
        }
      }

      // If we got here without crashes or hangs, test passes
      expect(true).toBe(true);
    });
  });
});
