/**
 * App version store
 * Fetches and caches CamillaEQ version from backend
 */

import { writable } from 'svelte/store';

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
    const response = await fetch('/api/version');
    if (!response.ok) {
      console.warn('Failed to fetch app version:', response.statusText);
      return;
    }
    
    const data = await response.json();
    appVersion.set(data);
  } catch (error) {
    console.warn('Failed to load app version:', error);
    // Silently fail - version display is non-critical
  }
}
