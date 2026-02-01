/**
 * Disabled filters overlay
 * UI-only state tracking which filters are temporarily disabled (removed from pipeline)
 * Persists in localStorage to survive reconnect/browser reload
 * Cleared on preset load (entire state overwritten)
 */

const STORAGE_KEY = 'camillaEQ.disabledFilters';
const STORAGE_VERSION = 1;

export interface DisabledFilterLocation {
  stepKey: string; // Stable identifier for the Filter step (channels + original index)
  index: number;   // Position within that step's names array
  filterName: string; // For convenience
}

export interface DisabledFiltersState {
  version: number;
  disabled: Record<string, DisabledFilterLocation>; // key = filterName
}

/**
 * Generate stable step key from Filter step properties
 * Format: "Filter:ch0,1:idx2" (channels sorted, original pipeline index)
 */
export function getStepKey(channels: number[], stepIndex: number): string {
  const sortedCh = [...channels].sort((a, b) => a - b).join(',');
  return `Filter:ch${sortedCh}:idx${stepIndex}`;
}

/**
 * Load disabled filters state from localStorage
 */
export function loadDisabledFilters(): DisabledFiltersState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { version: STORAGE_VERSION, disabled: {} };
    }
    
    const parsed = JSON.parse(stored);
    
    // Version check (for future migrations)
    if (parsed.version !== STORAGE_VERSION) {
      console.warn('Disabled filters state version mismatch, resetting');
      return { version: STORAGE_VERSION, disabled: {} };
    }
    
    return parsed;
  } catch (error) {
    console.error('Error loading disabled filters:', error);
    return { version: STORAGE_VERSION, disabled: {} };
  }
}

/**
 * Save disabled filters state to localStorage
 */
export function saveDisabledFilters(state: DisabledFiltersState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Error saving disabled filters:', error);
  }
}

/**
 * Clear all disabled filters (e.g., on preset load)
 */
export function clearDisabledFilters(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing disabled filters:', error);
  }
}

/**
 * Mark filter as disabled
 */
export function markFilterDisabled(
  filterName: string,
  stepKey: string,
  index: number
): void {
  const state = loadDisabledFilters();
  
  state.disabled[filterName] = {
    stepKey,
    index,
    filterName,
  };
  
  saveDisabledFilters(state);
}

/**
 * Mark filter as enabled (remove from disabled list)
 */
export function markFilterEnabled(filterName: string): void {
  const state = loadDisabledFilters();
  
  delete state.disabled[filterName];
  
  saveDisabledFilters(state);
}

/**
 * Check if filter is disabled
 */
export function isFilterDisabled(filterName: string): boolean {
  const state = loadDisabledFilters();
  return filterName in state.disabled;
}

/**
 * Get all disabled filters for a given step
 */
export function getDisabledFiltersForStep(stepKey: string): DisabledFilterLocation[] {
  const state = loadDisabledFilters();
  
  return Object.values(state.disabled)
    .filter((loc) => loc.stepKey === stepKey)
    .sort((a, b) => a.index - b.index);
}

/**
 * Get disabled filter location (if disabled)
 */
export function getDisabledFilterLocation(filterName: string): DisabledFilterLocation | null {
  const state = loadDisabledFilters();
  return state.disabled[filterName] || null;
}

/**
 * Remap disabled filter step indices after pipeline reorder
 * This keeps disabled filters attached to their correct Filter steps when steps are moved
 * 
 * @param fromIndex Original index of the moved step
 * @param toIndex New index of the moved step
 */
export function remapDisabledFiltersAfterPipelineReorder(fromIndex: number, toIndex: number): void {
  if (fromIndex === toIndex) {
    return; // No-op
  }
  
  const state = loadDisabledFilters();
  const updated: Record<string, DisabledFilterLocation> = {};
  
  // Compute index mapping using arrayMove semantics
  const computeNewIndex = (oldIndex: number): number => {
    if (oldIndex === fromIndex) {
      // This is the step being moved
      return toIndex;
    } else if (fromIndex < toIndex) {
      // Moving down: indices in (fromIndex, toIndex] shift left by 1
      if (oldIndex > fromIndex && oldIndex <= toIndex) {
        return oldIndex - 1;
      }
    } else {
      // Moving up: indices in [toIndex, fromIndex) shift right by 1
      if (oldIndex >= toIndex && oldIndex < fromIndex) {
        return oldIndex + 1;
      }
    }
    return oldIndex;
  };
  
  // Remap all disabled filter locations
  for (const [filterName, location] of Object.entries(state.disabled)) {
    // Parse stepKey to extract old step index
    // Format: "Filter:ch0,1:idx2"
    const match = location.stepKey.match(/^Filter:ch(.+):idx(\d+)$/);
    if (!match) {
      // Malformed stepKey, keep as-is
      updated[filterName] = location;
      continue;
    }
    
    const channels = match[1];
    const oldStepIndex = parseInt(match[2], 10);
    const newStepIndex = computeNewIndex(oldStepIndex);
    
    // Rebuild stepKey with new index
    const newStepKey = `Filter:ch${channels}:idx${newStepIndex}`;
    
    updated[filterName] = {
      ...location,
      stepKey: newStepKey,
    };
  }
  
  // Save updated state
  state.disabled = updated;
  saveDisabledFilters(state);
}
