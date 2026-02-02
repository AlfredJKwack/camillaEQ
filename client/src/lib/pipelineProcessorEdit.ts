/**
 * Pure utility functions for editing processor parameters in pipeline
 * All functions return new config objects (immutable pattern)
 */

import type { CamillaDSPConfig } from './camillaDSP';

/**
 * Set processor pipeline step bypass state
 */
export function setProcessorStepBypassed(
  config: CamillaDSPConfig,
  stepIndex: number,
  bypassed: boolean
): CamillaDSPConfig {
  const updated = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  
  const step = updated.pipeline[stepIndex];
  if (!step || step.type !== 'Processor') {
    throw new Error(`Pipeline step ${stepIndex} is not a Processor step`);
  }
  
  (step as any).bypassed = bypassed;
  
  return updated;
}

/**
 * Set compressor parameter
 */
export function setCompressorParam(
  config: CamillaDSPConfig,
  processorName: string,
  param: 'threshold' | 'attack' | 'release' | 'factor' | 'makeup_gain' | 'channels',
  value: number
): CamillaDSPConfig {
  const updated = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  
  if (!updated.processors || !updated.processors[processorName]) {
    throw new Error(`Processor "${processorName}" not found`);
  }
  
  const processor = updated.processors[processorName];
  if (processor.type !== 'Compressor') {
    throw new Error(`Processor "${processorName}" is not a Compressor`);
  }
  
  // Apply minimal safety clamping
  let clampedValue = value;
  
  switch (param) {
    case 'attack':
    case 'release':
      // Time values must be >= 0
      clampedValue = Math.max(0, value);
      break;
    case 'factor':
      // Factor must be >= 1
      clampedValue = Math.max(1, value);
      break;
    case 'channels':
      // Integer >= 1
      clampedValue = Math.max(1, Math.floor(value));
      break;
    case 'threshold':
    case 'makeup_gain':
      // Allow any value (power users may need extreme values)
      clampedValue = value;
      break;
  }
  
  processor.parameters[param] = clampedValue;
  
  return updated;
}

/**
 * Set noise gate parameter
 */
export function setNoiseGateParam(
  config: CamillaDSPConfig,
  processorName: string,
  param: 'threshold' | 'attack' | 'release' | 'attenuation' | 'channels',
  value: number
): CamillaDSPConfig {
  const updated = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  
  if (!updated.processors || !updated.processors[processorName]) {
    throw new Error(`Processor "${processorName}" not found`);
  }
  
  const processor = updated.processors[processorName];
  if (processor.type !== 'NoiseGate') {
    throw new Error(`Processor "${processorName}" is not a NoiseGate`);
  }
  
  // Apply minimal safety clamping
  let clampedValue = value;
  
  switch (param) {
    case 'attack':
    case 'release':
      // Time values must be >= 0
      clampedValue = Math.max(0, value);
      break;
    case 'channels':
      // Integer >= 1
      clampedValue = Math.max(1, Math.floor(value));
      break;
    case 'threshold':
    case 'attenuation':
      // Allow any value (power users may need extreme values)
      clampedValue = value;
      break;
  }
  
  processor.parameters[param] = clampedValue;
  
  return updated;
}
