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
    
    const stepKey = getStepKey(step.channels, stepIndex);
    const alreadyDisabled = getDisabledFiltersForStep(stepKey);
    
    // Reconstruct the full ordered name list (enabled names + disabled-at-original-positions)
    // to find the correct original index of filterName in the pre-disable order.
    // Comparing compressed-list indices to original-space overlay indices directly is wrong
    // when 2+ filters are already disabled (causes drift from the 3rd mute onwards).
    const fullNames: string[] = [...names];
    for (const loc of alreadyDisabled) {
      const insertIdx = Math.max(0, Math.min(fullNames.length, loc.index));
      fullNames.splice(insertIdx, 0, loc.filterName);
    }
    const originalIndex = fullNames.indexOf(filterName);
    
    // Remove from enabled names array
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
        
        // Compute how many other disabled filters for this step had an original
        // index less than location.index and are STILL disabled (i.e., still absent
        // from names[]).  Those gaps must be subtracted to get the correct insertion
        // point into the current compressed (enabled-only) names array.
        const disabledBefore = getDisabledFiltersForStep(location.stepKey)
          .filter(loc => loc.filterName !== filterName && loc.index < location.index)
          .length;
        const insertIndex = Math.max(0, Math.min(names.length, location.index - disabledBefore));
        names.splice(insertIndex, 0, filterName);
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
