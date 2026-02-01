/**
 * Shared filter enablement operations
 * Makes enable/disable consistent between EQ and Pipeline editors
 */

import type { CamillaDSPConfig } from './camillaDSP';
import { normalizePipelineStep, type PipelineStepNormalized } from './camillaTypes';
import {
  markFilterDisabled,
  markFilterEnabled,
  getStepKey,
  getDisabledFilterLocations,
  getDisabledFiltersForStep,
} from './disabledFiltersOverlay';

/**
 * Disable filter everywhere it appears in the pipeline
 * Removes filterName from all Filter steps and records locations in overlay
 */
export function disableFilterEverywhere(
  config: CamillaDSPConfig,
  filterName: string
): CamillaDSPConfig {
  const updated = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  
  // Find all Filter steps that contain this filterName
  for (let stepIndex = 0; stepIndex < updated.pipeline.length; stepIndex++) {
    const step = normalizePipelineStep(updated.pipeline[stepIndex]);
    
    if (!step || step.type !== 'Filter' || !step.names || !step.channels) {
      continue;
    }
    
    const names = step.names;
    const index = names.indexOf(filterName);
    
    if (index === -1) {
      // Filter not in this step
      continue;
    }
    
    // Calculate original position by accounting for already-disabled filters
    const stepKey = getStepKey(step.channels, stepIndex);
    const alreadyDisabled = getDisabledFiltersForStep(stepKey);
    
    // Count how many disabled filters have indices before our current position
    const disabledBefore = alreadyDisabled.filter((loc) => loc.index <= index).length;
    
    // Original index = current index in compressed array + count of disabled filters that were before it
    const originalIndex = index + disabledBefore;
    
    // Remove from names array
    names.splice(index, 1);
    (updated.pipeline[stepIndex] as any).names = names;
    
    // Mark in overlay with original position
    markFilterDisabled(filterName, stepKey, originalIndex);
  }
  
  return updated;
}

/**
 * Enable filter everywhere (restore to all original locations)
 * Uses overlay locations to restore into each step at its original index
 */
export function enableFilterEverywhere(
  config: CamillaDSPConfig,
  filterName: string
): CamillaDSPConfig {
  const updated = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  
  // Get all stored locations for this filter
  const locations = getDisabledFilterLocations(filterName);
  
  if (locations.length === 0) {
    // Not disabled, nothing to do
    return updated;
  }
  
  // Restore to each location
  for (const location of locations) {
    // Find the step by matching stepKey
    let foundStep = false;
    
    for (let stepIndex = 0; stepIndex < updated.pipeline.length; stepIndex++) {
      const step = normalizePipelineStep(updated.pipeline[stepIndex]);
      
      if (!step || step.type !== 'Filter' || !step.channels) {
        continue;
      }
      
      const currentStepKey = getStepKey(step.channels, stepIndex);
      
      if (currentStepKey === location.stepKey) {
        foundStep = true;
        
        const names = (updated.pipeline[stepIndex] as any).names || [];
        
        // Insert at original index (clamped to valid range)
        const clampedIndex = Math.max(0, Math.min(names.length, location.index));
        names.splice(clampedIndex, 0, filterName);
        (updated.pipeline[stepIndex] as any).names = names;
        
        break;
      }
    }
    
    if (!foundStep) {
      console.warn(`Could not find step with key "${location.stepKey}" to restore filter "${filterName}"`);
    }
  }
  
  // Remove from overlay
  markFilterEnabled(filterName);
  
  return updated;
}

/**
 * Check if filter is enabled everywhere it should be
 * (Helper for validation)
 */
export function isFilterEnabledEverywhere(
  config: CamillaDSPConfig,
  filterName: string
): boolean {
  // A filter is enabled if it's NOT in the disabled overlay
  const locations = getDisabledFilterLocations(filterName);
  return locations.length === 0;
}
