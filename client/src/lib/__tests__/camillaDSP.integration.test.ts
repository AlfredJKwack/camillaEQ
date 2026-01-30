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

          case 'Reload':
            ws.send(
              JSON.stringify({
                Reload: { result: 'Ok', value: 'Config reloaded' },
              })
            );
            break;

          case 'GetState':
            ws.send(
              JSON.stringify({
                GetState: { result: 'Ok', value: 'Running' },
              })
            );
            break;

          case 'GetVolume':
            ws.send(
              JSON.stringify({
                GetVolume: { result: 'Ok', value: 0 },
              })
            );
            break;

          case 'SetVolume':
            ws.send(
              JSON.stringify({
                SetVolume: { result: 'Ok', value: true },
              })
            );
            break;

          case 'GetVersion':
            ws.send(
              JSON.stringify({
                GetVersion: { result: 'Ok', value: '3.0.0' },
              })
            );
            break;

          case 'GetConfig':
            ws.send(
              JSON.stringify({
                GetConfig: { result: 'Ok', value: 'devices:\n  samplerate: 48000' },
              })
            );
            break;

          case 'GetConfigTitle':
            ws.send(
              JSON.stringify({
                GetConfigTitle: { result: 'Ok', value: 'Test Config Title' },
              })
            );
            break;

          case 'GetConfigDescription':
            ws.send(
              JSON.stringify({
                GetConfigDescription: { result: 'Ok', value: 'Test config description' },
              })
            );
            break;

          case 'GetAvailableCaptureDevices':
            ws.send(
              JSON.stringify({
                GetAvailableCaptureDevices: {
                  result: 'Ok',
                  value: [
                    ['hw:0,0', 'Test Capture Device'],
                    ['default', null],
                  ],
                },
              })
            );
            break;

          case 'GetAvailablePlaybackDevices':
            ws.send(
              JSON.stringify({
                GetAvailablePlaybackDevices: {
                  result: 'Ok',
                  value: [
                    ['hw:0,0', 'Test Playback Device'],
                    ['default', null],
                  ],
                },
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
        const request = JSON.parse(data.toString());
        const message = typeof request === 'string' ? request : Object.keys(request)[0];

        if (message === 'GetPlaybackSignalPeak') {
          // Return 256 bins (mock spectrum data in dBFS)
          const minDb = -100;
          const maxDb = -12;
          
          const bins = Array.from({ length: 256 }, (_, i) => {
            const freq = i / 256;
            const magnitude = 0.3 + Math.sin(freq * Math.PI * 4) * 0.2;
            // Convert [0..1] to dBFS
            return minDb + magnitude * (maxDb - minDb);
          });
          
          ws.send(
            JSON.stringify({
              GetPlaybackSignalPeak: {
                result: 'Ok',
                value: bins,
              },
            })
          );
        } else if (message === 'GetConfig') {
          ws.send(
            JSON.stringify({
              GetConfig: { result: 'Ok', value: 'devices:\n  samplerate: 48000\n  chunksize: 1024' },
            })
          );
        } else if (message === 'GetConfigTitle') {
          ws.send(
            JSON.stringify({
              GetConfigTitle: { result: 'Ok', value: 'Spectrum Config Title' },
            })
          );
        } else if (message === 'GetConfigDescription') {
          ws.send(
            JSON.stringify({
              GetConfigDescription: { result: 'Ok', value: 'Spectrum config description' },
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

    it('should upload config and reload', async () => {
      const success = await dsp.uploadConfig();

      expect(success).toBe(true);
      // Note: uploadConfig now also calls reload internally
    });

    it('should reload config', async () => {
      const success = await dsp.reload();

      expect(success).toBe(true);
    });

    it('should get DSP state', async () => {
      const state = await dsp.getState();

      expect(state).toBe('Running');
    });

    it('should get volume', async () => {
      const volume = await dsp.getVolume();

      expect(typeof volume).toBe('number');
    });

    it('should set volume', async () => {
      const success = await dsp.setVolume(-10);

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

  describe('DSP Info Methods (MVP-17)', () => {
    beforeEach(async () => {
      await dsp.connect('localhost', CONTROL_PORT, SPECTRUM_PORT);
    });

    afterEach(() => {
      dsp.disconnect();
    });

    it('should get CamillaDSP version', async () => {
      const version = await dsp.getVersion();

      expect(version).toBe('3.0.0');
    });

    it('should get available capture devices', async () => {
      const devices = await dsp.getAvailableCaptureDevices('Alsa');

      expect(devices).toBeDefined();
      expect(Array.isArray(devices)).toBe(true);
      expect(devices!.length).toBeGreaterThan(0);
      expect(devices![0]).toEqual(['hw:0,0', 'Test Capture Device']);
    });

    it('should get available playback devices', async () => {
      const devices = await dsp.getAvailablePlaybackDevices('Alsa');

      expect(devices).toBeDefined();
      expect(Array.isArray(devices)).toBe(true);
      expect(devices!.length).toBeGreaterThan(0);
      expect(devices![0]).toEqual(['hw:0,0', 'Test Playback Device']);
    });

    it('should get config YAML from control socket', async () => {
      const yaml = await dsp.getConfigYaml('control');

      expect(yaml).toBeDefined();
      expect(typeof yaml).toBe('string');
      expect(yaml).toContain('devices');
      expect(yaml).toContain('samplerate');
    });

    it('should get config YAML from spectrum socket', async () => {
      const yaml = await dsp.getConfigYaml('spectrum');

      expect(yaml).toBeDefined();
      expect(typeof yaml).toBe('string');
      expect(yaml).toContain('devices');
    });

    it('should get config title from control socket', async () => {
      const title = await dsp.getConfigTitle('control');

      expect(title).toBe('Test Config Title');
    });

    it('should get config title from spectrum socket', async () => {
      const title = await dsp.getConfigTitle('spectrum');

      expect(title).toBe('Spectrum Config Title');
    });

    it('should get config description from control socket', async () => {
      const desc = await dsp.getConfigDescription('control');

      expect(desc).toBe('Test config description');
    });

    it('should get config description from spectrum socket', async () => {
      const desc = await dsp.getConfigDescription('spectrum');

      expect(desc).toBe('Spectrum config description');
    });
  });

  describe('Success/Failure Callbacks (MVP-17)', () => {
    beforeEach(async () => {
      await dsp.connect('localhost', CONTROL_PORT, SPECTRUM_PORT);
    });

    afterEach(() => {
      dsp.disconnect();
    });

    it('should call onDspSuccess callback on successful command', async () => {
      let successCalled = false;
      let successInfo: any = null;

      dsp.onDspSuccess = (info) => {
        successCalled = true;
        successInfo = info;
      };

      await dsp.getVersion();

      expect(successCalled).toBe(true);
      expect(successInfo).toBeDefined();
      expect(successInfo.socket).toBe('control');
      expect(successInfo.command).toBe('GetVersion');
      expect(successInfo.response).toBe('3.0.0');
    });

    it('should call onDspFailure callback on failed command', async () => {
      let failureCalled = false;
      let failureInfo: any = null;

      dsp.onDspFailure = (info) => {
        failureCalled = true;
        failureInfo = info;
      };

      try {
        // Send an unknown command (will fail)
        await (dsp as any).sendDSPMessage('UnknownCommand');
      } catch (error) {
        // Expected to throw
      }

      expect(failureCalled).toBe(true);
      expect(failureInfo).toBeDefined();
      expect(failureInfo.socket).toBe('control');
      expect(failureInfo.command).toBe('UnknownCommand');
    });
  });
});
