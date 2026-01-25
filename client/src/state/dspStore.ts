/**
 * Global CamillaDSP session store
 * Singleton DSP instance shared across all pages
 */

import { writable, derived, get } from 'svelte/store';
import { CamillaDSP, type CamillaDSPConfig } from '../lib/camillaDSP';
import { debounce } from '../lib/debounce';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface DspState {
  connectionState: ConnectionState;
  lastError?: string;
  config?: CamillaDSPConfig;
  volumeDb?: number;
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
});

// Derived stores for convenience
export const connectionState = derived(dspState, ($state) => $state.connectionState);
export const lastError = derived(dspState, ($state) => $state.lastError);
export const dspConfig = derived(dspState, ($state) => $state.config);
export const dspVolume = derived(dspState, ($state) => $state.volumeDb ?? 0);

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
      
      // Fetch initial volume
      await refreshVolume();
      
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
  }

  return connected;
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
