/**
 * CamillaDSP protocol helpers and command allowlists
 */

/**
 * Control socket command allowlist (what the CamillaEQ client uses)
 */
export const CONTROL_ALLOWLIST = new Set([
  'GetVersion',
  'GetConfigJson',
  'SetConfigJson',
  'GetConfig',
  'GetConfigTitle',
  'GetConfigDescription',
  'GetAvailableCaptureDevices',
  'GetAvailablePlaybackDevices',
  'GetState',
  'GetVolume',
  'SetVolume',
]);

/**
 * Spectrum socket command allowlist
 */
export const SPECTRUM_ALLOWLIST = new Set([
  'GetPlaybackSignalPeak',
  'GetConfig',
  'GetConfigTitle',
  'GetConfigDescription',
]);

/**
 * Validate a CamillaDSP config for complexity limits
 */
export interface ConfigLimits {
  maxFilters: number;
  maxMixers: number;
  maxProcessors: number;
  maxPipelineSteps: number;
  maxNamesPerFilterStep: number;
  maxJsonSize: number; // bytes
}

export const DEFAULT_LIMITS: ConfigLimits = {
  maxFilters: 512,
  maxMixers: 64,
  maxProcessors: 64,
  maxPipelineSteps: 128,
  maxNamesPerFilterStep: 512,
  maxJsonSize: 200 * 1024, // 200 KB
};

export function validateConfigComplexity(
  config: any,
  limits: ConfigLimits = DEFAULT_LIMITS
): { valid: boolean; error?: string } {
  // Check JSON size
  const jsonStr = JSON.stringify(config);
  if (jsonStr.length > limits.maxJsonSize) {
    return {
      valid: false,
      error: `Config JSON size ${jsonStr.length} exceeds limit ${limits.maxJsonSize}`,
    };
  }

  // Check filters count
  const filterCount = Object.keys(config.filters || {}).length;
  if (filterCount > limits.maxFilters) {
    return {
      valid: false,
      error: `Filter count ${filterCount} exceeds limit ${limits.maxFilters}`,
    };
  }

  // Check mixers count
  const mixerCount = Object.keys(config.mixers || {}).length;
  if (mixerCount > limits.maxMixers) {
    return {
      valid: false,
      error: `Mixer count ${mixerCount} exceeds limit ${limits.maxMixers}`,
    };
  }

  // Check processors count
  const processorCount = Object.keys(config.processors || {}).length;
  if (processorCount > limits.maxProcessors) {
    return {
      valid: false,
      error: `Processor count ${processorCount} exceeds limit ${limits.maxProcessors}`,
    };
  }

  // Check pipeline steps
  const pipelineSteps = (config.pipeline || []).length;
  if (pipelineSteps > limits.maxPipelineSteps) {
    return {
      valid: false,
      error: `Pipeline steps ${pipelineSteps} exceeds limit ${limits.maxPipelineSteps}`,
    };
  }

  // Check names per Filter step
  for (const step of config.pipeline || []) {
    if (step.type === 'Filter' && step.names) {
      if (step.names.length > limits.maxNamesPerFilterStep) {
        return {
          valid: false,
          error: `Filter step names ${step.names.length} exceeds limit ${limits.maxNamesPerFilterStep}`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Parse command from WebSocket message
 */
export function parseCommand(message: string): string | null {
  try {
    // Handle string commands (e.g., "GetVersion")
    if (message.startsWith('"') && message.endsWith('"')) {
      return message.slice(1, -1);
    }

    // Handle object commands (e.g., {"SetConfigJson": "..."})
    const parsed = JSON.parse(message);
    if (typeof parsed === 'string') {
      return parsed;
    }
    if (typeof parsed === 'object' && parsed !== null) {
      const keys = Object.keys(parsed);
      if (keys.length > 0) {
        return keys[0];
      }
    }
  } catch {
    // Invalid JSON
  }

  return null;
}

/**
 * Build response message
 */
export function buildResponse(command: string, result: 'Ok' | 'Error', value: any): string {
  return JSON.stringify({
    [command]: { result, value },
  });
}
