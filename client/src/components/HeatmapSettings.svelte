<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { HeatmapMaskMode } from '../ui/rendering/canvasLayers/SpectrumHeatmapLayer';
  import KnobDial from './KnobDial.svelte';

  export let maskMode: HeatmapMaskMode;
  export let highPrecision: boolean;
  export let alphaGamma: number;
  export let magnitudeGain: number;
  export let gateThreshold: number;
  export let maxAlpha: number;
  export let anchorEl: HTMLElement | null = null;
  export let buttonLeft: number;
  export let buttonRight: number;
  export let buttonCenterY: number;

  const dispatch = createEventDispatcher<{
    close: void;
    change: {
      maskMode?: HeatmapMaskMode;
      highPrecision?: boolean;
      alphaGamma?: number;
      magnitudeGain?: number;
      gateThreshold?: number;
      maxAlpha?: number;
    };
  }>();

  let popoverElement: HTMLDivElement;
  let popoverX = 0;
  let popoverY = 0;

  function handleClickOutside(event: MouseEvent) {
    const target = event.target as Node;
    
    // Don't close if clicking inside popover OR on the anchor button
    if (popoverElement && !popoverElement.contains(target)) {
      if (anchorEl && anchorEl.contains(target)) {
        // Click on anchor button - let the button handler deal with it
        return;
      }
      dispatch('close');
    }
  }

  function computeSafePosition() {
    if (!popoverElement) return;

    const rect = popoverElement.getBoundingClientRect();
    const margin = 8;
    const gap = 8;

    // Determine which side has more space
    const spaceLeft = buttonLeft - margin;
    const spaceRight = window.innerWidth - buttonRight - margin;

    let x: number;
    
    // Try right side first
    if (spaceRight >= rect.width) {
      x = buttonRight + gap;
    } else if (spaceLeft >= rect.width) {
      x = buttonLeft - gap - rect.width;
    } else {
      // Neither side fits perfectly, choose side with more space
      if (spaceRight > spaceLeft) {
        x = buttonRight + gap;
      } else {
        x = buttonLeft - gap - rect.width;
      }
    }

    // Clamp X to viewport
    x = Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin));

    // Compute Y (centered on button)
    let y = buttonCenterY - rect.height / 2;

    // Clamp Y to viewport
    y = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin));

    popoverX = x;
    popoverY = y;
  }

  onMount(() => {
    computeSafePosition();
    window.addEventListener('click', handleClickOutside, true);
    window.addEventListener('resize', computeSafePosition);
    popoverElement?.focus();

    return () => {
      window.removeEventListener('click', handleClickOutside, true);
      window.removeEventListener('resize', computeSafePosition);
    };
  });

  function handleMaskModeChange(newMode: HeatmapMaskMode) {
    dispatch('change', { maskMode: newMode });
  }

  function handleHighPrecisionChange(event: Event) {
    const target = event.target as HTMLInputElement;
    dispatch('change', { highPrecision: target.checked });
  }

  function handleKnobChange(param: string, value: number) {
    // Round appropriately for storage and display
    let rounded: number;
    if (param === 'alphaGamma' || param === 'magnitudeGain') {
      rounded = Math.round(value * 10) / 10; // 1 decimal place
    } else if (param === 'gateThreshold') {
      rounded = Math.round(value * 100) / 100; // 2 decimal places
    } else {
      rounded = Math.round(value * 100) / 100; // maxAlpha: 2 decimal places
    }

    dispatch('change', { [param]: rounded });
  }
</script>

<div
  class="heatmap-settings"
  bind:this={popoverElement}
  tabindex="-1"
  role="dialog"
  aria-label="Heatmap settings"
  style="left: {popoverX}px; top: {popoverY}px;"
>
  <div class="settings-header">
    <span class="settings-title">Heatmap Settings</span>
  </div>

  <div class="settings-section">
    <label class="section-label">Mask Mode</label>
    <div class="mask-buttons">
      <button
        class="mask-btn"
        class:active={maskMode === 'top'}
        on:click={() => handleMaskModeChange('top')}
        title="Heatmap above curve"
      >
        Top
      </button>
      <button
        class="mask-btn"
        class:active={maskMode === 'bottom'}
        on:click={() => handleMaskModeChange('bottom')}
        title="Heatmap below curve"
      >
        Bottom
      </button>
      <button
        class="mask-btn"
        class:active={maskMode === 'full'}
        on:click={() => handleMaskModeChange('full')}
        title="Full heatmap (no masking)"
      >
        Full
      </button>
    </div>
  </div>

  <div class="settings-section">
    <label class="checkbox-label">
      <input type="checkbox" checked={highPrecision} on:change={handleHighPrecisionChange} />
      High precision
    </label>
  </div>

  <div class="settings-section knobs-section">
    <div class="knob-row">
      <label class="knob-label">Contrast</label>
      <KnobDial
        value={alphaGamma}
        min={0.8}
        max={4.0}
        scale="linear"
        size={24}
        on:change={(e) => handleKnobChange('alphaGamma', e.detail.value)}
      />
      <span class="knob-value">{alphaGamma.toFixed(1)}</span>
    </div>

    <div class="knob-row">
      <label class="knob-label">Gain</label>
      <KnobDial
        value={magnitudeGain}
        min={0.5}
        max={4.0}
        scale="linear"
        size={24}
        on:change={(e) => handleKnobChange('magnitudeGain', e.detail.value)}
      />
      <span class="knob-value">{magnitudeGain.toFixed(1)}</span>
    </div>

    <div class="knob-row">
      <label class="knob-label">Gate</label>
      <KnobDial
        value={gateThreshold}
        min={0.0}
        max={0.20}
        scale="linear"
        size={24}
        on:change={(e) => handleKnobChange('gateThreshold', e.detail.value)}
      />
      <span class="knob-value">{gateThreshold.toFixed(2)}</span>
    </div>

    <div class="knob-row">
      <label class="knob-label">Max α</label>
      <KnobDial
        value={maxAlpha}
        min={0.2}
        max={1.0}
        scale="linear"
        size={24}
        on:change={(e) => handleKnobChange('maxAlpha', e.detail.value)}
      />
      <span class="knob-value">{maxAlpha.toFixed(2)}</span>
    </div>
  </div>
</div>

<style>
  .heatmap-settings {
    position: fixed;
    z-index: 1000;
    background: var(--ui-panel);
    border: 1px solid var(--ui-border);
    border-radius: 8px;
    padding: 1rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    min-width: 200px;
    max-width: 280px;
    outline: none;
  }

  .settings-header {
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--ui-border);
  }

  .settings-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--ui-text);
    letter-spacing: 0.02em;
  }

  .settings-section {
    margin-bottom: 1rem;
  }

  .settings-section:last-child {
    margin-bottom: 0;
  }

  .section-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ui-text-muted);
    margin-bottom: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .mask-buttons {
    display: flex;
    gap: 4px;
  }

  .mask-btn {
    flex: 1;
    padding: 0.375rem 0.5rem;
    background: transparent;
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    color: var(--ui-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mask-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .mask-btn.active {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.25);
    color: var(--ui-text);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--ui-text-muted);
    font-size: 0.875rem;
    cursor: pointer;
  }

  .checkbox-label input[type='checkbox'] {
    cursor: pointer;
  }

  .knobs-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .knob-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 0.75rem;
  }

  .knob-label {
    font-size: 0.75rem;
    color: var(--ui-text-muted);
    font-weight: 500;
  }

  .knob-value {
    font-size: 0.75rem;
    color: var(--ui-text);
    font-variant-numeric: tabular-nums;
    min-width: 2.5rem;
    text-align: right;
  }
</style>
