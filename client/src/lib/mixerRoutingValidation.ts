/**
 * Mixer routing validation
 * Validates mixer routing to prevent silent channel loss and warn about summing
 */

import type { MixerDefinition } from './camillaDSP';

/**
 * Validation result for a single mixer destination
 */
export interface MixerDestValidation {
  dest: number;
  errors: string[];   // Blocks upload
  warnings: string[]; // Visual only, does not block upload
}

/**
 * Overall mixer validation result
 */
export interface MixerValidationResult {
  valid: boolean; // False if any dest has errors
  perDest: MixerDestValidation[];
}

/**
 * Validate mixer routing
 * 
 * Rules:
 * - Error: destination has 0 effective sources (blocks upload)
 *   - Effective source = !source.mute AND !dest.mute
 *   - If dest.mute === true, skip this check (muted dests don't need sources)
 * - Warning: destination has >1 unmuted source (summing)
 * - Warning: if summing and any unmuted source has gain > 0 dB
 */
export function validateMixerRouting(mixer: MixerDefinition): MixerValidationResult {
  const perDest: MixerDestValidation[] = [];
  let hasErrors = false;

  if (!mixer.mapping) {
    return { valid: true, perDest: [] };
  }

  for (let i = 0; i < mixer.mapping.length; i++) {
    const destMapping = mixer.mapping[i];
    const errors: string[] = [];
    const warnings: string[] = [];

    const destMuted = destMapping.mute || false;

    // Count unmuted sources
    const unmutedSources = (destMapping.sources || []).filter(src => !src.mute);
    const effectiveSourceCount = unmutedSources.length;

    // Error: silent channel loss (no effective sources and dest is not muted)
    if (!destMuted && effectiveSourceCount === 0) {
      errors.push('Silent channel: no unmuted sources');
      hasErrors = true;
    }

    // Warning: summing (>1 unmuted source)
    if (effectiveSourceCount > 1) {
      warnings.push(`Summing ${effectiveSourceCount} sources`);

      // Warning: gain > 0 dB while summing
      const hasPositiveGain = unmutedSources.some(src => (src.gain || 0) > 0);
      if (hasPositiveGain) {
        warnings.push('Summing with gain > 0 dB (risk of clipping)');
      }
    }

    perDest.push({
      dest: destMapping.dest,
      errors,
      warnings,
    });
  }

  return {
    valid: !hasErrors,
    perDest,
  };
}
