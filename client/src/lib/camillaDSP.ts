/**
 * CamillaDSP client module
 * Implements WebSocket communication with CamillaDSP backend
 * Based on docs/api-contract-camillaDSP.md specification
 */

export interface CamillaDSPConfig {
  devices: {
    capture: { channels: number; [k: string]: any };
    playback: { channels: number; [k: string]: any };
    [k: string]: any;
  };
  filters: Record<string, FilterDefinition>;
  mixers: Record<string, MixerDefinition>;
  pipeline: PipelineStep[];
  processors?: Record<string, any>;
}

export interface FilterDefinition {
  type: string;
  description?: string;
  parameters: Record<string, any>;
}

export interface MixerDefinition {
  description?: string;
  channels: { in: number; out: number };
  mapping: Array<{
    dest: number;
    sources: Array<{
      channel: number;
      gain: number;
      inverted: boolean;
      mute: boolean;
      scale: 'dB' | 'linear' | string;
    }>;
    mute: boolean;
  }>;
}

export type PipelineStep =
  | { type: 'Mixer'; name: string; description?: string; bypassed?: boolean }
  | { type: 'Filter'; channels: number[]; names: string[]; description?: string; bypassed?: boolean }
  | { type: string; [k: string]: any };

interface DSPResponse {
  result: 'Ok' | 'Error' | string;
  value: any;
}

/**
 * CamillaDSP client class
 */
export class CamillaDSP {
  private ws: WebSocket | null = null;
  private wsSpectrum: WebSocket | null = null;
  private server: string = '';
  private port: number = 0;
  private spectrumPort: number = 0;
  
  public connected: boolean = false;
  public spectrumConnected: boolean = false;
  public config: CamillaDSPConfig | null = null;

  // Default mixer configuration
  private readonly defaultMixer = {
    recombine: {
      description: 'CamillaEQ Default Mixer',
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
  };

  // Default pipeline configuration (v3-compatible)
  private readonly defaultPipeline: PipelineStep[] = [
    {
      type: 'Mixer',
      name: 'recombine',
      description: 'CamillaEQ Default Mixer',
      bypassed: false,
    },
    {
      type: 'Filter',
      channels: [0],
      names: [],
      description: 'Channel 0 Filters',
      bypassed: false,
    },
    {
      type: 'Filter',
      channels: [1],
      names: [],
      description: 'Channel 1 Filters',
      bypassed: false,
    },
  ];

  /**
   * Connect to CamillaDSP backend
   */
  async connect(server?: string, port?: number, spectrumPort?: number): Promise<boolean> {
    // Use provided params or try localStorage
    this.server = server || localStorage.getItem('camillaDSP.server') || '';
    // Support both 'controlPort' (new) and 'port' (legacy) keys
    this.port = port || 
                Number(localStorage.getItem('camillaDSP.controlPort')) || 
                Number(localStorage.getItem('camillaDSP.port')) || 
                0;
    this.spectrumPort = spectrumPort || Number(localStorage.getItem('camillaDSP.spectrumPort')) || 0;

    if (!this.server) {
      console.error('No server specified');
      return false;
    }

    try {
      // Connect to control socket
      this.ws = await this.connectToDSP(this.server, this.port);
      this.connected = true;
      console.log('Connected to DSP control socket');

      // Connect to spectrum socket
      try {
        this.wsSpectrum = await this.connectToDSP(this.server, this.spectrumPort);
        this.spectrumConnected = true;
        console.log('Connected to DSP spectrum socket');
      } catch (error) {
        console.error('Failed to connect to spectrum socket:', error);
        this.spectrumConnected = false;
      }

      // Initialize after connection
      const initSuccess = await this.initAfterConnection();
      if (!initSuccess) {
        console.error('Configuration initialization failed');
        return false;
      }

      // Save to localStorage (use 'controlPort' as primary key)
      localStorage.setItem('camillaDSP.server', this.server);
      localStorage.setItem('camillaDSP.controlPort', String(this.port));
      localStorage.setItem('camillaDSP.spectrumPort', String(this.spectrumPort));

      return true;
    } catch (error) {
      console.error('Connection error:', error);
      this.connected = false;
      return false;
    }
  }

  /**
   * Initialize after successful connection
   */
  private async initAfterConnection(): Promise<boolean> {
    try {
      await this.downloadConfig();
      if (this.config) {
        // Debug: Log raw downloaded config before normalization
        console.log('Raw downloaded config:', {
          filters: Object.keys(this.config.filters || {}).length,
          mixers: Object.keys(this.config.mixers || {}).length,
          pipeline: this.config.pipeline?.length || 0,
          pipelineSteps: this.config.pipeline?.map(step => ({
            type: step.type,
            names: (step as any).names?.length || 0,
          })),
        });
        
        this.config = this.getDefaultConfig(this.config);
      }
      return true;
    } catch (error) {
      console.error('Initialization error:', error);
      return false;
    }
  }

  /**
   * Connect to a WebSocket endpoint
   */
  private connectToDSP(server: string, port: number): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      if (!server) {
        reject(new Error('No server string specified'));
        return;
      }

      const ws = new WebSocket(`ws://${server}:${port}`);

      const onOpen = () => {
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('error', onError);
        resolve(ws);
      };

      const onError = (error: Event) => {
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('error', onError);
        reject(error);
      };

      ws.addEventListener('open', onOpen);
      ws.addEventListener('error', onError);
    });
  }

  /**
   * Handle incoming DSP message
   * Improved: extracts error details from various response formats
   */
  private static handleDSPMessage(data: string): [boolean, any] {
    const res = JSON.parse(data);
    const responseCommand = Object.keys(res)[0];
    const response: DSPResponse = res[responseCommand];
    const { result, value } = response;

    // Special case: GetConfigJson returns JSON string that needs parsing
    if (responseCommand === 'GetConfigJson' && result === 'Ok') {
      return [true, JSON.parse(value)];
    }

    // On error, try to extract meaningful error message
    if (result !== 'Ok') {
      let errorMsg = value;
      
      // If value is falsy, try other fields
      if (!errorMsg) {
        errorMsg = (response as any).error || (response as any).message;
      }
      
      // If still no error, stringify the whole response
      if (!errorMsg) {
        errorMsg = JSON.stringify(response);
      }
      
      return [false, errorMsg];
    }

    return [true, value];
  }

  /**
   * Send message to DSP control socket
   * Fixed: properly removes event listener to avoid leaks
   */
  private sendDSPMessage(message: string | Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const commandName = typeof message === 'string' ? message : Object.keys(message)[0];

      const onMessage = (event: MessageEvent) => {
        const res = JSON.parse(event.data);
        const responseCommand = Object.keys(res)[0];

        // Only handle responses for our command
        if (responseCommand !== commandName) {
          return;
        }

        // Remove listener after handling (FIX: prevent memory leak)
        this.ws!.removeEventListener('message', onMessage);

        const [success, value] = CamillaDSP.handleDSPMessage(event.data);
        if (success) {
          resolve(value);
        } else {
          reject(new Error(`DSP command failed: ${commandName} - ${value || '<no error message>'}`));
        }
      };

      this.ws.addEventListener('message', onMessage);
      this.ws.send(JSON.stringify(message));
    });
  }

  /**
   * Send message to spectrum socket
   */
  private sendSpectrumMessage(message: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.wsSpectrum || this.wsSpectrum.readyState !== WebSocket.OPEN) {
        reject(new Error('Spectrum WebSocket not connected'));
        return;
      }

      const onMessage = (event: MessageEvent) => {
        const res = JSON.parse(event.data);
        const responseCommand = Object.keys(res)[0];

        if (responseCommand !== message) {
          return;
        }

        // Remove listener after handling
        this.wsSpectrum!.removeEventListener('message', onMessage);

        const [success, value] = CamillaDSP.handleDSPMessage(event.data);
        if (success) {
          resolve(value);
        } else {
          reject(new Error(`Spectrum command failed: ${message} - ${value}`));
        }
      };

      this.wsSpectrum.addEventListener('message', onMessage);
      this.wsSpectrum.send(JSON.stringify(message));
    });
  }

  /**
   * Download config from DSP
   */
  async downloadConfig(): Promise<boolean> {
    try {
      this.config = await this.sendDSPMessage('GetConfigJson');
      return true;
    } catch (error) {
      console.error('Error downloading config:', error);
      return false;
    }
  }

  /**
   * Upload config to DSP
   * In v3, SetConfigJson applies directly - no Reload needed
   */
  async uploadConfig(): Promise<boolean> {
    if (!this.config) {
      console.error('No config to upload');
      return false;
    }

    if (!this.validateConfig()) {
      console.error('Invalid configuration');
      return false;
    }

    try {
      // Upload config (v3: SetConfigJson applies directly)
      await this.sendDSPMessage({
        SetConfigJson: JSON.stringify(this.config),
      });
      
      // Re-download to confirm what CamillaDSP accepted
      await this.downloadConfig();
      
      return true;
    } catch (error) {
      console.error('Error uploading config:', error);
      return false;
    }
  }

  /**
   * Reload config (apply changes)
   */
  async reload(): Promise<boolean> {
    try {
      await this.sendDSPMessage('Reload');
      return true;
    } catch (error) {
      console.error('Error reloading config:', error);
      return false;
    }
  }

  /**
   * Get DSP state
   */
  async getState(): Promise<string | null> {
    try {
      return await this.sendDSPMessage('GetState');
    } catch (error) {
      console.error('Error getting state:', error);
      return null;
    }
  }

  /**
   * Get volume
   */
  async getVolume(): Promise<number | null> {
    try {
      return await this.sendDSPMessage('GetVolume');
    } catch (error) {
      console.error('Error getting volume:', error);
      return null;
    }
  }

  /**
   * Set volume
   */
  async setVolume(volume: number): Promise<boolean> {
    try {
      await this.sendDSPMessage({ SetVolume: volume });
      return true;
    } catch (error) {
      console.error('Error setting volume:', error);
      return false;
    }
  }

  /**
   * Validate config structure
   */
  validateConfig(): boolean {
    if (!this.config) {
      return false;
    }

    // Check if mixers in pipeline are defined
    const mixers = this.config.pipeline.filter((e) => e.type === 'Mixer');
    for (const mixer of mixers) {
      if (!this.config.mixers[(mixer as any).name]) {
        console.error(`Mixer "${(mixer as any).name}" not found in config.mixers`);
        return false;
      }
    }

    // Check if filters in pipeline exist in filters
    const filters = this.config.pipeline.filter((e) => e.type === 'Filter');
    for (const filter of filters) {
      const names = (filter as any).names || [];
      for (const filterName of names) {
        if (!this.config.filters[filterName]) {
          console.error(`Filter "${filterName}" not found in config.filters`);
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Get default/normalized config
   * Preserves all data from CamillaDSP, only fills missing required fields
   */
  private getDefaultConfig(config: Partial<CamillaDSPConfig>): CamillaDSPConfig {
    return {
      // Preserve devices or use default
      devices: config.devices || { capture: { channels: 2 }, playback: { channels: 2 } },
      
      // Preserve filters, mixers, pipeline as-is (even if empty)
      filters: config.filters || {},
      mixers: config.mixers || {},
      pipeline: config.pipeline || [],
      
      // Ensure processors exists
      processors: config.processors || {},
    };
  }

  /**
   * Get spectrum data
   */
  async getSpectrumData(): Promise<any> {
    try {
      return await this.sendSpectrumMessage('GetPlaybackSignalPeak');
    } catch (error) {
      console.error('Error getting spectrum data:', error);
      return null;
    }
  }

  /**
   * Disconnect from DSP
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.wsSpectrum) {
      this.wsSpectrum.close();
      this.wsSpectrum = null;
    }
    this.connected = false;
    this.spectrumConnected = false;
  }
}
