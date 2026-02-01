/**
 * Mixer editing helpers
 * Pure functions for manipulating mixer definitions in pipeline configs
 */

import type { CamillaDSPConfig } from './camillaDSP';

/**
 * Set gain for a specific source in a mixer destination
 */
export function setMixerSourceGain(
  config: CamillaDSPConfig,
  mixerName: string,
  destIndex: number,
  sourceIndex: number,
  gain: number
): CamillaDSPConfig {
  const updatedConfig = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  const mixer = updatedConfig.mixers[mixerName];

  if (!mixer || !mixer.mapping || !mixer.mapping[destIndex]) {
    throw new Error(`Mixer "${mixerName}" or destination ${destIndex} not found`);
  }

  const sources = mixer.mapping[destIndex].sources;
  if (!sources || !sources[sourceIndex]) {
    throw new Error(`Source ${sourceIndex} not found in destination ${destIndex}`);
  }

  // Clamp gain to CamillaDSP range
  const clampedGain = Math.max(-150, Math.min(50, gain));
  sources[sourceIndex].gain = clampedGain;

  return updatedConfig;
}

/**
 * Toggle mute state for a specific source in a mixer destination
 */
export function toggleMixerSourceMute(
  config: CamillaDSPConfig,
  mixerName: string,
  destIndex: number,
  sourceIndex: number
): CamillaDSPConfig {
  const updatedConfig = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  const mixer = updatedConfig.mixers[mixerName];

  if (!mixer || !mixer.mapping || !mixer.mapping[destIndex]) {
    throw new Error(`Mixer "${mixerName}" or destination ${destIndex} not found`);
  }

  const sources = mixer.mapping[destIndex].sources;
  if (!sources || !sources[sourceIndex]) {
    throw new Error(`Source ${sourceIndex} not found in destination ${destIndex}`);
  }

  sources[sourceIndex].mute = !sources[sourceIndex].mute;

  return updatedConfig;
}

/**
 * Toggle inverted state for a specific source in a mixer destination
 */
export function toggleMixerSourceInverted(
  config: CamillaDSPConfig,
  mixerName: string,
  destIndex: number,
  sourceIndex: number
): CamillaDSPConfig {
  const updatedConfig = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  const mixer = updatedConfig.mixers[mixerName];

  if (!mixer || !mixer.mapping || !mixer.mapping[destIndex]) {
    throw new Error(`Mixer "${mixerName}" or destination ${destIndex} not found`);
  }

  const sources = mixer.mapping[destIndex].sources;
  if (!sources || !sources[sourceIndex]) {
    throw new Error(`Source ${sourceIndex} not found in destination ${destIndex}`);
  }

  sources[sourceIndex].inverted = !sources[sourceIndex].inverted;

  return updatedConfig;
}

/**
 * Toggle mute state for a destination
 */
export function setMixerDestMute(
  config: CamillaDSPConfig,
  mixerName: string,
  destIndex: number,
  mute: boolean
): CamillaDSPConfig {
  const updatedConfig = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  const mixer = updatedConfig.mixers[mixerName];

  if (!mixer || !mixer.mapping || !mixer.mapping[destIndex]) {
    throw new Error(`Mixer "${mixerName}" or destination ${destIndex} not found`);
  }

  mixer.mapping[destIndex].mute = mute;

  return updatedConfig;
}

/**
 * Add a source to a mixer destination
 */
export function addMixerSource(
  config: CamillaDSPConfig,
  mixerName: string,
  destIndex: number,
  channel: number
): CamillaDSPConfig {
  const updatedConfig = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  const mixer = updatedConfig.mixers[mixerName];

  if (!mixer || !mixer.mapping || !mixer.mapping[destIndex]) {
    throw new Error(`Mixer "${mixerName}" or destination ${destIndex} not found`);
  }

  const sources = mixer.mapping[destIndex].sources;
  if (!sources) {
    throw new Error(`Destination ${destIndex} has no sources array`);
  }

  // Check if source with this channel already exists
  const exists = sources.some(src => src.channel === channel);
  if (exists) {
    throw new Error(`Source with channel ${channel} already exists in destination ${destIndex}`);
  }

  // Add new source with default values
  sources.push({
    channel,
    gain: 0,
    inverted: false,
    mute: false,
    scale: 'dB',
  });

  return updatedConfig;
}

/**
 * Remove a source from a mixer destination
 */
export function removeMixerSource(
  config: CamillaDSPConfig,
  mixerName: string,
  destIndex: number,
  sourceIndex: number
): CamillaDSPConfig {
  const updatedConfig = JSON.parse(JSON.stringify(config)) as CamillaDSPConfig;
  const mixer = updatedConfig.mixers[mixerName];

  if (!mixer || !mixer.mapping || !mixer.mapping[destIndex]) {
    throw new Error(`Mixer "${mixerName}" or destination ${destIndex} not found`);
  }

  const sources = mixer.mapping[destIndex].sources;
  if (!sources || !sources[sourceIndex]) {
    throw new Error(`Source ${sourceIndex} not found in destination ${destIndex}`);
  }

  sources.splice(sourceIndex, 1);

  return updatedConfig;
}
