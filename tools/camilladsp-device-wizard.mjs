#!/usr/bin/env node

/**
 * CamillaDSP Device Configuration Wizard
 * 
 * An interactive CLI tool to generate a valid CamillaDSP configuration
 * with properly configured audio devices for your platform.
 * 
 * Supports:
 * - macOS: CoreAudio
 * - Linux: ALSA
 * 
 * Usage:
 *   node camilladsp-device-wizard.mjs [options]
 * 
 * Options:
 *   --output <path>       Output file path (default: ./camilladsp.yml)
 *   --camilladsp <path>   Path to camilladsp binary (default: camilladsp)
 *   --no-probe            Skip ALSA hardware probing
 * 
 * Note for macOS users:
 * First time running CamillaDSP, you'll need to grant microphone access
 * in System Settings > Privacy & Security > Microphone.
 */

import { execSync } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { input, select, confirm, number } from '@inquirer/prompts';

// ============================================================================
// CLI Arguments
// ============================================================================

const args = process.argv.slice(2);

// Show help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
CamillaDSP Device Configuration Wizard

An interactive CLI tool to generate a valid CamillaDSP configuration
with properly configured audio devices for your platform.

USAGE:
  node camilladsp-device-wizard.mjs [OPTIONS]

OPTIONS:
  --output <path>       Output file path (default: ./camilladsp.yml)
  --camilladsp <path>   Path to camilladsp binary (default: camilladsp)
  --no-probe            Skip ALSA hardware probing (Linux only)
  -h, --help            Show this help message
  --version             Show version information

EXAMPLES:
  node camilladsp-device-wizard.mjs
  node camilladsp-device-wizard.mjs --output ~/my-config.yml
  node camilladsp-device-wizard.mjs --camilladsp /usr/local/bin/camilladsp

SUPPORTED PLATFORMS:
  - macOS: CoreAudio backend
  - Linux: ALSA backend

For more information, see tools/README.md
`);
  process.exit(0);
}

// Show version
if (args.includes('--version')) {
  console.log('CamillaDSP Device Configuration Wizard v1.0.0');
  process.exit(0);
}

// Validate arguments
const validFlags = ['--help', '-h', '--version', '--output', '--camilladsp', '--no-probe'];
for (const arg of args) {
  if (arg.startsWith('--') || arg.startsWith('-')) {
    // Check if it's a known flag or the value following a flag
    const isKnownFlag = validFlags.some(flag => arg === flag || arg.startsWith(flag + '='));
    if (!isKnownFlag) {
      // Check if this is a value for a previous flag
      const prevIdx = args.indexOf(arg) - 1;
      if (prevIdx >= 0) {
        const prevArg = args[prevIdx];
        if (prevArg === '--output' || prevArg === '--camilladsp') {
          continue; // This is a value for a flag, not a flag itself
        }
      }
      console.error(`Error: Unknown option '${arg}'`);
      console.error('Run with --help to see available options');
      process.exit(1);
    }
  }
}

const getArg = (name, defaultValue) => {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultValue;
};
const hasFlag = (name) => args.includes(name);

const OUTPUT_FILE = getArg('--output', './camilladsp.yml');
const CAMILLADSP_BIN = getArg('--camilladsp', 'camilladsp');
const SKIP_PROBE = hasFlag('--no-probe');

// ============================================================================
// Utilities
// ============================================================================

function runCommand(cmd, options = {}) {
  try {
    return execSync(cmd, { 
      encoding: 'utf8', 
      stdio: options.silent ? 'pipe' : ['pipe', 'pipe', 'pipe'],
      ...options 
    });
  } catch (err) {
    if (options.ignoreError) {
      return null;
    }
    throw err;
  }
}

function detectOS() {
  const platform = process.platform;
  if (platform === 'darwin') return 'macos';
  if (platform === 'linux') return 'linux';
  return 'unsupported';
}

// ============================================================================
// Device Discovery - macOS
// ============================================================================

function discoverMacOSDevices() {
  const devices = { capture: [], playback: [] };
  
  // Try cpal-listdevices first (recommended tool from docs)
  const cpalOutput = runCommand('cpal-listdevices 2>/dev/null || true', { 
    silent: true, 
    ignoreError: true 
  });
  
  if (cpalOutput) {
    const lines = cpalOutput.split('\n');
    let isInput = false;
    let isOutput = false;
    
    for (const line of lines) {
      if (line.includes('Input devices:')) {
        isInput = true;
        isOutput = false;
        continue;
      }
      if (line.includes('Output devices:')) {
        isOutput = true;
        isInput = false;
        continue;
      }
      
      const match = line.match(/^\s*\d+:\s*(.+)$/);
      if (match) {
        const name = match[1].trim();
        if (isInput) devices.capture.push(name);
        if (isOutput) devices.playback.push(name);
      }
    }
  }
  
  // Fallback: system_profiler (slower but always available)
  if (devices.capture.length === 0 && devices.playback.length === 0) {
    const profileOutput = runCommand(
      'system_profiler SPAudioDataType 2>/dev/null || echo ""', 
      { silent: true, ignoreError: true }
    );
    
    if (profileOutput) {
      const lines = profileOutput.split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*(.+):\s*$/);
        if (match) {
          const name = match[1].trim();
          // Simple heuristic: if it contains common keywords
          if (name && !name.includes('Audio') && name.length > 3) {
            devices.capture.push(name);
            devices.playback.push(name);
          }
        }
      }
    }
  }
  
  return devices;
}

// ============================================================================
// Device Discovery - Linux ALSA
// ============================================================================

function discoverALSADevices() {
  const devices = { capture: [], playback: [] };
  
  // Capture devices
  const captureOutput = runCommand('arecord -L 2>/dev/null || echo ""', { 
    silent: true, 
    ignoreError: true 
  });
  
  if (captureOutput) {
    const lines = captureOutput.split('\n').filter(l => l && !l.startsWith(' '));
    devices.capture = lines.filter(l => l.trim().length > 0);
  }
  
  // Playback devices
  const playbackOutput = runCommand('aplay -L 2>/dev/null || echo ""', { 
    silent: true, 
    ignoreError: true 
  });
  
  if (playbackOutput) {
    const lines = playbackOutput.split('\n').filter(l => l && !l.startsWith(' '));
    devices.playback = lines.filter(l => l.trim().length > 0);
  }
  
  return devices;
}

// ============================================================================
// ALSA Hardware Parameter Probing
// ============================================================================

function probeALSADevice(device, type = 'playback') {
  const cmd = type === 'playback'
    ? `aplay -v -D "${device}" /dev/zero --dump-hw-params 2>&1`
    : `arecord -D "${device}" /dev/null --dump-hw-params 2>&1`;
  
  const output = runCommand(cmd, { silent: true, ignoreError: true });
  
  if (!output) return null;
  
  const params = {
    formats: [],
    rates: [],
    channels: { min: 1, max: 32 }
  };
  
  // Parse FORMAT
  const formatMatch = output.match(/FORMAT:\s+(.+)/);
  if (formatMatch) {
    const formats = formatMatch[1].split(/\s+/);
    // Map ALSA formats to CamillaDSP formats
    const formatMap = {
      'S16_LE': 'S16LE',
      'S24_LE': 'S24LE',
      'S24_3LE': 'S24LE3',
      'S32_LE': 'S32LE',
      'FLOAT_LE': 'FLOAT32LE',
      'FLOAT64_LE': 'FLOAT64LE'
    };
    params.formats = formats
      .map(f => formatMap[f])
      .filter(f => f);
  }
  
  // Parse RATE
  const rateMatch = output.match(/RATE:\s+(.+)/);
  if (rateMatch) {
    const rateStr = rateMatch[1];
    // Could be "[44100 48000]" or "44100" or "[44100 192000]" range
    const numbers = rateStr.match(/\d+/g);
    if (numbers) {
      params.rates = numbers.map(n => parseInt(n, 10));
    }
  }
  
  // Parse CHANNELS
  const channelMatch = output.match(/CHANNELS:\s+(.+)/);
  if (channelMatch) {
    const chanStr = channelMatch[1];
    const numbers = chanStr.match(/\d+/g);
    if (numbers) {
      if (numbers.length === 1) {
        params.channels = { min: parseInt(numbers[0]), max: parseInt(numbers[0]) };
      } else {
        params.channels = { min: parseInt(numbers[0]), max: parseInt(numbers[1]) };
      }
    }
  }
  
  return params;
}

function intersectParams(captureParams, playbackParams) {
  if (!captureParams || !playbackParams) return null;
  
  const intersection = {
    rates: [],
    channels: { min: 1, max: 32 }
  };
  
  // Intersect rates
  const capRates = new Set(captureParams.rates);
  const pbRates = new Set(playbackParams.rates);
  intersection.rates = [...capRates].filter(r => pbRates.has(r));
  
  // Intersect channels
  intersection.channels = {
    min: Math.max(captureParams.channels.min, playbackParams.channels.min),
    max: Math.min(captureParams.channels.max, playbackParams.channels.max)
  };
  
  return intersection;
}

// ============================================================================
// YAML Generation
// ============================================================================

function generateYAML(config) {
  const { backend, captureDevice, playbackDevice, samplerate, channels, chunksize } = config;
  
  let yaml = `---
devices:
  samplerate: ${samplerate}
  chunksize: ${chunksize}
  capture:
    type: ${backend}
    channels: ${channels}
`;

  if (captureDevice && captureDevice !== 'default') {
    yaml += `    device: "${captureDevice}"\n`;
  } else {
    yaml += `    device: null\n`;
  }

  yaml += `  playback:
    type: ${backend}
    channels: ${channels}
`;

  if (playbackDevice && playbackDevice !== 'default') {
    yaml += `    device: "${playbackDevice}"\n`;
  } else {
    yaml += `    device: null\n`;
  }

  yaml += `
filters: {}
mixers: {}
pipeline: []
`;

  return yaml;
}

// ============================================================================
// Validation
// ============================================================================

function validateConfig(yamlPath) {
  try {
    const output = runCommand(`"${CAMILLADSP_BIN}" --check "${yamlPath}" 2>&1`, {
      silent: true
    });
    return { valid: true, output };
  } catch (err) {
    return { valid: false, error: err.stdout || err.message };
  }
}

// ============================================================================
// Main Wizard Flow
// ============================================================================

async function main() {
  console.log('\n🎵 CamillaDSP Device Configuration Wizard\n');
  
  // Step 1: Detect OS
  const os = detectOS();
  
  if (os === 'unsupported') {
    console.error('❌ Unsupported operating system. This wizard supports macOS and Linux only.');
    process.exit(1);
  }
  
  const backend = os === 'macos' ? 'CoreAudio' : 'Alsa';
  console.log(`✓ Detected: ${os === 'macos' ? 'macOS' : 'Linux'} → using ${backend} backend\n`);
  
  if (os === 'macos') {
    console.log('📝 Note: CamillaDSP needs microphone access on macOS.');
    console.log('   Grant it in: System Settings > Privacy & Security > Microphone\n');
  }
  
  // Step 2: Discover devices
  console.log('🔍 Discovering audio devices...\n');
  
  const devices = os === 'macos' 
    ? discoverMacOSDevices() 
    : discoverALSADevices();
  
  // Step 3: Pick capture device
  const captureChoices = [
    { name: '🔹 Use system default', value: 'default' },
    ...devices.capture.map(d => ({ name: d, value: d })),
    { name: '✏️  Enter manually', value: 'manual' }
  ];
  
  let captureDevice = await select({
    message: 'Select capture (input) device:',
    choices: captureChoices,
    pageSize: 15
  });
  
  if (captureDevice === 'manual') {
    captureDevice = await input({
      message: 'Enter capture device name:',
      default: os === 'macos' ? 'Built-in Input' : 'hw:0'
    });
  }
  
  // Step 4: Pick playback device
  const playbackChoices = [
    { name: '🔹 Use system default', value: 'default' },
    ...devices.playback.map(d => ({ name: d, value: d })),
    { name: '✏️  Enter manually', value: 'manual' }
  ];
  
  let playbackDevice = await select({
    message: 'Select playback (output) device:',
    choices: playbackChoices,
    pageSize: 15
  });
  
  if (playbackDevice === 'manual') {
    playbackDevice = await input({
      message: 'Enter playback device name:',
      default: os === 'macos' ? 'Built-in Output' : 'hw:0'
    });
  }
  
  // Step 5: Probe ALSA parameters (Linux only)
  let probedParams = null;
  let suggestedRates = [44100, 48000, 96000, 192000];
  let suggestedChannels = [1, 2, 4, 6, 8];
  
  if (os === 'linux' && !SKIP_PROBE) {
    const shouldProbe = 
      captureDevice.startsWith('hw:') || playbackDevice.startsWith('hw:');
    
    if (shouldProbe) {
      console.log('\n🔬 Probing hardware parameters...');
      
      const capParams = probeALSADevice(captureDevice, 'capture');
      const pbParams = probeALSADevice(playbackDevice, 'playback');
      
      if (capParams && pbParams) {
        probedParams = intersectParams(capParams, pbParams);
        
        if (probedParams.rates.length > 0) {
          suggestedRates = probedParams.rates.sort((a, b) => a - b);
          console.log(`   ✓ Supported rates: ${suggestedRates.join(', ')}`);
        }
        
        if (probedParams.channels.max < 8) {
          suggestedChannels = [];
          for (let i = probedParams.channels.min; i <= probedParams.channels.max; i++) {
            suggestedChannels.push(i);
          }
          console.log(`   ✓ Supported channels: ${suggestedChannels.join(', ')}`);
        }
      } else {
        console.log('   ⚠️  Could not probe devices (may be a plugin, not a hardware device)');
      }
    }
  }
  
  // Step 6: Ask for samplerate
  const rateChoices = suggestedRates.map(r => ({ 
    name: `${r} Hz`, 
    value: r 
  }));
  rateChoices.push({ name: '✏️  Custom rate', value: 'custom' });
  
  let samplerate = await select({
    message: '\nSelect sample rate:',
    choices: rateChoices,
    default: suggestedRates.includes(48000) ? 48000 : suggestedRates[0]
  });
  
  if (samplerate === 'custom') {
    samplerate = await number({
      message: 'Enter sample rate (Hz):',
      default: 48000,
      min: 8000,
      max: 384000
    });
  }
  
  // Step 7: Ask for channels
  const channelChoices = suggestedChannels.map(c => ({
    name: `${c} channel${c > 1 ? 's' : ''}`,
    value: c
  }));
  if (!suggestedChannels.includes(12)) {
    channelChoices.push({ name: '✏️  Custom count', value: 'custom' });
  }
  
  let channels = await select({
    message: 'Select channel count:',
    choices: channelChoices,
    default: 2
  });
  
  if (channels === 'custom') {
    channels = await number({
      message: 'Enter channel count:',
      default: 2,
      min: 1,
      max: 64
    });
  }
  
  // Step 8: Ask for chunksize
  const defaultChunksize = samplerate <= 48000 ? 1024 
    : samplerate <= 96000 ? 2048 
    : 4096;
  
  const chunksize = await number({
    message: 'Enter chunk size (samples per channel):',
    default: defaultChunksize,
    min: 64,
    max: 16384
  });
  
  // Step 9: Preview and confirm
  const config = {
    backend,
    captureDevice: captureDevice === 'default' ? null : captureDevice,
    playbackDevice: playbackDevice === 'default' ? null : playbackDevice,
    samplerate,
    channels,
    chunksize
  };
  
  const yaml = generateYAML(config);
  
  console.log('\n📄 Generated configuration:\n');
  console.log('─'.repeat(60));
  console.log(yaml);
  console.log('─'.repeat(60));
  
  const shouldWrite = await confirm({
    message: `Write to ${OUTPUT_FILE}?`,
    default: true
  });
  
  if (!shouldWrite) {
    console.log('\n❌ Cancelled.');
    process.exit(0);
  }
  
  // Step 10: Write and validate
  const outputPath = resolve(OUTPUT_FILE);
  writeFileSync(outputPath, yaml, 'utf8');
  console.log(`\n✓ Written to: ${outputPath}`);
  
  console.log('\n🔍 Validating configuration...');
  const validation = validateConfig(outputPath);
  
  if (validation.valid) {
    console.log('✅ Configuration is valid!\n');
    console.log('You can now run:');
    console.log(`   ${CAMILLADSP_BIN} ${OUTPUT_FILE}\n`);
    process.exit(0);
  } else {
    console.log('❌ Configuration validation failed:\n');
    console.log(validation.error);
    console.log('\n⚠️  The file was written but may need manual adjustment.\n');
    process.exit(1);
  }
}

// ============================================================================
// Entry Point
// ============================================================================

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
