/**
 * Pipeline reorder utilities
 * Pure functions for reordering pipeline blocks and filter names
 */

import type { CamillaDSPConfig } from './camillaDSP';

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
