/**
 * EQ band state management
 * Single source of truth for all band parameters
 * Uses global dspStore for connection/config
 */

import { writable, derived, get } from 'svelte/store';
import type { EqBand } from '../dsp/filterResponse';
import { generateCurvePath, generateBandCurvePath } from '../ui/rendering/EqSvgRenderer';
import type { CamillaDSP, CamillaDSPConfig } from '../lib/camillaDSP';
import {
  extractEqBandsFromConfig,
  applyEqBandsToConfig,
  type ExtractedEqData,
} from '../lib/camillaEqMapping';
import { debounceCancelable } from '../lib/debounce';
import { getDspInstance, updateConfig as updateDspConfig } from './dspStore';
import { putLatestState } from '../lib/api';
import { clampFreqHz, clampGainDb, clampQ } from '../lib/eqParamClamp';
import { disableFilterEverywhere, enableFilterEverywhere } from '../lib/filterEnablement';

// Upload debounce time (ms)
const UPLOAD_DEBOUNCE_MS = 200;

// Upload state (EQ-specific)
export type UploadState = 'idle' | 'pending' | 'success' | 'error';

export interface UploadStatus {
  state: UploadState;
  message?: string;
}

// Stores
export const bands = writable<EqBand[]>([]);
export const filterNames = writable<string[]>([]); // Filter names corresponding to each band
export const bandOrderNumbers = writable<number[]>([]); // Pipeline-relative position (1-based) for each band
export const selectedBandIndex = writable<number | null>(null);
export const uploadStatus = writable<UploadStatus>({ state: 'idle' });
export const preampGain = writable<number>(0); // Master-band gain (±24 dB)

// Internal state (not exported as stores)
let lastConfig: CamillaDSPConfig | null = null;
let extractedData: ExtractedEqData | null = null;

// Debounced upload function
const debouncedUpload = debounceCancelable(async () => {
  const dspInstance = getDspInstance();
  if (!dspInstance || !lastConfig || !extractedData) {
    return;
  }

  try {
    uploadStatus.set({ state: 'pending' });

    // Get current state
    const currentBands = get(bands);
    const currentPreampGain = get(preampGain);

    // Apply bands and preamp to config
    const updatedData: ExtractedEqData = {
      ...extractedData,
      bands: currentBands,
      preampGain: currentPreampGain,
    };
    const updatedConfig = applyEqBandsToConfig(lastConfig, updatedData) as any;

    // Update instance config
    dspInstance.config = updatedConfig;

    // Upload to CamillaDSP
    const success = await dspInstance.uploadConfig();

    if (success) {
      // Get confirmed config from DSP instance (post-download)
      const confirmedConfig = dspInstance.config! as CamillaDSPConfig;
      
      // Store confirmed config as new baseline
      lastConfig = confirmedConfig;
      updateDspConfig(confirmedConfig); // Sync global dspStore
      
      if (soloSessionActive) {
        // During a solo session the pipeline is temporarily patched (only the
        // active band is in names[]).  Re-extracting would collapse filterNames
        // to a single entry, shifting band positions, changing colours etc.
        // Instead we leave filterNames/bands/bandOrderNumbers unchanged and
        // only update lastConfig so parameter edits are captured correctly.
        uploadStatus.set({ state: 'success' });
      } else {
        // Re-extract EQ bands from confirmed config to ensure UI reflects
        // what DSP accepted.
        const reExtracted = extractEqBandsFromConfig(confirmedConfig);
        extractedData = reExtracted;
        bands.set(reExtracted.bands);
        filterNames.set(reExtracted.filterNames);
        bandOrderNumbers.set(reExtracted.orderNumbers);
        preampGain.set(reExtracted.preampGain);
        
        // Persist confirmed config to server as latest state (write-through)
        try {
          await putLatestState(confirmedConfig);
        } catch (error) {
          console.warn('Failed to persist latest state to server:', error);
          // Non-fatal: continue even if persistence fails
        }
        
        uploadStatus.set({ state: 'success' });
      }
      
      // Clear success state after 2 seconds
      setTimeout(() => {
        uploadStatus.update((status) =>
          status.state === 'success' ? { state: 'idle' } : status
        );
      }, 2000);
    } else {
      // Upload failed - attempt best-effort resync
      uploadStatus.set({ state: 'error', message: 'Upload failed' });
      
      try {
        // Try to resync with DSP's current config
        const resynced = await dspInstance.downloadConfig();
        if (resynced && dspInstance.config) {
          console.warn('Upload failed, resynced with DSP config');
          const resyncedConfig = dspInstance.config as CamillaDSPConfig;
          lastConfig = resyncedConfig;
          updateDspConfig(resyncedConfig);
          
          const reExtracted = extractEqBandsFromConfig(resyncedConfig);
          extractedData = reExtracted;
          bands.set(reExtracted.bands);
          filterNames.set(reExtracted.filterNames);
          bandOrderNumbers.set(reExtracted.orderNumbers);
          preampGain.set(reExtracted.preampGain);
        }
      } catch (resyncError) {
        console.warn('Could not resync after upload failure:', resyncError);
        // Keep optimistic local state so user doesn't lose work
      }
    }
  } catch (error) {
    console.error('Error uploading config:', error);
    uploadStatus.set({
      state: 'error',
      message: error instanceof Error ? error.message : 'Upload failed',
    });
  }
}, UPLOAD_DEBOUNCE_MS);

/**
 * Initialize EQ store from config (uses global dspStore)
 */
export function initializeFromConfig(config: CamillaDSPConfig): boolean {
  if (!config) {
    console.error('No config provided');
    return false;
  }

  lastConfig = config;

  try {
    // Extract bands and preamp from config
    const extracted = extractEqBandsFromConfig(config);
    extractedData = extracted;

    // Update stores
    bands.set(extracted.bands);
    filterNames.set(extracted.filterNames);
    bandOrderNumbers.set(extracted.orderNumbers);
    preampGain.set(extracted.preampGain);

    console.log(`Loaded ${extracted.bands.length} EQ bands, preamp ${extracted.preampGain.toFixed(1)} dB from config`);
    return true;
  } catch (error) {
    console.error('Error initializing from config:', error);
    return false;
  }
}

/**
 * Clear EQ state
 */
export function clearEqState(): void {
  debouncedUpload.cancel();
  lastConfig = null;
  extractedData = null;
  bands.set([]);
  filterNames.set([]);
  bandOrderNumbers.set([]);
  preampGain.set(0);
  uploadStatus.set({ state: 'idle' });
  // Reset solo session (don't restore — config is gone)
  soloSessionActive = false;
  soloSnapshot = null;
  soloActiveBandIndex.set(null);
  _testDspOverride = null;
}

/**
 * Trigger immediate upload (flush debounce)
 */
export function commitUpload(): void {
  debouncedUpload.flush();
}

// Actions (mutations with proper clamping/rounding + debounced upload)

export function setBandFreq(index: number, freq: number) {
  bands.update((b) => {
    const updated = [...b];
    updated[index] = { ...updated[index], freq: clampFreqHz(freq) };
    return updated;
  });
  debouncedUpload.call();
}

export function setBandGain(index: number, gain: number) {
  bands.update((b) => {
    const updated = [...b];
    updated[index] = { ...updated[index], gain: clampGainDb(gain) };
    return updated;
  });
  debouncedUpload.call();
}

export function setBandQ(index: number, q: number) {
  bands.update((b) => {
    const updated = [...b];
    updated[index] = { ...updated[index], q: clampQ(q) };
    return updated;
  });
  debouncedUpload.call();
}

export function setBandType(index: number, type: EqBand['type']) {
  bands.update((b) => {
    const updated = [...b];
    const currentBand = updated[index];
    
    // Preserve freq and q, but handle gain based on type
    const supportsGain = type === 'Peaking' || type === 'LowShelf' || type === 'HighShelf';
    
    updated[index] = {
      ...currentBand,
      type,
      gain: supportsGain ? currentBand.gain : 0,
    };
    
    return updated;
  });
  debouncedUpload.call();
}

export async function toggleBandEnabled(index: number): Promise<void> {
  const dspInstance = getDspInstance();
  if (!dspInstance || !lastConfig || !extractedData) {
    console.error('Cannot toggle band: no DSP instance or config');
    return;
  }

  // Get filter name for this band
  const filterName = extractedData.filterNames[index];
  if (!filterName) {
    console.error(`No filter name found for band index ${index}`);
    return;
  }

  // Get current enabled state
  const currentBands = get(bands);
  const isCurrentlyEnabled = currentBands[index]?.enabled ?? false;

  // Solo-mute interaction: muting the active soloed band ends the solo session
  // first, so the full pipeline is restored before the persistent mute is applied.
  // (Non-active bands are already non-interactive via solo-dimmed pointer-events:none.)
  if (soloSessionActive && isCurrentlyEnabled && index === get(soloActiveBandIndex)) {
    await endSoloEditSession();
    // lastConfig and extractedData are now the restored (pre-solo) state.
  }

  try {
    // Toggle by disabling/enabling everywhere in pipeline
    let updatedConfig: CamillaDSPConfig;
    
    if (isCurrentlyEnabled) {
      // Disable: remove from pipeline steps, add to overlay
      updatedConfig = disableFilterEverywhere(lastConfig, filterName);
    } else {
      // Enable: restore to pipeline steps, remove from overlay
      updatedConfig = enableFilterEverywhere(lastConfig, filterName);
    }

    // Update instance config
    dspInstance.config = updatedConfig as any;
    lastConfig = updatedConfig;

    // Re-extract bands to reflect new enabled state
    const extracted = extractEqBandsFromConfig(updatedConfig);
    extractedData = extracted;
    bands.set(extracted.bands);
    filterNames.set(extracted.filterNames);
    bandOrderNumbers.set(extracted.orderNumbers);

    // Trigger upload
    debouncedUpload.call();
  } catch (error) {
    console.error('Error toggling band enabled state:', error);
    uploadStatus.set({
      state: 'error',
      message: error instanceof Error ? error.message : 'Failed to toggle band',
    });
  }
}

// ─── MVP-31: Solo session state ────────────────────────────────────────────

let soloSessionActive = false;
/** Snapshot of pipeline names[] per Filter step, captured at session start. */
let soloSnapshot: { stepIndex: number; names: string[] }[] | null = null;

/**
 * The band index that is currently being soloed, or null when no session is
 * active.  UI components subscribe to this to dim non-active bands/tokens/curves.
 */
export const soloActiveBandIndex = writable<number | null>(null);

// Test-only DSP override (null in production)
let _testDspOverride: any = null;

/** Returns the DSP instance, honouring any test override. */
function _resolveDspInstance() {
  return (_testDspOverride ?? getDspInstance()) as { config: any; uploadConfig: () => Promise<boolean> } | null;
}

/**
 * Test helper: inject a mock DSP instance and reset EQ state so tests
 * start with a clean slate (no stale lastConfig from a previous test).
 * Must only be called from test code.
 */
export function _injectDspForTesting(dsp: any): void {
  debouncedUpload.cancel();
  lastConfig = null;
  extractedData = null;
  bands.set([]);
  filterNames.set([]);
  bandOrderNumbers.set([]);
  preampGain.set(0);
  uploadStatus.set({ state: 'idle' });
  soloSessionActive = false;
  soloSnapshot = null;
  soloActiveBandIndex.set(null);
  _testDspOverride = dsp;
}

/** Returns whether a solo-edit session is currently active. */
export function isSoloSessionActive(): boolean {
  return soloSessionActive;
}

/**
 * Start a solo-edit session: mute every band except `bandIndex`, upload the
 * temporary config directly (no debounce, no putLatestState), and set the
 * session-active flag.  A no-op when:
 *  - no config has been loaded (`lastConfig` / `extractedData` are null), or
 *  - no DSP instance is available, or
 *  - the upload to CamillaDSP fails.
 *
 * If a session is already active the existing one is ended first (band switch).
 */
export async function startSoloEditSession(bandIndex: number): Promise<void> {
  if (!lastConfig || !extractedData) return;
  const dspInstance = _resolveDspInstance();
  if (!dspInstance) return;

  // Band-switch: end the current session silently before starting a new one
  if (soloSessionActive) {
    await endSoloEditSession();
  }

  const activeName = extractedData.filterNames[bandIndex];
  if (!activeName) return; // invalid band index

  // Deep-clone the config so we can patch pipeline names[] directly.
  // This avoids writing to the disabled-filters localStorage overlay, which would
  // cause extractEqBandsFromConfig to include the muted bands in the band list.
  const updatedConfig = JSON.parse(JSON.stringify(lastConfig)) as CamillaDSPConfig;
  const pipeline = (updatedConfig.pipeline as any[] | undefined) ?? [];

  // Snapshot of each Filter step's original names[] so we can restore later
  const snapshot: { stepIndex: number; names: string[] }[] = [];
  let changed = false;

  for (let i = 0; i < pipeline.length; i++) {
    const step = pipeline[i];
    if (step.type !== 'Filter' || !Array.isArray(step.names)) continue;

    snapshot.push({ stepIndex: i, names: [...step.names] });

    // Keep only the active filter in this step's names[]
    const newNames: string[] = step.names.includes(activeName) ? [activeName] : [];
    if (newNames.length !== step.names.length) {
      step.names = newNames;
      changed = true;
    }
  }

  if (changed) {
    dspInstance.config = updatedConfig;
    const success = await dspInstance.uploadConfig();
    if (!success) return; // upload failed — do not activate session

    // Update lastConfig only — do NOT re-extract.
    // All bands remain in filterNames/bands/bandOrderNumbers so the UI stays
    // stable (positions, order numbers, colours unchanged).  The debouncedUpload
    // guard (soloSessionActive) will also skip re-extraction on subsequent edits.
    lastConfig = updatedConfig;
  }

  soloSnapshot = snapshot;
  soloSessionActive = true;
  soloActiveBandIndex.set(bandIndex); // signals UI to dim non-active bands
}

/**
 * End the current solo-edit session: restore all bands to their pre-session
 * enabled state, upload the restored config directly, and persist to the
 * server via putLatestState (recovery cache).  A no-op when no session is
 * active.
 */
export async function endSoloEditSession(): Promise<void> {
  if (!soloSessionActive) return;
  soloSessionActive = false;
  soloActiveBandIndex.set(null); // clear UI dimming immediately

  if (!soloSnapshot || !lastConfig) {
    soloSnapshot = null;
    return;
  }

  const dspInstance = _resolveDspInstance();
  if (!dspInstance) {
    soloSnapshot = null;
    return;
  }

  // Restore pipeline names[] from snapshot
  const updatedConfig = JSON.parse(JSON.stringify(lastConfig)) as CamillaDSPConfig;
  const pipeline = (updatedConfig.pipeline as any[] | undefined) ?? [];

  for (const snap of soloSnapshot) {
    if (pipeline[snap.stepIndex]) {
      pipeline[snap.stepIndex].names = snap.names;
    }
  }

  soloSnapshot = null;

  dspInstance.config = updatedConfig;
  await dspInstance.uploadConfig();
  lastConfig = updatedConfig;
  const extracted = extractEqBandsFromConfig(updatedConfig);
  extractedData = extracted;
  bands.set(extracted.bands);
  filterNames.set(extracted.filterNames);
  bandOrderNumbers.set(extracted.orderNumbers);

  // Persist the restored (real) config to the server as a recovery point
  try {
    await putLatestState(lastConfig);
  } catch {
    // Non-fatal
  }
}

/**
 * UI convenience wrappers — check the soloWhileEditing toggle before
 * calling the underlying session functions.
 */
export function startSoloSession(bandIndex: number, soloEnabled: boolean): void {
  if (!soloEnabled) return;
  void startSoloEditSession(bandIndex);
}

export function endSoloSession(): void {
  void endSoloEditSession();
}

export function selectBand(index: number | null) {
  selectedBandIndex.set(index);
}

export function setPreampGain(gain: number) {
  preampGain.set(clampGainDb(gain));
  debouncedUpload.call();
}

// Derived stores for curves (reactive to bands changes)
export const sumCurvePath = derived(bands, ($bands) => {
  return generateCurvePath($bands, {
    width: 1000,
    height: 400,
    numPoints: 256,
  });
});

export const perBandCurvePaths = derived(bands, ($bands) => {
  return $bands.map((band) =>
    generateBandCurvePath(band, {
      width: 1000,
      height: 400,
      numPoints: 128,
    })
  );
});
