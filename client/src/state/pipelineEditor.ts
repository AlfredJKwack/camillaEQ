/**
 * Pipeline editor upload helper
 * Handles validation, upload, and persistence for pipeline reorders
 * Uses EQ-style debounced upload pattern
 */

import type { CamillaDSPConfig } from '../lib/camillaDSP';
import { getDspInstance, updateConfig as updateDspConfig } from './dspStore';
import { initializeFromConfig } from './eqStore';
import { putLatestState } from '../lib/api';
import { debounceCancelable } from '../lib/debounce';

// Upload debounce time (ms) - same as EQ
const UPLOAD_DEBOUNCE_MS = 200;

export type PipelineUploadState = 'idle' | 'pending' | 'success' | 'error';

export interface PipelineUploadStatus {
  state: PipelineUploadState;
  message?: string;
}

// Status callback (for UI to subscribe)
let statusCallback: ((status: PipelineUploadStatus) => void) | null = null;

/**
 * Set status callback for UI updates
 */
export function setPipelineUploadStatusCallback(
  callback: (status: PipelineUploadStatus) => void
): void {
  statusCallback = callback;
}

/**
 * Notify status change
 */
function notifyStatus(status: PipelineUploadStatus): void {
  if (statusCallback) {
    statusCallback(status);
  }
}

/**
 * Debounced upload function
 */
const debouncedUpload = debounceCancelable(async (config: CamillaDSPConfig) => {
  const dspInstance = getDspInstance();
  if (!dspInstance) {
    notifyStatus({ state: 'error', message: 'DSP not connected' });
    return;
  }

  try {
    notifyStatus({ state: 'pending' });

    // Set config on instance
    dspInstance.config = config;

    // Validate
    if (!dspInstance.validateConfig()) {
      notifyStatus({ state: 'error', message: 'Invalid configuration' });
      return;
    }

    // Upload to CamillaDSP
    const success = await dspInstance.uploadConfig();

    if (success) {
      // Get confirmed config from download
      const confirmedConfig = dspInstance.config!;

      // Sync global dspStore
      updateDspConfig(confirmedConfig);

      // Persist to backend (write-through)
      try {
        await putLatestState(confirmedConfig);
      } catch (error) {
        console.warn('Failed to persist latest state to server:', error);
        // Non-fatal: continue even if persistence fails
      }

      // Re-initialize EQ store to sync band order numbers
      try {
        initializeFromConfig(confirmedConfig);
      } catch (error) {
        console.warn('Failed to re-initialize EQ store:', error);
      }

      notifyStatus({ state: 'success' });

      // Clear success state after 2 seconds
      setTimeout(() => {
        notifyStatus({ state: 'idle' });
      }, 2000);
    } else {
      notifyStatus({ state: 'error', message: 'Upload failed' });
    }
  } catch (error) {
    console.error('Error uploading pipeline config:', error);
    notifyStatus({
      state: 'error',
      message: error instanceof Error ? error.message : 'Upload failed',
    });
  }
}, UPLOAD_DEBOUNCE_MS);

/**
 * Commit pipeline config change (triggers debounced upload)
 */
export function commitPipelineConfigChange(config: CamillaDSPConfig): void {
  debouncedUpload.call(config);
}

/**
 * Cancel any pending upload
 */
export function cancelPipelineUpload(): void {
  debouncedUpload.cancel();
}

/**
 * Flush pending upload immediately
 */
export function flushPipelineUpload(): void {
  debouncedUpload.flush();
}
