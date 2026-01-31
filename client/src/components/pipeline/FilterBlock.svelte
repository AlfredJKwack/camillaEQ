<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import FilterIcon from '../icons/FilterIcons.svelte';
  import type { FilterBlockVm } from '../../lib/pipelineViewModel';

  export let block: FilterBlockVm;

  const dispatch = createEventDispatcher<{
    reorderName: { blockId: string; fromIndex: number; toIndex: number };
  }>();

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
            <div class="filter-row" class:missing={!filter.exists} class:bypassed={filter.bypassed}>
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
              {#if filter.bypassed}
                <span class="bypassed-badge">Off</span>
              {/if}
            </div>
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
    min-width: 0;
  }

  .filter-row:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .filter-row.missing {
    border-color: rgba(255, 120, 120, 0.3);
    background: rgba(255, 120, 120, 0.05);
  }

  .filter-row.bypassed {
    opacity: 0.5;
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

  .bypassed-badge {
    padding: 0.125rem 0.5rem;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 3px;
    font-size: 0.75rem;
    color: var(--ui-text-muted);
    font-weight: 600;
  }
</style>
