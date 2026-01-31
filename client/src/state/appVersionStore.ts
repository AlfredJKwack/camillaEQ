/**
 * App version store
 * Fetches and caches CamillaEQ version from backend
 */

import { writable } from 'svelte/store';
import { getVersion } from '../lib/api';

export interface AppVersionInfo {
  version: string;
  buildHash?: string;
  buildTime?: string;
}

export const appVersion = writable<AppVersionInfo | null>(null);

/**
 * Load app version from backend API
 * Called once on app startup
 */
export async function loadAppVersion(): Promise<void> {
  try {
    const data = await getVersion();
    appVersion.set(data as any);
  } catch (error) {
    console.warn('Failed to load app version:', error);
    // Silently fail - version display is non-critical
  }
}
