/**
 * Integration tests for CamillaDSP client module
 * Tests against mock WebSocket servers
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketServer, WebSocket as WSServer } from 'ws';
import { CamillaDSP } from '../camillaDSP';

// Polyfill WebSocket for Node environment
global.WebSocket = WSServer as any;

// Mock localStorage
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  length: 0,
  key: () => null,
};

describe('CamillaDSP Integration Tests', () => {
  const CONTROL_PORT = 13146; // Test ports to avoid conflicts
  const SPECTRUM_PORT = 16413;
  
  let controlServer: WebSocketServer;
  let spectrumServer: WebSocketServer;
  let dsp: CamillaDSP;

  // Silence console output during tests
  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  // Mock config
  const mockConfig = {
    devices: {
      capture: { channels: 2, type: 'Alsa', device: 'hw:0' },
      playback: { channels: 2, type: 'Alsa', device: 'hw:1' },
    },
    filters: {
      'test-filter': {
        type: 'Biquad',
        parameters: { type: 'Peaking', freq: 1000, gain: 3, q: 1.41 },
      },
    },
    mixers: {
      recombine: {
        description: 'Test Mixer',
        channels: { in: 2, out: 2 },
        mapping: [
          {
            dest: 0,
            sources: [
              { channel: 0, gain: 0, inverted: false, mute: false, scale: 'dB' },
            ],
            mute: false,
          },
          {
            dest: 1,
            sources: [
              { channel: 1, gain: 0, inverted: false, mute: false, scale: 'dB' },
            ],
            mute: false,
          },
        ],
      },
    },
    pipeline: [
      { type: 'Mixer', name: 'recombine', bypassed: false },
      { type: 'Filter', channel: 0, names: ['test-filter'], bypassed: false },
      { type: 'Filter', channel: 1, names: [], bypassed: false },
    ],
    processors: {},
  };

  beforeAll(async () => {
    // Start control server
    controlServer = new WebSocketServer({ port: CONTROL_PORT });
    controlServer.on('connection', (ws) => {
      ws.on('message', (data) => {
        const request = JSON.parse(data.toString());
        const command = typeof request === 'string' ? request : Object.keys(request)[0];

        switch (command) {
          case 'GetConfigJson':
            ws.send(
              JSON.stringify({
                GetConfigJson: {
                  result: 'Ok',
                  value: JSON.stringify(mockConfig),
                },
              })
            );
            break;

          case 'SetConfigJson':
            ws.send(
              JSON.stringify({
                SetConfigJson: { result: 'Ok', value: true },
              })
            );
            break;

          case 'GetVersion':
            ws.send(
              JSON.stringify({
                GetVersion: { result: 'Ok', value: '2.0.0' },
              })
            );
            break;

          default:
            ws.send(
              JSON.stringify({
                [command]: { result: 'Error', value: 'Unknown command' },
              })
            );
        }
      });
    });

    // Start spectrum server
    spectrumServer = new WebSocketServer({ port: SPECTRUM_PORT });
    spectrumServer.on('connection', (ws) => {
      ws.on('message', (data) => {
        const message = data.toString().replace(/"/g, '');

        if (message === 'GetPlaybackSignalPeak') {
          // Return 256 bins (mock spectrum data)
          const bins = Array.from({ length: 256 }, (_, i) => {
            const freq = i / 256;
            return 0.3 + Math.sin(freq * Math.PI * 4) * 0.2;
          });
          
          ws.send(
            JSON.stringify({
              GetPlaybackSignalPeak: {
                result: 'Ok',
                value: bins,
              },
            })
          );
        }
      });
    });

    // Wait for servers to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      controlServer.close(() => {
        spectrumServer.close(() => resolve());
      });
    });
  });

  beforeEach(() => {
    dsp = new CamillaDSP();
  });

  describe('Connection', () => {
    it('should connect to both control and spectrum sockets', async () => {
      const connected = await dsp.connect('localhost', CONTROL_PORT, SPECTRUM_PORT);

      expect(connected).toBe(true);
      expect(dsp.connected).toBe(true);
      expect(dsp.spectrumConnected).toBe(true);

      dsp.disconnect();
    });

    it('should download and normalize config after connection', async () => {
      await dsp.connect('localhost', CONTROL_PORT, SPECTRUM_PORT);

      expect(dsp.config).toBeDefined();
      expect(dsp.config?.devices).toEqual(mockConfig.devices);
      expect(dsp.config?.filters).toEqual(mockConfig.filters);
      expect(dsp.config?.processors).toEqual({}); // Always normalized to empty object

      dsp.disconnect();
    });

    it('should return false if no server specified', async () => {
      const connected = await dsp.connect();

      expect(connected).toBe(false);
      expect(dsp.connected).toBe(false);
    });
  });

  describe('Config Operations', () => {
    beforeEach(async () => {
      await dsp.connect('localhost', CONTROL_PORT, SPECTRUM_PORT);
    });

    afterEach(() => {
      dsp.disconnect();
    });

    it('should download config', async () => {
      const success = await dsp.downloadConfig();

      expect(success).toBe(true);
      expect(dsp.config).toBeDefined();
      expect(dsp.config?.filters['test-filter']).toBeDefined();
    });

    it('should upload config', async () => {
      const success = await dsp.uploadConfig();

      expect(success).toBe(true);
    });

    it('should validate config before upload', async () => {
      // Invalid config - mixer references non-existent mixer
      dsp.config = {
        ...mockConfig,
        pipeline: [
          { type: 'Mixer', name: 'nonexistent', bypassed: false },
        ],
      };

      const success = await dsp.uploadConfig();

      expect(success).toBe(false);
    });

    it('should validate filter references in pipeline', async () => {
      // Invalid config - filter references non-existent filter
      dsp.config = {
        ...mockConfig,
        pipeline: [
          { type: 'Filter', channel: 0, names: ['nonexistent-filter'], bypassed: false },
        ],
      };

      const valid = dsp.validateConfig();

      expect(valid).toBe(false);
    });
  });

  describe('Spectrum Data', () => {
    beforeEach(async () => {
      await dsp.connect('localhost', CONTROL_PORT, SPECTRUM_PORT);
    });

    afterEach(() => {
      dsp.disconnect();
    });

    it('should get spectrum data', async () => {
      const data = await dsp.getSpectrumData();

      expect(data).toBeDefined();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(2); // Should be 256 bins
      expect(data.length).toBe(256);
    });
  });

  describe('Disconnect', () => {
    it('should disconnect properly', async () => {
      await dsp.connect('localhost', CONTROL_PORT, SPECTRUM_PORT);
      expect(dsp.connected).toBe(true);

      dsp.disconnect();

      expect(dsp.connected).toBe(false);
      expect(dsp.spectrumConnected).toBe(false);
    });
  });
});
