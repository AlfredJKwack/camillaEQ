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
      
      // Re-extract EQ bands from confirmed config to ensure UI reflects what DSP accepted
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
  preampGain.set(0);
  uploadStatus.set({ state: 'idle' });
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

export function toggleBandEnabled(index: number) {
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
