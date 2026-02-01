<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import FilterIcon from '../icons/FilterIcons.svelte';
  import KnobDial from '../KnobDial.svelte';
  import type { FilterBlockVm } from '../../lib/pipelineViewModel';

  export let block: FilterBlockVm;
  export let expanded: boolean = false;
  export let expandedFilters: Set<string> = new Set(); // Now passed from parent

  const dispatch = createEventDispatcher<{
    reorderName: { blockId: string; fromIndex: number; toIndex: number };
    updateFilterParam: { filterName: string; param: 'freq' | 'q' | 'gain'; value: number };
    enableFilter: { blockId: string; filterName: string };
    disableFilter: { blockId: string; filterName: string };
    toggleFilterExpanded: { blockId: string; filterName: string };
    removeFilter: { filterName: string };
  }>();
  
  function handleFilterExpandToggle(filterName: string) {
    dispatch('toggleFilterExpanded', { blockId: block.blockId, filterName });
  }

  // Row drag state
  interface RowDragState {
    filterName: string;
    fromIndex: number;
    startY: number;
  }
  let rowDragState: RowDragState | null = null;
  let rowLandingZoneIndex: number | null = null;

  // Movement threshold (px)
  const DRAG_THRESHOLD = 6;

  function handleRowGrabPointerDown(event: PointerEvent, filterName: string, index: number) {
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);

    // Record start position
    rowDragState = {
      filterName,
      fromIndex: index,
      startY: event.clientY,
    };
  }

  function handleRowGrabPointerMove(event: PointerEvent) {
    if (!rowDragState) return;

    const deltaY = event.clientY - rowDragState.startY;

    // Check if we've exceeded threshold to start dragging
    if (Math.abs(deltaY) < DRAG_THRESHOLD && rowLandingZoneIndex === null) {
      return; // Not dragging yet
    }

    // Compute landing zone index based on pointer position
    const target = event.currentTarget as HTMLElement;
    const containerElement = target.closest('.filter-list');
    if (!containerElement) return;

    const rowElements = Array.from(containerElement.querySelectorAll('.filter-row-wrapper'));
    let newLandingIndex = rowDragState.fromIndex;

    for (let i = 0; i < rowElements.length; i++) {
      const el = rowElements[i] as HTMLElement;
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      if (event.clientY < midY) {
        newLandingIndex = i;
        break;
      } else if (i === rowElements.length - 1) {
        newLandingIndex = i + 1;
      }
    }

    // Clamp to valid range
    rowLandingZoneIndex = Math.max(0, Math.min(block.filters.length, newLandingIndex));
  }

  function handleRowGrabPointerUp(event: PointerEvent) {
    if (!rowDragState) return;

    const target = event.currentTarget as HTMLElement;
    target.releasePointerCapture(event.pointerId);

    // Check if we actually dragged and moved to a different position
    const didDrag = rowLandingZoneIndex !== null;
    const didMove = didDrag && rowLandingZoneIndex !== rowDragState.fromIndex;

    if (didMove) {
      // Compute effective toIndex for arrayMove semantics
      // When dragging down (toIndex > fromIndex), arrayMove removes first then inserts,
      // so we need to subtract 1 to account for the shift
      let toIndex = rowLandingZoneIndex!;
      if (toIndex > rowDragState.fromIndex) {
        toIndex -= 1;
      }

      // Clamp to valid range
      toIndex = Math.max(0, Math.min(block.filters.length - 1, toIndex));

      // Dispatch reorder event
      dispatch('reorderName', {
        blockId: block.blockId,
        fromIndex: rowDragState.fromIndex,
        toIndex,
      });
    }

    // Clean up drag state
    rowDragState = null;
    rowLandingZoneIndex = null;
  }
</script>

<div class="pipeline-block filter-block" data-bypassed={block.bypassed}>
  <div class="block-header">
    <span class="block-type">Filter</span>
    <div class="channel-badges">
      {#each block.channels as ch}
        <span class="channel-badge">CH {ch}</span>
      {/each}
    </div>
    {#if block.bypassed}
      <span class="bypass-pill">Bypassed</span>
    {/if}
  </div>

  <div class="block-body">
    {#if block.filters.length === 0}
      <div class="empty-message">No filters</div>
    {:else}
      <div class="filter-list" class:dragging={rowDragState !== null}>
        {#each block.filters as filter, i (filter.name)}
          <!-- Landing zone before this row (shown during drag) -->
          {#if rowLandingZoneIndex === i}
            <div class="row-landing-zone">Drop here</div>
          {/if}

          <!-- Row wrapper for stable identity -->
          <div
            class="filter-row-wrapper"
            class:is-dragging={rowDragState?.filterName === filter.name}
          >
            <!-- Row grab handle -->
            <button
              class="row-grab-handle"
              on:pointerdown={(e) => handleRowGrabPointerDown(e, filter.name, i)}
              on:pointermove={handleRowGrabPointerMove}
              on:pointerup={handleRowGrabPointerUp}
              title="Drag to reorder filter"
            >
              ☰
            </button>

            <!-- Filter row content -->
            <div class="filter-row" class:missing={!filter.exists} class:disabled={filter.disabled}>
              <div class="filter-icon">
                {#if filter.iconType}
                  <FilterIcon type={filter.iconType} />
                {:else}
                  <span class="no-icon">•</span>
                {/if}
              </div>
              <div class="filter-name">{filter.name}</div>
              {#if !filter.exists}
                <span class="warning-badge">Missing</span>
              {/if}
              {#if filter.disabled}
                <span class="disabled-badge">Disabled</span>
              {/if}
              
              <!-- Compact parameter values (when collapsed) -->
              {#if filter.exists && filter.filterType === 'Biquad' && !expandedFilters.has(filter.name)}
                <div class="filter-values">
                  <span class="value">{(filter.freq ?? 1000).toFixed(0)} Hz</span>
                  <span class="value">Q {(filter.q ?? 1.0).toFixed(1)}</span>
                  {#if filter.supportsGain}
                    <span class="value">{(filter.gain ?? 0).toFixed(1)} dB</span>
                  {/if}
                </div>
              {/if}
              
              <!-- MVP-21: Reserved slot for expand button (prevents layout shift) -->
              {#if filter.exists && filter.filterType === 'Biquad'}
                <div class="filter-expand-slot">
                  {#if expanded}
                    <button 
                      class="filter-expand-btn"
                      on:click={() => handleFilterExpandToggle(filter.name)}
                      title={expandedFilters.has(filter.name) ? 'Collapse' : 'Edit parameters'}
                    >
                      {expandedFilters.has(filter.name) ? '−' : '+'}
                    </button>
                  {:else}
                    <!-- Invisible placeholder to reserve space -->
                    <span class="filter-expand-placeholder" aria-hidden="true"></span>
                  {/if}
                </div>
              {/if}
            </div>
            
            <!-- MVP-21: Per-filter editor (shown when expanded) -->
            {#if expanded && expandedFilters.has(filter.name) && filter.exists && filter.filterType === 'Biquad'}
              <div class="filter-editor">
                <div class="editor-controls">
                  <!-- Column 1: Power button -->
                  <div class="editor-col power-col">
                    <button 
                      class="power-btn"
                      class:enabled={!filter.disabled}
                      on:click={() => {
                        if (filter.disabled) {
                          dispatch('enableFilter', { blockId: block.blockId, filterName: filter.name });
                        } else {
                          dispatch('disableFilter', { blockId: block.blockId, filterName: filter.name });
                        }
                      }}
                      title={filter.disabled ? 'Enable filter' : 'Disable filter'}
                      aria-label={filter.disabled ? 'Enable filter' : 'Disable filter'}
                    >
                      ⏻
                    </button>
                  </div>
                  
                  <!-- Column 2: Knobs (stretches) -->
                  <div class="editor-col knobs-col" class:disabled={filter.disabled}>
                    <!-- Frequency knob -->
                    <div class="editor-control">
                      <span class="control-label">Freq</span>
                      <KnobDial 
                        value={filter.freq ?? 1000} 
                        mode="frequency" 
                        size={24}
                        on:change={(e) => {
                          if (!filter.disabled) {
                            dispatch('updateFilterParam', { 
                              filterName: filter.name, 
                              param: 'freq', 
                              value: e.detail.value 
                            });
                          }
                        }}
                      />
                      <span class="control-value">{(filter.freq ?? 1000).toFixed(0)} Hz</span>
                    </div>
                    
                    <!-- Q knob -->
                    <div class="editor-control">
                      <span class="control-label">Q</span>
                      <KnobDial 
                        value={filter.q ?? 1.0} 
                        mode="q" 
                        size={24}
                        on:change={(e) => {
                          if (!filter.disabled) {
                            dispatch('updateFilterParam', { 
                              filterName: filter.name, 
                              param: 'q', 
                              value: e.detail.value 
                            });
                          }
                        }}
                      />
                      <span class="control-value">{(filter.q ?? 1.0).toFixed(1)}</span>
                    </div>
                    
                    <!-- Gain knob (only for gain-capable types) -->
                    {#if filter.supportsGain}
                      <div class="editor-control">
                        <span class="control-label">Gain</span>
                        <KnobDial 
                          value={filter.gain ?? 0} 
                          min={-24}
                          max={24}
                          scale="linear"
                          size={24}
                          on:change={(e) => {
                            if (!filter.disabled) {
                              dispatch('updateFilterParam', { 
                                filterName: filter.name, 
                                param: 'gain', 
                                value: e.detail.value 
                              });
                            }
                          }}
                        />
                        <span class="control-value">{(filter.gain ?? 0).toFixed(1)} dB</span>
                      </div>
                    {/if}
                  </div>
                  
                  <!-- Column 3: Remove button -->
                  <div class="editor-col actions-col">
                    {#if !filter.disabled}
                      <button 
                        class="remove-filter-btn"
                        on:click={() => dispatch('removeFilter', { filterName: filter.name })}
                        title="Remove this filter"
                      >
                        ×
                      </button>
                    {/if}
                  </div>
                </div>
              </div>
            {/if}
          </div>
        {/each}

        <!-- Final landing zone (at end) -->
        {#if rowLandingZoneIndex === block.filters.length}
          <div class="row-landing-zone">Drop here</div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .pipeline-block {
    padding: 1rem;
    background: var(--ui-panel);
    border: 1px solid var(--ui-border);
    border-radius: 8px;
    transition: all 0.15s ease;
  }

  .filter-block {
    border-left: 3px solid color-mix(in oklab, #4a9eff 50%, var(--ui-border) 50%);
  }

  .pipeline-block[data-bypassed='true'] {
    opacity: 0.6;
  }

  .block-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .block-type {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--ui-text);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .channel-badges {
    display: flex;
    gap: 0.25rem;
  }

  .channel-badge {
    padding: 0.125rem 0.5rem;
    background: rgba(74, 158, 255, 0.15);
    border: 1px solid rgba(74, 158, 255, 0.3);
    border-radius: 3px;
    font-size: 0.75rem;
    color: rgb(74, 158, 255);
    font-weight: 600;
  }

  .bypass-pill {
    padding: 0.125rem 0.5rem;
    background: rgba(255, 200, 80, 0.15);
    border: 1px solid rgba(255, 200, 80, 0.3);
    border-radius: 3px;
    font-size: 0.75rem;
    color: rgb(255, 200, 80);
    font-weight: 600;
  }

  .block-body {
    padding-top: 0.5rem;
    border-top: 1px solid var(--ui-border);
  }

  .empty-message {
    font-size: 0.875rem;
    color: var(--ui-text-dim);
    font-style: italic;
  }

  .filter-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .filter-list.dragging {
    gap: 0; /* Remove gaps during drag to prevent flicker */
  }

  .filter-row-wrapper {
    display: flex;
    align-items: stretch;
    gap: 0.375rem;
    transition: all 0.15s ease;
  }

  .filter-row-wrapper.is-dragging {
    opacity: 0.5;
  }

  .row-grab-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    flex-shrink: 0;
    background: var(--ui-panel);
    border: 1px solid var(--ui-border);
    border-radius: 3px;
    color: var(--ui-text-dim);
    font-size: 1rem;
    cursor: grab;
    transition: all 0.15s ease;
    padding: 0;
  }

  .row-grab-handle:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.2);
    color: var(--ui-text);
  }

  .row-grab-handle:active {
    cursor: grabbing;
  }

  .row-landing-zone {
    height: 40px;
    margin: 0.25rem 0;
    border: 2px dashed rgba(74, 158, 255, 0.5);
    border-radius: 4px;
    background: rgba(74, 158, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(74, 158, 255, 0.7);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .filter-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    transition: all 0.15s ease;
    flex: 1;
    /* min-width: 0; */
  }

  .filter-row:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .filter-row.missing {
    border-color: rgba(255, 120, 120, 0.3);
    background: rgba(255, 120, 120, 0.05);
  }

  .filter-row.disabled {
    opacity: 0.4;
    background: rgba(128, 128, 128, 0.05);
  }

  .filter-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .no-icon {
    font-size: 1.25rem;
    color: var(--ui-text-muted);
  }

  .filter-name {
    flex: 1;
    font-size: 0.875rem;
    font-family: 'Courier New', monospace;
    color: var(--ui-text);
  }

  .warning-badge {
    padding: 0.125rem 0.5rem;
    background: rgba(255, 120, 120, 0.2);
    border: 1px solid rgba(255, 120, 120, 0.4);
    border-radius: 3px;
    font-size: 0.75rem;
    color: rgb(255, 120, 120);
    font-weight: 600;
  }

  .disabled-badge {
    padding: 0.125rem 0.5rem;
    background: rgba(128, 128, 128, 0.15);
    border: 1px solid rgba(128, 128, 128, 0.3);
    border-radius: 3px;
    font-size: 0.75rem;
    color: rgba(128, 128, 128, 0.8);
    font-weight: 600;
  }
  
  .filter-values {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    margin-left: auto;
    padding-right: 0.25rem;
  }
  
  .filter-values .value {
    font-size: 0.75rem;
    font-family: 'Courier New', monospace;
    color: var(--ui-text-muted);
    white-space: nowrap;
  }
  
  /* MVP-21: Editor UI */
  .filter-expand-slot {
    width: 24px;
    flex: 0 0 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .filter-expand-placeholder {
    width: 24px;
    height: 24px;
    visibility: hidden;
  }
  
  .filter-expand-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--ui-border);
    border-radius: 3px;
    color: var(--ui-text-muted);
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .filter-expand-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.3);
    color: var(--ui-text);
  }
  
  .filter-editor {
    margin-top: 0.5rem;
    padding: 0.75rem;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 4px;
  }
  
  .editor-controls {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  
  .editor-col {
    display: flex;
    align-items: center;
  }
  
  .power-col {
    flex: 0 0 auto;
  }
  
  .knobs-col {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
    transition: opacity 0.15s ease;
  }
  
  .knobs-col.disabled {
    opacity: 0.35;
    pointer-events: none;
  }
  
  .actions-col {
    flex: 0 0 auto;
  }
  
  .editor-control {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }
  
  .power-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    background: rgba(128, 128, 128, 0.15);
    border: 1px solid rgba(128, 128, 128, 0.3);
    border-radius: 4px;
    color: rgba(128, 128, 128, 0.8);
    font-size: 1.25rem;
    line-height: 1;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .power-btn.enabled {
    background: rgba(80, 200, 120, 0.15);
    border: 1px solid rgba(80, 200, 120, 0.3);
    color: rgb(80, 200, 120);
  }
  
  .power-btn:hover {
    background: rgba(128, 128, 128, 0.25);
    border-color: rgba(128, 128, 128, 0.5);
  }
  
  .power-btn.enabled:hover {
    background: rgba(80, 200, 120, 0.25);
    border-color: rgba(80, 200, 120, 0.5);
  }
  
  .control-label {
    color: var(--ui-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  
  .control-value {
    min-width: 60px;
    color: var(--ui-text);
    font-size: 0.75rem;
    font-family: 'Courier New', monospace;
  }
  
  .remove-filter-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    background: rgba(255, 80, 80, 0.15);
    border: 1px solid rgba(255, 80, 80, 0.3);
    border-radius: 4px;
    color: rgb(255, 80, 80);
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  
  .remove-filter-btn:hover {
    background: rgba(255, 80, 80, 0.25);
    border-color: rgba(255, 80, 80, 0.5);
  }
</style>
