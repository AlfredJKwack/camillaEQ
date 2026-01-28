/**
 * Mapping layer between pipeline-config format (MVP-9 on-disk format)
 * and CamillaDSP config JSON format.
 * 
 * Pipeline-config is a simplified format focused on EQ filters.
 * CamillaDSP config is the full DSP configuration with pipeline, devices, filters, etc.
 */

import type { CamillaDSPConfig } from './camillaDSP';

/**
 * Pipeline config format (canonical on-disk format for MVP-9)
 */
export interface PipelineConfig {
  configName: string;
  accessKey?: string;
  filterArray: Array<Record<string, any>>;
}

/**
 * Convert pipeline-config to full CamillaDSP config
 * 
 * Takes the filter array and creates a complete CamillaDSP config with:
 * - Pipeline routing (passthrough for now)
 * - Filters (from filterArray)
 * - Devices (placeholder capture/playback)
 */
export function pipelineConfigToCamillaDSP(
  pipelineConfig: PipelineConfig,
  templateConfig?: CamillaDSPConfig
): CamillaDSPConfig {
  // Start with template or minimal config
  const baseConfig: CamillaDSPConfig = templateConfig || {
    devices: {
      samplerate: 48000,
      chunksize: 1024,
      queuelimit: 1,
      capture: {
        type: 'Alsa',
        channels: 2,
        device: 'hw:0',
        format: 'S32LE',
      },
      playback: {
        type: 'Alsa',
        channels: 2,
        device: 'hw:1',
        format: 'S32LE',
      },
    },
    filters: {},
    mixers: {},
    pipeline: [],
  };

  // Extract filters and metadata from filterArray
  const filters: Record<string, any> = {};
  const filterNames: string[] = [];
  let preampGain = 0;

  for (const item of pipelineConfig.filterArray) {
    const [key, value] = Object.entries(item)[0];

    if (key === 'Preamp') {
      // Extract preamp gain
      preampGain = value.gain || 0;
    } else if (key === 'Volume') {
      // Volume is handled separately via SetVolume API, skip in config
      continue;
    } else {
      // Regular filter (Filter01, Filter02, etc.)
      // Convert to CamillaDSP Biquad filter format
      const filterDef: any = {
        type: 'Biquad',
        parameters: {
          type: value.type,
          freq: value.freq,
          q: value.q,
        },
      };

      // Add gain if applicable (Peaking, HighShelf, LowShelf)
      if ('gain' in value) {
        filterDef.parameters.gain = value.gain;
      }

      filters[key] = filterDef;
      filterNames.push(key);
    }
  }

  // Build pipeline: one Filter step per channel with all filter names (v3-compatible)
  // This matches what extractEqBandsFromConfig() expects
  const pipelineSteps: any[] = [
    {
      type: 'Filter',
      channels: [0],
      names: filterNames,
    },
    {
      type: 'Filter',
      channels: [1],
      names: filterNames,
    },
  ];

  // Build final config
  const config: CamillaDSPConfig = {
    ...baseConfig,
    filters,
    pipeline: pipelineSteps,
  };

  // Add preamp as mixer if non-zero
  if (preampGain !== 0) {
    config.mixers = {
      preamp: {
        channels: {
          in: 2,
          out: 2,
        },
        mapping: [
          { 
            dest: 0, 
            sources: [{ channel: 0, gain: preampGain, inverted: false, mute: false, scale: 'dB' }],
            mute: false,
          },
          { 
            dest: 1, 
            sources: [{ channel: 1, gain: preampGain, inverted: false, mute: false, scale: 'dB' }],
            mute: false,
          },
        ],
      },
    };

    // Insert preamp at start of pipeline
    config.pipeline = [
      { type: 'Mixer', name: 'preamp' },
      ...pipelineSteps,
    ];
  }

  return config;
}

/**
 * Convert CamillaDSP config to pipeline-config format
 * 
 * Extracts:
 * - Filter definitions (Biquad only)
 * - Preamp gain (from mixers if present)
 * - Ignores pipeline routing, devices, etc.
 */
export function camillaDSPToPipelineConfig(
  config: CamillaDSPConfig,
  configName: string = 'Untitled'
): PipelineConfig {
  const filterArray: Array<Record<string, any>> = [];

  // Extract preamp from mixers
  let preampGain = 0;
  if (config.mixers && config.mixers.preamp) {
    const preampMixer = config.mixers.preamp;
    if (preampMixer.mapping && preampMixer.mapping[0]?.sources?.[0]) {
      preampGain = preampMixer.mapping[0].sources[0].gain || 0;
    }
  }

  // Extract filters (Biquad only, skip duplicates for channel 1)
  const processedFilters = new Set<string>();

  if (config.filters) {
    for (const [filterName, filterDef] of Object.entries(config.filters)) {
      if (filterDef.type === 'Biquad' && !processedFilters.has(filterName)) {
        processedFilters.add(filterName);

        const params = filterDef.parameters;
        const filterObj: any = {
          type: params.type,
          freq: params.freq,
          q: params.q,
        };

        // Add gain if present
        if ('gain' in params) {
          filterObj.gain = params.gain;
        }

        filterArray.push({
          [filterName]: filterObj,
        });
      }
    }
  }

  // Add preamp if non-zero
  if (preampGain !== 0) {
    filterArray.push({
      Preamp: {
        gain: preampGain,
      },
    });
  }

  // Add volume placeholder
  filterArray.push({
    Volume: {
      type: 'Volume',
      parameters: {},
    },
  });

  return {
    configName,
    filterArray,
  };
}
