/**
 * Pure utility functions for editing filter parameters in pipeline
 * All functions return new config objects (immutable pattern)
 */

import type { CamillaDSPConfig } from './camillaDSP';
import { clampFreqHz, clampGainDb, clampQ } from './eqParamClamp';
import { isGainCapable } from './camillaTypes';
import {
  markFilterDisabled,
  markFilterEnabledForStep,
  getStepKey,
  getDisabledFiltersForStep,
} from './disabledFiltersOverlay';

/**
 * Set biquad filter frequency
 */
export function setBiquadFreq(
  config: CamillaDSPConfig,
  filterName: string,
  freq: number
): CamillaDSPConfig {
  const updated = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  
  const filterDef = updated.filters[filterName];
  if (!filterDef || filterDef.type !== 'Biquad') {
    throw new Error(`Filter "${filterName}" not found or not a Biquad`);
  }
  
  filterDef.parameters.freq = clampFreqHz(freq);
  
  return updated;
}

/**
 * Set biquad filter Q
 */
export function setBiquadQ(
  config: CamillaDSPConfig,
  filterName: string,
  q: number
): CamillaDSPConfig {
  const updated = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  
  const filterDef = updated.filters[filterName];
  if (!filterDef || filterDef.type !== 'Biquad') {
    throw new Error(`Filter "${filterName}" not found or not a Biquad`);
  }
  
  filterDef.parameters.q = clampQ(q);
  
  return updated;
}

/**
 * Set biquad filter gain (only for gain-capable types)
 */
export function setBiquadGain(
  config: CamillaDSPConfig,
  filterName: string,
  gain: number
): CamillaDSPConfig {
  const updated = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  
  const filterDef = updated.filters[filterName];
  if (!filterDef || filterDef.type !== 'Biquad') {
    throw new Error(`Filter "${filterName}" not found or not a Biquad`);
  }
  
  const biquadType = filterDef.parameters.type;
  if (!isGainCapable(biquadType as any)) {
    throw new Error(`Filter type "${biquadType}" does not support gain`);
  }
  
  filterDef.parameters.gain = clampGainDb(gain);
  
  return updated;
}

/**
 * Disable filter (remove from pipeline, mark in overlay)
 * Filter definition remains in config.filters for re-enabling
 */
export function disableFilter(
  config: CamillaDSPConfig,
  stepIndex: number,
  filterName: string
): CamillaDSPConfig {
  const updated = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  
  const step = updated.pipeline[stepIndex];
  if (!step || step.type !== 'Filter') {
    throw new Error(`Pipeline step ${stepIndex} is not a Filter step`);
  }
  
  const names = (step as any).names || [];
  const index = names.indexOf(filterName);
  
  if (index === -1) {
    throw new Error(`Filter "${filterName}" not found in step ${stepIndex}`);
  }
  
  // Calculate original position by accounting for already-disabled filters
  const channels = (step as any).channels || [];
  const stepKey = getStepKey(channels, stepIndex);
  const alreadyDisabled = getDisabledFiltersForStep(stepKey);
  
  // Count how many disabled filters have indices before our current position
  const disabledBefore = alreadyDisabled.filter((loc) => loc.index <= index).length;
  
  // Original index = current index in compressed array + count of disabled filters that were before it
  const originalIndex = index + disabledBefore;
  
  // Remove from names array
  names.splice(index, 1);
  (step as any).names = names;
  
  // Mark in overlay with original position
  markFilterDisabled(filterName, stepKey, originalIndex);
  
  return updated;
}

/**
 * Enable filter (add back to pipeline at original position, remove from overlay for this step only)
 */
export function enableFilter(
  config: CamillaDSPConfig,
  stepIndex: number,
  filterName: string,
  insertIndex: number
): CamillaDSPConfig {
  const updated = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  
  const step = updated.pipeline[stepIndex];
  if (!step || step.type !== 'Filter') {
    throw new Error(`Pipeline step ${stepIndex} is not a Filter step`);
  }
  
  const names = (step as any).names || [];
  
  // Insert at specified position (clamped to valid range)
  const clampedIndex = Math.max(0, Math.min(names.length, insertIndex));
  names.splice(clampedIndex, 0, filterName);
  (step as any).names = names;
  
  // Remove from overlay for THIS step only (per-block behavior)
  const channels = (step as any).channels || [];
  const stepKey = getStepKey(channels, stepIndex);
  markFilterEnabledForStep(filterName, stepKey);
  
  return updated;
}

/**
 * Remove filter from a Filter pipeline step
 * @param stepIndex - Index of the Filter step in pipeline
 * @param filterName - Name of filter to remove
 */
export function removeFilterFromStep(
  config: CamillaDSPConfig,
  stepIndex: number,
  filterName: string
): CamillaDSPConfig {
  const updated = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  
  const step = updated.pipeline[stepIndex];
  if (!step || step.type !== 'Filter') {
    throw new Error(`Pipeline step ${stepIndex} is not a Filter step`);
  }
  
  const names = (step as any).names || [];
  const index = names.indexOf(filterName);
  
  if (index === -1) {
    throw new Error(`Filter "${filterName}" not found in step ${stepIndex}`);
  }
  
  names.splice(index, 1);
  (step as any).names = names;
  
  return updated;
}

/**
 * Remove filter definition if not referenced anywhere in pipeline
 * Conservative: only removes if truly orphaned
 */
export function removeFilterDefinitionIfOrphaned(
  config: CamillaDSPConfig,
  filterName: string
): CamillaDSPConfig {
  // Check all Filter steps for references
  for (const step of config.pipeline) {
    if (step.type === 'Filter') {
      const names = (step as any).names || [];
      if (names.includes(filterName)) {
        // Still referenced, don't remove
        return config;
      }
    }
  }
  
  // Not referenced anywhere, safe to remove
  const updated = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  delete updated.filters[filterName];
  
  return updated;
}
