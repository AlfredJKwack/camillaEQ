/**
 * Pipeline reorder utilities
 * Pure functions for reordering pipeline blocks and filter names
 */

import type { CamillaDSPConfig } from './camillaDSP';

/**
 * Filter item for reordering (includes disabled state)
 */
export interface FilterItem {
  name: string;
  disabled: boolean;
}

/**
 * Result of reordering filters with disabled placeholders
 */
export interface ReorderWithDisabledResult {
  enabledNames: string[]; // New order of enabled filter names for step.names
  disabledIndices: Record<string, number>; // Updated indices for disabled filters
}

/**
 * Move an array element from one index to another
 * Returns a new array with the element moved
 */
export function arrayMove<T>(arr: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) {
    return [...arr];
  }

  const result = [...arr];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}

/**
 * Reorder pipeline blocks
 * Returns a new config with pipeline reordered
 */
export function reorderPipeline(
  config: CamillaDSPConfig,
  fromIndex: number,
  toIndex: number
): CamillaDSPConfig {
  const updatedConfig = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  updatedConfig.pipeline = arrayMove(updatedConfig.pipeline, fromIndex, toIndex);
  return updatedConfig;
}

/**
 * Reorder filters including disabled placeholders
 * This function handles reordering when the UI shows both enabled and disabled filters
 * 
 * @param filters Full list of filters (enabled + disabled) in UI display order
 * @param fromIndex Index in the full list to move from
 * @param toIndex Index in the full list to move to
 * @returns New enabled names array and updated disabled filter indices
 */
export function reorderFiltersWithDisabled(
  filters: FilterItem[],
  fromIndex: number,
  toIndex: number
): ReorderWithDisabledResult {
  // Apply arrayMove to the full list
  const reordered = arrayMove(filters, fromIndex, toIndex);
  
  // Extract enabled names in new order
  const enabledNames: string[] = [];
  const disabledIndices: Record<string, number> = {};
  
  for (let i = 0; i < reordered.length; i++) {
    const filter = reordered[i];
    if (filter.disabled) {
      // Track new index for disabled filter
      disabledIndices[filter.name] = i;
    } else {
      // Add to enabled names
      enabledNames.push(filter.name);
    }
  }
  
  return { enabledNames, disabledIndices };
}

/**
 * Reorder filter names within a Filter step
 * Returns a new config with filter names reordered
 */
export function reorderFilterNamesInStep(
  config: CamillaDSPConfig,
  stepIndex: number,
  fromIndex: number,
  toIndex: number
): CamillaDSPConfig {
  const updatedConfig = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  const step = updatedConfig.pipeline[stepIndex];

  if (!step || step.type !== 'Filter') {
    throw new Error('Invalid step index or step is not a Filter');
  }

  const names = (step as any).names || [];
  (step as any).names = arrayMove(names, fromIndex, toIndex);

  return updatedConfig;
}
