/**
 * Mock CamillaDSP WebSocket server for testing
 * Implements minimal protocol per docs/api-contract-camillaDSP.md
 */

import { WebSocketServer, WebSocket } from 'ws';

export interface MockCamillaDSPOptions {
  controlPort?: number;
  spectrumPort?: number;
}

const DEFAULT_CONTROL_PORT = 3146;
const DEFAULT_SPECTRUM_PORT = 6413;

export class MockCamillaDSP {
  private controlServer: WebSocketServer | null = null;
  private spectrumServer: WebSocketServer | null = null;
  private controlPort: number;
  private spectrumPort: number;
  private config: any = null;

  constructor(options: MockCamillaDSPOptions = {}) {
    this.controlPort = options.controlPort || DEFAULT_CONTROL_PORT;
    this.spectrumPort = options.spectrumPort || DEFAULT_SPECTRUM_PORT;
  }

  /**
   * Start both WebSocket servers
   */
  async start(): Promise<void> {
    await Promise.all([
      this.startControlServer(),
      this.startSpectrumServer(),
    ]);
  }

  /**
   * Start control WebSocket server
   */
  private async startControlServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.controlServer = new WebSocketServer({ port: this.controlPort });

        this.controlServer.on('listening', () => {
          console.log(`Mock CamillaDSP control server listening on port ${this.controlPort}`);
          resolve();
        });

        this.controlServer.on('error', (error: any) => {
          console.error('Control server error:', error);
          reject(error);
        });

        this.controlServer.on('connection', (ws: WebSocket) => {
          ws.on('message', (data: Buffer) => {
            this.handleControlMessage(ws, data.toString());
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Start spectrum WebSocket server
   */
  private async startSpectrumServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.spectrumServer = new WebSocketServer({ port: this.spectrumPort });

        this.spectrumServer.on('listening', () => {
          console.log(`Mock CamillaDSP spectrum server listening on port ${this.spectrumPort}`);
          resolve();
        });

        this.spectrumServer.on('error', (error: any) => {
          console.error('Spectrum server error:', error);
          reject(error);
        });

        this.spectrumServer.on('connection', (ws: WebSocket) => {
          ws.on('message', (data: Buffer) => {
            this.handleSpectrumMessage(ws, data.toString());
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle control socket messages
   */
  private handleControlMessage(ws: WebSocket, message: string): void {
    try {
      const request = JSON.parse(message);
      const command = typeof request === 'string' ? request : Object.keys(request)[0];

      switch (command) {
        case 'GetVersion':
          this.sendResponse(ws, 'GetVersion', { result: 'Ok', value: '2.0.0' });
          break;

        case 'GetConfigJson':
          this.sendResponse(ws, 'GetConfigJson', {
            result: 'Ok',
            value: JSON.stringify(this.getDefaultConfig()),
          });
          break;

        case 'SetConfigJson':
          this.config = JSON.parse(request.SetConfigJson);
          this.sendResponse(ws, 'SetConfigJson', { result: 'Ok', value: true });
          break;

        case 'Reload':
          this.sendResponse(ws, 'Reload', { result: 'Ok', value: 'Config reloaded' });
          break;

        case 'GetState':
          this.sendResponse(ws, 'GetState', { result: 'Ok', value: 'Running' });
          break;

        case 'GetVolume':
          this.sendResponse(ws, 'GetVolume', { result: 'Ok', value: 0 });
          break;

        case 'SetVolume':
          this.sendResponse(ws, 'SetVolume', { result: 'Ok', value: true });
          break;

        case 'GetCaptureRate':
          this.sendResponse(ws, 'GetCaptureRate', { result: 'Ok', value: 44100 });
          break;

        case 'GetProcessingLoad':
          this.sendResponse(ws, 'GetProcessingLoad', { result: 'Ok', value: 5.2 });
          break;

        default:
          console.warn(`Unhandled command: ${command}`);
          this.sendResponse(ws, command, { result: 'Error', value: 'Unknown command' });
      }
    } catch (error) {
      console.error('Error handling control message:', error);
    }
  }

  /**
   * Handle spectrum socket messages
   */
  private handleSpectrumMessage(ws: WebSocket, message: string): void {
    try {
      const request = message.replace(/"/g, '');

      switch (request) {
        case 'GetPlaybackSignalPeak':
          this.sendResponse(ws, 'GetPlaybackSignalPeak', {
            result: 'Ok',
            value: this.generateMockSpectrumData(),
          });
          break;

        case 'GetPlaybackSignalRms':
          this.sendResponse(ws, 'GetPlaybackSignalRms', {
            result: 'Ok',
            value: this.generateMockSpectrumData(),
          });
          break;

        case 'SetUpdateInterval':
          this.sendResponse(ws, 'SetUpdateInterval', { result: 'Ok', value: true });
          break;

        default:
          console.warn(`Unhandled spectrum command: ${request}`);
          this.sendResponse(ws, request, { result: 'Error', value: 'Unknown command' });
      }
    } catch (error) {
      console.error('Error handling spectrum message:', error);
    }
  }

  /**
   * Send response to client
   */
  private sendResponse(ws: WebSocket, command: string, response: any): void {
    const message = { [command]: response };
    ws.send(JSON.stringify(message));
  }

  /**
   * Generate mock spectrum data in dBFS format (MVP-16)
   * Returns 256 frequency bins with a realistic-looking curve
   * Range: -100 dBFS (silence) to -12 dBFS (typical peak)
   */
  private generateMockSpectrumData(): number[] {
    const numBins = 256;
    const bins: number[] = [];
    const time = Date.now() / 1000; // Use time for gentle animation
    
    const minDb = -100;
    const maxDb = -12;
    
    for (let i = 0; i < numBins; i++) {
      const freq = i / numBins; // Normalized frequency [0..1]
      
      // Create a multi-band spectrum curve (normalized 0..1)
      // Low frequencies: stronger
      const lowBand = Math.exp(-freq * 3) * 0.6;
      
      // Mid frequencies: moderate with a bump around 0.3-0.5
      const midBump = Math.exp(-Math.pow((freq - 0.4) * 4, 2)) * 0.4;
      
      // High frequencies: weaker, rolling off
      const highBand = Math.exp(-Math.pow((freq - 0.7) * 2, 2)) * 0.3;
      
      // Combine bands
      let magnitude = lowBand + midBump + highBand;
      
      // Add gentle time-based variation (breathing effect)
      const breathe = 0.8 + 0.2 * Math.sin(time * 0.5 + freq * Math.PI);
      magnitude *= breathe;
      
      // Add subtle noise for realism
      const noise = (Math.random() - 0.5) * 0.05;
      magnitude += noise;
      
      // Clamp to [0..1] range
      magnitude = Math.max(0, Math.min(1, magnitude));
      
      // Convert to dBFS: map [0..1] → [minDb..maxDb]
      const db = minDb + magnitude * (maxDb - minDb);
      bins.push(db);
    }
    
    return bins;
  }

  /**
   * Get default config
   */
  private getDefaultConfig(): any {
    if (this.config) {
      return this.config;
    }

    return {
      devices: {
        capture: {
          channels: 2,
          type: 'Alsa',
          device: 'hw:0',
        },
        playback: {
          channels: 2,
          type: 'Alsa',
          device: 'hw:0',
        },
      },
      filters: {},
      mixers: {
        recombine: {
          description: 'Mock Default Mixer',
          channels: { in: 2, out: 2 },
          mapping: [
            {
              dest: 0,
              sources: [
                { channel: 0, gain: 0, inverted: false, mute: false, scale: 'dB' },
                { channel: 1, gain: 0, inverted: false, mute: true, scale: 'dB' },
              ],
              mute: false,
            },
            {
              dest: 1,
              sources: [
                { channel: 1, gain: 0, inverted: false, mute: false, scale: 'dB' },
                { channel: 0, gain: 0, inverted: false, mute: true, scale: 'dB' },
              ],
              mute: false,
            },
          ],
        },
      },
      pipeline: [
        {
          type: 'Mixer',
          name: 'recombine',
          description: 'Mock Default Mixer',
          bypassed: false,
        },
        {
          type: 'Filter',
          channel: 0,
          names: [],
          description: 'Channel 0 Filters',
          bypassed: false,
        },
        {
          type: 'Filter',
          channel: 1,
          names: [],
          description: 'Channel 1 Filters',
          bypassed: false,
        },
      ],
      processors: {},
    };
  }

  /**
   * Stop both servers
   */
  async stop(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.controlServer) {
      promises.push(
        new Promise((resolve) => {
          this.controlServer!.close(() => {
            console.log('Mock control server stopped');
            resolve();
          });
        })
      );
    }

    if (this.spectrumServer) {
      promises.push(
        new Promise((resolve) => {
          this.spectrumServer!.close(() => {
            console.log('Mock spectrum server stopped');
            resolve();
          });
        })
      );
    }

    await Promise.all(promises);
  }
}
