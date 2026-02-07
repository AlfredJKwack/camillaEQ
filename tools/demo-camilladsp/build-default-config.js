#!/usr/bin/env node
/**
 * Build default demo config from Tangzu Waner preset
 * Converts pipeline-config format to CamillaDSP config format
 * Run once to generate default-config.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read Tangzu Waner preset
const presetPath = join(__dirname, '../../server/data/configs/Tangzu Waner.json');
const preset = JSON.parse(readFileSync(presetPath, 'utf8'));

console.log('Converting Tangzu Waner preset to CamillaDSP config...');

// Build filters from filterArray
const filters = {};
const filterNames = [];
let preampGain = 0;

for (const item of preset.filterArray) {
  const [key, value] = Object.entries(item)[0];
  
  if (key === 'Preamp') {
    preampGain = value.gain || 0;
  } else if (key === 'Volume') {
    // Skip volume (handled via SetVolume API)
    continue;
  } else {
    // Regular filter (Filter01, Filter02, etc.)
    const filterDef = {
      type: 'Biquad',
      parameters: {
        type: value.type,
        freq: value.freq,
        q: value.q,
      },
    };
    
    // Add gain if present
    if ('gain' in value) {
      filterDef.parameters.gain = value.gain;
    }
    
    filters[key] = filterDef;
    filterNames.push(key);
  }
}

// Build mixers (add preamp if non-zero)
const mixers = {};
if (preampGain !== 0) {
  mixers.preamp = {
    channels: { in: 2, out: 2 },
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
  };
}

// Build pipeline
const pipeline = [];
if (preampGain !== 0) {
  pipeline.push({ type: 'Mixer', name: 'preamp', bypassed: false });
}
pipeline.push(
  { type: 'Filter', channels: [0], names: filterNames, bypassed: false },
  { type: 'Filter', channels: [1], names: filterNames, bypassed: false }
);

// Build full config
const config = {
  title: 'Tangzu Waner Demo Configuration',
  description: 'Default EQ preset for CamillaEQ demo',
  devices: {
    samplerate: 48000,
    chunksize: 1024,
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
  filters,
  mixers,
  pipeline,
  processors: {},
};

// Write to default-config.json
const outputPath = join(__dirname, 'default-config.json');
writeFileSync(outputPath, JSON.stringify(config, null, 2));

console.log(`✓ Generated ${outputPath}`);
console.log(`  Filters: ${Object.keys(filters).length}`);
console.log(`  Preamp: ${preampGain} dB`);
console.log(`  Pipeline steps: ${pipeline.length}`);
