<script lang="ts">
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import type { EqBand } from '../dsp/filterResponse';
  import FilterIcon from './icons/FilterIcons.svelte';

  export let currentType: EqBand['type'];
  export let bandLeft: number;
  export let bandRight: number;
  export let iconCenterY: number;

  const dispatch = createEventDispatcher<{
    select: { type: EqBand['type'] };
    close: void;
  }>();

  // Available filter types (excludes AllPass per MVP-13)
  const filterTypes: Array<{ type: EqBand['type']; label: string; subtitle: string }> = [
    { type: 'Peaking', label: 'Peaking', subtitle: 'Gain + Q' },
    { type: 'LowShelf', label: 'Low Shelf', subtitle: 'Gain + Q' },
    { type: 'HighShelf', label: 'High Shelf', subtitle: 'Gain + Q' },
    { type: 'HighPass', label: 'High Pass', subtitle: 'Q only' },
    { type: 'LowPass', label: 'Low Pass', subtitle: 'Q only' },
    { type: 'BandPass', label: 'Band Pass', subtitle: 'Q only' },
    { type: 'Notch', label: 'Notch', subtitle: 'Q only' },
  ];

  let popoverElement: HTMLDivElement;
  let selectedIndex = filterTypes.findIndex((ft) => ft.type === currentType);
  
  // Computed safe position (viewport-aware, left/right of band)
  let leftPx = 0;
  let topPx = 0;
  let side: 'left' | 'right' = 'right';
  let tailTopPx = 0;

  function handleSelect(type: EqBand['type']) {
    dispatch('select', { type });
    dispatch('close');
  }

  function handleKeyDown(event: KeyboardEvent) {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        dispatch('close');
        break;
      case 'ArrowDown':
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, filterTypes.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        break;
      case 'ArrowRight':
        event.preventDefault();
        // Move to next in 2-column grid
        if (selectedIndex + 2 < filterTypes.length) {
          selectedIndex += 2;
        }
        break;
      case 'ArrowLeft':
        event.preventDefault();
        // Move to previous in 2-column grid
        if (selectedIndex - 2 >= 0) {
          selectedIndex -= 2;
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        handleSelect(filterTypes[selectedIndex].type);
        break;
    }
  }

  function handleClickOutside(event: MouseEvent) {
    if (popoverElement && !popoverElement.contains(event.target as Node)) {
      dispatch('close');
    }
  }
  
  /**
   * Compute safe position next to band (left or right) with speech-bubble tail
   */
  function computeSafePosition() {
    if (!popoverElement) return;
    
    const rect = popoverElement.getBoundingClientRect();
    const margin = 8; // Minimum margin from viewport edge
    const gap = 6; // Gap from band edge
    
    // Choose side: prefer right, fall back to left if no room
    const wouldFitRight = bandRight + gap + rect.width <= window.innerWidth - margin;
    side = wouldFitRight ? 'right' : 'left';
    
    // Horizontal: place to left or right of band with gap
    if (side === 'right') {
      leftPx = bandRight + gap;
    } else {
      leftPx = bandLeft - gap - rect.width;
    }
    
    // Vertical: center on icon, but clamp to viewport
    const desiredTop = iconCenterY - rect.height / 2;
    topPx = Math.max(
      margin,
      Math.min(desiredTop, window.innerHeight - rect.height - margin)
    );
    
    // Tail position: align with icon center, clamped to stay within picker
    const tailMargin = 12; // Keep tail away from rounded corners
    tailTopPx = Math.max(
      tailMargin,
      Math.min(iconCenterY - topPx, rect.height - tailMargin)
    );
  }

  onMount(() => {
    // Compute safe position after render
    tick().then(() => {
      computeSafePosition();
      popoverElement?.focus();
    });

    // Listen for clicks outside
    document.addEventListener('click', handleClickOutside, true);
    
    // Recompute position on resize or scroll (e.g., horizontal band scroll)
    const handleReposition = () => computeSafePosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      document.removeEventListener('click', handleClickOutside, true);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  });
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<div
  class="filter-type-picker"
  role="dialog"
  aria-label="Filter type picker"
  bind:this={popoverElement}
  data-side={side}
  style="left: {leftPx}px; top: {topPx}px; --tail-top: {tailTopPx}px;"
  tabindex="-1"
  on:keydown={handleKeyDown}
>
  <div class="picker-grid">
    {#each filterTypes as filterType, i}
      <button
        class="filter-option"
        class:selected={i === selectedIndex}
        class:current={filterType.type === currentType}
        on:click={() => handleSelect(filterType.type)}
        title="{filterType.label} — {filterType.subtitle}"
      >
        <div class="filter-icon-wrapper">
          <FilterIcon type={filterType.type} />
        </div>
        <span class="filter-label">{filterType.label}</span>
        <span class="filter-subtitle">{filterType.subtitle}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .filter-type-picker {
    position: fixed;
    z-index: 1000;
    background: var(--ui-panel);
    border: 1px solid color-mix(in oklab, var(--ui-border) 70%, white 30%);
    border-radius: 8px;
    padding: 0.5rem;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    outline: none;
  }
  
  /* CSS double-triangle tail for continuous border */
  .filter-type-picker::before,
  .filter-type-picker::after {
    content: '';
    position: absolute;
    top: var(--tail-top, 50%);
    transform: translateY(-50%);
    width: 0;
    height: 0;
    border-style: solid;
    pointer-events: none;
  }
  
  /* Outer triangle (border color) */
  .filter-type-picker::before {
    border-color: transparent;
    border-width: 8px;
  }
  
  /* Inner triangle (fill color) */
  .filter-type-picker::after {
    border-color: transparent;
    border-width: 7px;
  }
  
  /* Tail on left side (picker is on right of band) */
  .filter-type-picker[data-side='right']::before {
    left: -16px;
    border-right-color: color-mix(in oklab, var(--ui-border) 70%, white 30%);
  }
  
  .filter-type-picker[data-side='right']::after {
    left: -14px;
    border-right-color: var(--ui-panel);
  }
  
  /* Tail on right side (picker is on left of band) */
  .filter-type-picker[data-side='left']::before {
    right: -16px;
    border-left-color: color-mix(in oklab, var(--ui-border) 70%, white 30%);
  }
  
  .filter-type-picker[data-side='left']::after {
    right: -14px;
    border-left-color: var(--ui-panel);
  }

  .picker-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    /* gap: 0.375rem; */
  }

  .filter-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    /* gap: 0.25rem; */
    padding: 0.35rem 0.25rem;
    background: transparent;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
    /* min-height: 80px; */
    justify-content: flex-start;
    min-width: 4rem;
  }

  .filter-option:hover,
  .filter-option.selected {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .filter-option.current {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.25);
  }

  .filter-icon-wrapper {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ui-text);
  }

  .filter-icon-wrapper :global(svg) {
    width: 20px;
    height: 20px;
  }

  .filter-label {
    font-size: 0.55rem;
    font-weight: 600;
    color: var(--ui-text);
    text-align: center;
  }

  .filter-subtitle {
    font-size: 0.5rem;
    color: var(--ui-text-dim);
    text-align: center;
  }
</style>
