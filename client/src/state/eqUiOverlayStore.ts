/**
 * eqUiOverlayStore.ts
 * Manages UI overlay state for EQ page (tooltips, popovers, pickers)
 * Avoids prop drilling by providing a centralized event bus
 */

import { writable } from 'svelte/store';
import type { EqBand } from '../dsp/filterResponse';
import type { HeatmapMaskMode } from '../ui/rendering/canvasLayers/SpectrumHeatmapLayer';

// Fader tooltip state
export interface FaderTooltipState {
  bandIndex: number | null; // null = master, 0+ = band index
  visible: boolean;
  fading: boolean;
  x: number;
  y: number;
  side: 'left' | 'right';
  value: number;
}

// Filter type picker state
export interface FilterTypePickerState {
  open: boolean;
  bandIndex: number | null;
  bandLeft: number;
  bandRight: number;
  iconCenterY: number;
}

// Heatmap settings popover state
export interface HeatmapSettingsState {
  open: boolean;
  buttonLeft: number;
  buttonRight: number;
  buttonCenterY: number;
}

// Store for fader tooltip
export const faderTooltipState = writable<FaderTooltipState>({
  bandIndex: null,
  visible: false,
  fading: false,
  x: 0,
  y: 0,
  side: 'left',
  value: 0,
});

// Store for filter type picker
export const filterTypePickerState = writable<FilterTypePickerState>({
  open: false,
  bandIndex: null,
  bandLeft: 0,
  bandRight: 0,
  iconCenterY: 0,
});

// Store for heatmap settings
export const heatmapSettingsState = writable<HeatmapSettingsState>({
  open: false,
  buttonLeft: 0,
  buttonRight: 0,
  buttonCenterY: 0,
});

let tooltipFadeTimer: number | null = null;

/**
 * Show fader tooltip at given position
 */
export function showFaderTooltip(
  bandIndex: number | null,
  thumbElement: HTMLElement,
  value: number
): void {
  if (tooltipFadeTimer !== null) {
    clearTimeout(tooltipFadeTimer);
    tooltipFadeTimer = null;
  }
  
  const rect = thumbElement.getBoundingClientRect();
  const tooltipWidth = 60;
  const margin = 8;
  
  // Determine side based on available space
  const side = rect.left - tooltipWidth - margin < 0 ? 'right' : 'left';
  
  faderTooltipState.set({
    bandIndex,
    visible: true,
    fading: false,
    x: side === 'left' ? rect.left : rect.right,
    y: rect.top + rect.height / 2,
    side,
    value,
  });
}

/**
 * Update tooltip position (during drag)
 */
export function updateFaderTooltipPosition(thumbElement: HTMLElement, value: number): void {
  faderTooltipState.update(state => {
    const rect = thumbElement.getBoundingClientRect();
    return {
      ...state,
      value,
      y: rect.top + rect.height / 2,
      x: state.side === 'left' ? rect.left : rect.right,
    };
  });
}

/**
 * Hide fader tooltip with fade animation
 */
export function hideFaderTooltip(): void {
  faderTooltipState.update(state => ({ ...state, fading: true }));
  
  tooltipFadeTimer = window.setTimeout(() => {
    faderTooltipState.set({
      bandIndex: null,
      visible: false,
      fading: false,
      x: 0,
      y: 0,
      side: 'left',
      value: 0,
    });
    tooltipFadeTimer = null;
  }, 1500);
}

/**
 * Open filter type picker
 */
export function openFilterTypePicker(
  bandIndex: number,
  iconElement: HTMLElement,
  bandColumnElement: HTMLElement
): void {
  const iconRect = iconElement.getBoundingClientRect();
  const bandRect = bandColumnElement.getBoundingClientRect();
  
  filterTypePickerState.set({
    open: true,
    bandIndex,
    bandLeft: bandRect.left,
    bandRight: bandRect.right,
    iconCenterY: iconRect.top + iconRect.height / 2,
  });
}

/**
 * Close filter type picker
 */
export function closeFilterTypePicker(): void {
  filterTypePickerState.update(state => ({ ...state, open: false, bandIndex: null }));
}

/**
 * Open heatmap settings popover
 */
export function openHeatmapSettings(buttonElement: HTMLElement): void {
  const rect = buttonElement.getBoundingClientRect();
  
  heatmapSettingsState.set({
    open: true,
    buttonLeft: rect.left,
    buttonRight: rect.right,
    buttonCenterY: rect.top + rect.height / 2,
  });
}

/**
 * Close heatmap settings popover
 */
export function closeHeatmapSettings(): void {
  heatmapSettingsState.update(state => ({ ...state, open: false }));
}

/**
 * Toggle heatmap settings popover
 */
export function toggleHeatmapSettings(buttonElement: HTMLElement): void {
  heatmapSettingsState.update(state => {
    if (state.open) {
      return { ...state, open: false };
    } else {
      const rect = buttonElement.getBoundingClientRect();
      return {
        open: true,
        buttonLeft: rect.left,
        buttonRight: rect.right,
        buttonCenterY: rect.top + rect.height / 2,
      };
    }
  });
}
