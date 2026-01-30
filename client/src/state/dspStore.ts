/**
 * Global CamillaDSP session store
 * Singleton DSP instance shared across all pages
 */

import { writable, derived, get } from 'svelte/store';
import { CamillaDSP, type CamillaDSPConfig, type DeviceEntry, type DspEventInfo } from '../lib/camillaDSP';
import { debounce } from '../lib/debounce';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface FailureEntry {
  timestampMs: number;
  socket: 'control' | 'spectrum';
  command: string;
  request: string;
  response: any;
}

export interface DspState {
  connectionState: ConnectionState;
  lastError?: string;
  config?: CamillaDSPConfig;
  volumeDb?: number;
  version?: string;
  availableDevices?: {
    capture: DeviceEntry[];
    playback: DeviceEntry[];
    backend: string;
  };
  currentConfigs?: {
    control: { title?: string; description?: string; yaml?: string };
    spectrum: { title?: string; description?: string; yaml?: string };
  };
  failures: FailureEntry[];
}

// Internal state
let dspInstance: CamillaDSP | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000]; // ms: 1s, 2s, 5s, 10s, 30s

// Volume control (debounced)
const VOLUME_DEBOUNCE_MS = 200;
const debouncedSetVolume = debounce(async (volumeDb: number) => {
  if (!dspInstance || !dspInstance.connected) return;
  
  try {
    const success = await dspInstance.setVolume(volumeDb);
    if (success) {
      // Update store with confirmed value
      dspState.update((s) => ({ ...s, volumeDb }));
    }
  } catch (error) {
    console.error('Failed to set volume:', error);
  }
}, VOLUME_DEBOUNCE_MS);

// Stores
export const dspState = writable<DspState>({
  connectionState: 'disconnected',
  failures: [],
});

// Derived stores for convenience
export const connectionState = derived(dspState, ($state) => $state.connectionState);
export const lastError = derived(dspState, ($state) => $state.lastError);
export const dspConfig = derived(dspState, ($state) => $state.config);
export const dspVolume = derived(dspState, ($state) => $state.volumeDb ?? 0);
export const dspVersion = derived(dspState, ($state) => $state.version);
export const dspDevices = derived(dspState, ($state) => $state.availableDevices);
export const dspConfigs = derived(dspState, ($state) => $state.currentConfigs);
export const dspFailures = derived(dspState, ($state) => $state.failures);

/**
 * Get the singleton DSP instance
 */
export function getDspInstance(): CamillaDSP | null {
  return dspInstance;
}

/**
 * Connect to CamillaDSP with provided parameters
 */
export async function connect(
  server: string,
  controlPort: number,
  spectrumPort: number
): Promise<boolean> {
  // Cancel any pending reconnects
  cancelReconnect();

  // Update state to connecting
  dspState.update((s) => ({
    ...s,
    connectionState: 'connecting',
    lastError: undefined,
  }));

  try {
    // Create new instance if needed
    if (!dspInstance) {
      dspInstance = new CamillaDSP();
    } else {
      // Disconnect existing connection first
      dspInstance.disconnect();
    }

    // Attempt connection
    const connected = await dspInstance.connect(server, controlPort, spectrumPort);

    if (connected && dspInstance.config) {
      // Success
      reconnectAttempts = 0; // Reset attempts on successful connection
      dspState.update((s) => ({
        ...s,
        connectionState: 'connected',
        config: dspInstance!.config!,
        lastError: undefined,
      }));

      console.log('Global DSP connection established');
      
      // Debug: Log downloaded config shape
      console.log(`Downloaded config: ${Object.keys(dspInstance.config.filters || {}).length} filters`);
      
      // Hook up success/failure callbacks
      dspInstance.onDspSuccess = handleDspSuccess;
      dspInstance.onDspFailure = handleDspFailure;
      
      // Fetch initial volume and DSP info
      await refreshVolume();
      await refreshDspInfo();
      
      return true;
    } else {
      // Connection failed
      dspState.update((s) => ({
        ...s,
        connectionState: 'error',
        lastError: 'Connection failed',
      }));
      return false;
    }
  } catch (error) {
    console.error('DSP connection error:', error);
    dspState.update((s) => ({
      ...s,
      connectionState: 'error',
      lastError: error instanceof Error ? error.message : 'Connection failed',
    }));
    return false;
  }
}

/**
 * Disconnect from CamillaDSP
 */
export function disconnect(): void {
  // Stop any pending reconnect attempts
  cancelReconnect();

  if (dspInstance) {
    dspInstance.disconnect();
    dspInstance = null;
  }

  dspState.set({
    connectionState: 'disconnected',
    failures: [],
  });

  console.log('Global DSP connection closed');
}

/**
 * Cancel pending reconnect attempts
 */
function cancelReconnect(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
}

/**
 * Attempt to reconnect with exponential backoff
 */
async function attemptReconnect(
  server: string,
  controlPort: number,
  spectrumPort: number
): Promise<void> {
  // Check if auto-reconnect is enabled
  const autoReconnect = localStorage.getItem('camillaDSP.autoReconnect') === 'true';
  if (!autoReconnect) {
    console.log('Auto-reconnect disabled, not retrying');
    return;
  }

  // Check if we've exceeded max attempts
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log(`Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached, stopping`);
    dspState.update((s) => ({
      ...s,
      lastError: `Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts`,
    }));
    return;
  }

  // Calculate delay with exponential backoff
  const delayIndex = Math.min(reconnectAttempts, RECONNECT_DELAYS.length - 1);
  const delay = RECONNECT_DELAYS[delayIndex];

  reconnectAttempts++;
  console.log(
    `Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`
  );

  reconnectTimer = window.setTimeout(async () => {
    reconnectTimer = null;

    // Attempt connection
    const connected = await connect(server, controlPort, spectrumPort);

    // If failed, schedule another retry
    if (!connected) {
      await attemptReconnect(server, controlPort, spectrumPort);
    } else {
      // Success - reset attempts
      reconnectAttempts = 0;
      console.log('Reconnected successfully');
    }
  }, delay);
}

/**
 * Auto-connect from localStorage on startup
 */
export async function autoConnectFromLocalStorage(): Promise<boolean> {
  // Check if auto-reconnect is enabled
  const autoReconnect = localStorage.getItem('camillaDSP.autoReconnect') === 'true';
  if (!autoReconnect) {
    console.log('Auto-reconnect disabled, skipping startup connection');
    return false;
  }

  // Get stored connection params
  const server = localStorage.getItem('camillaDSP.server');
  const controlPort = localStorage.getItem('camillaDSP.controlPort');
  const spectrumPort = localStorage.getItem('camillaDSP.spectrumPort');

  if (!server || !controlPort || !spectrumPort) {
    console.log('No stored connection params, skipping auto-connect');
    return false;
  }

  console.log('Auto-connecting to stored CamillaDSP instance...');
  const connected = await connect(server, Number(controlPort), Number(spectrumPort));

  // If failed and auto-reconnect is enabled, start retry loop
  if (!connected) {
    await attemptReconnect(server, Number(controlPort), Number(spectrumPort));
    return false;
  }

  // After successful connect, check if we need to restore latest state
  await maybeRestoreLatestState();

  return connected;
}

/**
 * Restore latest DSP state from server if CamillaDSP returned empty config
 */
async function maybeRestoreLatestState(): Promise<void> {
  if (!dspInstance || !dspInstance.config) return;

  const config = dspInstance.config;
  const filterCount = Object.keys(config.filters || {}).length;
  
  // Count Filter steps that have actual filter names
  const filterSteps = config.pipeline?.filter((step) => step.type === 'Filter') || [];
  const hasFilterNames = filterSteps.some((step) => {
    const names = (step as any).names || [];
    return names.length > 0;
  });
  
  // Check if config has filters (more reliable than pipeline count)
  if (filterCount > 0 && hasFilterNames) {
    console.log(`CamillaDSP has ${filterCount} filters in use - using downloaded config`);
    
    // Initialize EQ store immediately
    try {
      const { initializeFromConfig } = await import('./eqStore');
      initializeFromConfig(config);
    } catch (error) {
      console.error('Error initializing EQ from downloaded config:', error);
    }
    
    return;
  }

  console.log('Downloaded config is empty, attempting to restore latest state from server');

  try {
    // Dynamically import to avoid circular dependency
    const { initializeFromConfig } = await import('./eqStore');

    // Fetch latest state from server
    const response = await fetch('/api/state/latest');
    if (!response.ok) {
      if (response.status === 404) {
        console.log('No latest state stored on server');
      } else {
        console.error(`Failed to fetch latest state: ${response.statusText}`);
      }
      return;
    }

    const latestConfig = await response.json();

    // Upload to CamillaDSP
    dspInstance.config = latestConfig;
    const success = await dspInstance.uploadConfig();

    if (!success) {
      console.error('Failed to upload restored state to CamillaDSP');
      return;
    }

    // Update store
    updateConfig(latestConfig);
    initializeFromConfig(latestConfig);

    console.log('Successfully restored latest state from server');
  } catch (error) {
    console.error('Error restoring latest state:', error);
  }
}

/**
 * Update stored config (called after successful uploads)
 */
export function updateConfig(config: CamillaDSPConfig): void {
  dspState.update((s) => ({
    ...s,
    config,
  }));
}

/**
 * Refresh volume from CamillaDSP
 */
export async function refreshVolume(): Promise<void> {
  if (!dspInstance || !dspInstance.connected) return;
  
  try {
    const volumeDb = await dspInstance.getVolume();
    if (volumeDb !== null) {
      dspState.update((s) => ({ ...s, volumeDb }));
    }
  } catch (error) {
    console.error('Failed to get volume:', error);
  }
}

/**
 * Set volume (debounced, live updates)
 * CamillaDSP range: -150 to +50 dB
 */
export function setVolumeDb(volumeDb: number): void {
  // Clamp to CamillaDSP spec range
  const clamped = Math.max(-150, Math.min(50, volumeDb));
  
  // Update UI immediately (optimistic)
  dspState.update((s) => ({ ...s, volumeDb: clamped }));
  
  // Debounced network call
  debouncedSetVolume(clamped);
}

/**
 * Refresh DSP info (version, devices, configs)
 */
export async function refreshDspInfo(): Promise<void> {
  if (!dspInstance || !dspInstance.connected) return;

  try {
    // Get version
    const version = await dspInstance.getVersion();
    
    // Determine backend from config
    const backend = dspInstance.config?.devices?.capture?.type || 
                    dspInstance.config?.devices?.playback?.type || 
                    'Alsa';
    
    // Get device lists
    const [captureDevices, playbackDevices] = await Promise.all([
      dspInstance.getAvailableCaptureDevices(backend),
      dspInstance.getAvailablePlaybackDevices(backend),
    ]);

    // Get control config info
    const [controlYaml, controlTitle, controlDesc] = await Promise.all([
      dspInstance.getConfigYaml('control'),
      dspInstance.getConfigTitle('control'),
      dspInstance.getConfigDescription('control'),
    ]);

    // Get spectrum config info
    const [spectrumYaml, spectrumTitle, spectrumDesc] = await Promise.all([
      dspInstance.getConfigYaml('spectrum'),
      dspInstance.getConfigTitle('spectrum'),
      dspInstance.getConfigDescription('spectrum'),
    ]);

    // Update state
    dspState.update((s) => ({
      ...s,
      version: version || undefined,
      availableDevices: captureDevices && playbackDevices ? {
        capture: captureDevices,
        playback: playbackDevices,
        backend,
      } : undefined,
      currentConfigs: {
        control: {
          title: controlTitle || undefined,
          description: controlDesc || undefined,
          yaml: controlYaml || undefined,
        },
        spectrum: {
          title: spectrumTitle || undefined,
          description: spectrumDesc || undefined,
          yaml: spectrumYaml || undefined,
        },
      },
    }));
  } catch (error) {
    console.error('Error refreshing DSP info:', error);
  }
}

/**
 * Handle DSP success (clears failures)
 */
function handleDspSuccess(info: DspEventInfo): void {
  dspState.update((s) => ({
    ...s,
    failures: [], // Clear all failures on any successful response
  }));
}

/**
 * Handle DSP failure (appends to failures list)
 */
function handleDspFailure(info: DspEventInfo): void {
  const failure: FailureEntry = {
    timestampMs: info.timestampMs,
    socket: info.socket,
    command: info.command,
    request: info.request,
    response: info.response,
  };

  dspState.update((s) => ({
    ...s,
    failures: [...s.failures, failure],
  }));
}
