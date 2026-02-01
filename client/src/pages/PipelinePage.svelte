<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { connectionState, dspConfig, getDspInstance, updateConfig } from '../state/dspStore';
  import { buildPipelineViewModel, type PipelineBlockVm } from '../lib/pipelineViewModel';
  import { getBlockId, getStepByBlockId } from '../lib/pipelineUiIds';
  import { reorderPipeline, reorderFilterNamesInStep, reorderFiltersWithDisabled } from '../lib/pipelineReorder';
  import {
    commitPipelineConfigChange,
    setPipelineUploadStatusCallback,
    type PipelineUploadStatus,
  } from '../state/pipelineEditor';
import {
  setBiquadFreq,
  setBiquadQ,
  setBiquadGain,
  disableFilter,
  enableFilter,
  removeFilterFromStep,
  removeFilterDefinitionIfOrphaned,
} from '../lib/pipelineFilterEdit';
import { getDisabledFilterLocation, getStepKey, markFilterDisabled, remapDisabledFiltersAfterPipelineReorder } from '../lib/disabledFiltersOverlay';
  import FilterBlock from '../components/pipeline/FilterBlock.svelte';
  import MixerBlock from '../components/pipeline/MixerBlock.svelte';
  import ProcessorBlock from '../components/pipeline/ProcessorBlock.svelte';

  // Reactive pipeline blocks (with stable IDs)
  $: blocks = $dspConfig ? buildPipelineViewModel($dspConfig, getBlockId) : [];
  $: isConnected = $connectionState === 'connected' || $connectionState === 'degraded';

  // Selection state
  type Selection = { kind: 'block'; blockId: string } | null;
  let selection: Selection = null;

  // Expanded filter state (per blockId)
  let expandedFiltersByBlock: Map<string, Set<string>> = new Map();
  
  // Reactive: Get expanded filters for currently selected block
  $: selectedBlockExpandedFilters = selection?.kind === 'block' 
    ? (expandedFiltersByBlock.get(selection.blockId) || new Set<string>())
    : new Set<string>();

  // Upload status
  let uploadStatus: PipelineUploadStatus = { state: 'idle' };

  // Drag state
  interface DragState {
    blockId: string;
    fromIndex: number;
    startY: number;
    currentY: number;
  }
  let dragState: DragState | null = null;
  let landingZoneIndex: number | null = null;
  let preDragConfigSnapshot: any = null;

  // Inline error state
  let validationError: string | null = null;

  // Movement threshold (px)
  const DRAG_THRESHOLD = 6;

  // Setup upload status callback
  onMount(() => {
    setPipelineUploadStatusCallback((status) => {
      uploadStatus = status;
    });
  });

  onDestroy(() => {
    setPipelineUploadStatusCallback(() => {});
  });

  // Selection handlers
  function selectBlock(blockId: string) {
    selection = { kind: 'block', blockId };
  }

  function deselectAll() {
    selection = null;
  }

  function handlePageBackgroundClick(event: MouseEvent) {
    const target = event.target as Element;
    if (target.classList.contains('pipeline-page') || target.classList.contains('pipeline-container')) {
      deselectAll();
    }
  }

  // Block drag handlers
  function handleBlockGrabPointerDown(event: PointerEvent, block: PipelineBlockVm) {
    event.preventDefault();
    event.stopPropagation();

    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);

    // Record start position (no drag yet until threshold exceeded)
    dragState = {
      blockId: block.blockId,
      fromIndex: block.stepIndex,
      startY: event.clientY,
      currentY: event.clientY,
    };

    // Select block on grab
    selectBlock(block.blockId);
  }

  function handleBlockGrabPointerMove(event: PointerEvent) {
    if (!dragState) return;

    const deltaY = event.clientY - dragState.startY;

    // Check if we've exceeded threshold to start dragging
    if (Math.abs(deltaY) < DRAG_THRESHOLD && landingZoneIndex === null) {
      return; // Not dragging yet
    }

    // Start dragging (take snapshot on first move past threshold)
    if (landingZoneIndex === null && !preDragConfigSnapshot && $dspConfig) {
      preDragConfigSnapshot = JSON.parse(JSON.stringify($dspConfig));
    }

    // Update current Y for visual feedback
    dragState.currentY = event.clientY;

    // Compute landing zone index based on pointer position
    // TODO: Implement proper hit-testing with hysteresis
    const containerElement = document.querySelector('.pipeline-blocks');
    if (!containerElement) return;

    const blockElements = Array.from(containerElement.querySelectorAll('.pipeline-block'));
    let newLandingIndex = dragState.fromIndex;

    for (let i = 0; i < blockElements.length; i++) {
      const el = blockElements[i] as HTMLElement;
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;

      if (event.clientY < midY) {
        newLandingIndex = i;
        break;
      } else if (i === blockElements.length - 1) {
        newLandingIndex = i + 1;
      }
    }

    // Clamp to valid range
    landingZoneIndex = Math.max(0, Math.min(blocks.length, newLandingIndex));
  }

  function handleBlockGrabPointerUp(event: PointerEvent) {
    if (!dragState) return;

    const target = event.currentTarget as HTMLElement;
    target.releasePointerCapture(event.pointerId);

    // Check if we actually dragged (moved past threshold)
    const didDrag = landingZoneIndex !== null;

    if (didDrag && landingZoneIndex !== dragState.fromIndex) {
      // Commit reorder
      commitReorder();
    }

    // Clean up drag state
    dragState = null;
    landingZoneIndex = null;
    preDragConfigSnapshot = null;
  }

  function commitReorder() {
    if (!$dspConfig || landingZoneIndex === null || !dragState) return;

    // Clear any previous error
    validationError = null;

    try {
      // Remap disabled filters overlay to follow reordered steps
      remapDisabledFiltersAfterPipelineReorder(dragState.fromIndex, landingZoneIndex);
      
      // Apply reorder
      const updatedConfig = reorderPipeline($dspConfig, dragState.fromIndex, landingZoneIndex);

      // Trigger debounced upload (will validate internally)
      commitPipelineConfigChange(updatedConfig);
    } catch (error) {
      console.error('Reorder error:', error);
      validationError = error instanceof Error ? error.message : 'Reorder failed';

      // Revert to snapshot
      if (preDragConfigSnapshot) {
        // Note: In a real implementation, we'd need to trigger a config update
        // For now, just show the error
      }
    }
  }

  // MVP-21: Filter parameter update handler
  function handleFilterParamUpdate(event: CustomEvent<{ filterName: string; param: 'freq' | 'q' | 'gain'; value: number }>) {
    const { filterName, param, value } = event.detail;

    if (!$dspConfig) return;

    // Clear any previous error
    validationError = null;

    // Take snapshot for potential revert
    const snapshot = JSON.parse(JSON.stringify($dspConfig));

    try {
      // Apply parameter update
      let updatedConfig = $dspConfig;
      if (param === 'freq') {
        updatedConfig = setBiquadFreq(updatedConfig, filterName, value);
      } else if (param === 'q') {
        updatedConfig = setBiquadQ(updatedConfig, filterName, value);
      } else if (param === 'gain') {
        updatedConfig = setBiquadGain(updatedConfig, filterName, value);
      }

      // Validate
      const dspInstance = getDspInstance();
      if (dspInstance) {
        dspInstance.config = updatedConfig;
        if (!dspInstance.validateConfig()) {
          throw new Error('Invalid configuration after parameter update');
        }
      }

      // Optimistically update UI
      updateConfig(updatedConfig);

      // Trigger debounced upload
      commitPipelineConfigChange(updatedConfig);
    } catch (error) {
      console.error('Filter parameter update error:', error);
      validationError = error instanceof Error ? error.message : 'Parameter update failed';

      // Revert to snapshot
      updateConfig(snapshot);
    }
  }

  // MVP-21: Filter enable handler
  function handleFilterEnable(event: CustomEvent<{ blockId: string; filterName: string }>) {
    const { filterName, blockId } = event.detail;

    if (!$dspConfig) return;

    // Clear any previous error
    validationError = null;

    // Take snapshot for potential revert
    const snapshot = JSON.parse(JSON.stringify($dspConfig));

    try {
      // Get original location from overlay
      const location = getDisabledFilterLocation(filterName);
      if (!location) {
        throw new Error(`Filter "${filterName}" not found in disabled overlay`);
      }

      // Find step index by searching for matching stepKey
      // (stepKey is derived from channels + original index, we need to find current index)
      const stepObj = getStepByBlockId(blockId);
      if (!stepObj) {
        throw new Error('Pipeline step not found');
      }

      const stepIndex = $dspConfig.pipeline.indexOf(stepObj as any);
      if (stepIndex === -1) {
        throw new Error('Pipeline step not found in config');
      }

      // Re-enable filter at original position
      const updatedConfig = enableFilter($dspConfig, stepIndex, filterName, location.index);

      // Validate
      const dspInstance = getDspInstance();
      if (dspInstance) {
        dspInstance.config = updatedConfig;
        if (!dspInstance.validateConfig()) {
          throw new Error('Invalid configuration after enable');
        }
      }

      // Optimistically update UI
      updateConfig(updatedConfig);

      // Trigger debounced upload
      commitPipelineConfigChange(updatedConfig);
    } catch (error) {
      console.error('Filter enable error:', error);
      validationError = error instanceof Error ? error.message : 'Enable failed';

      // Revert to snapshot
      updateConfig(snapshot);
    }
  }

  // MVP-21: Filter disable handler
  function handleFilterDisable(event: CustomEvent<{ blockId: string; filterName: string }>) {
    const { filterName, blockId } = event.detail;

    if (!$dspConfig) return;

    // Clear any previous error
    validationError = null;

    // Take snapshot for potential revert
    const snapshot = JSON.parse(JSON.stringify($dspConfig));

    try {
      // Find step index by blockId
      const stepObj = getStepByBlockId(blockId);
      if (!stepObj) {
        throw new Error('Pipeline step not found');
      }

      const stepIndex = $dspConfig.pipeline.indexOf(stepObj as any);
      if (stepIndex === -1) {
        throw new Error('Pipeline step not found in config');
      }

      // Disable filter (removes from names[], marks in overlay)
      const updatedConfig = disableFilter($dspConfig, stepIndex, filterName);

      // Validate
      const dspInstance = getDspInstance();
      if (dspInstance) {
        dspInstance.config = updatedConfig;
        if (!dspInstance.validateConfig()) {
          throw new Error('Invalid configuration after disable');
        }
      }

      // Optimistically update UI
      updateConfig(updatedConfig);

      // Trigger debounced upload
      commitPipelineConfigChange(updatedConfig);
    } catch (error) {
      console.error('Filter disable error:', error);
      validationError = error instanceof Error ? error.message : 'Disable failed';

      // Revert to snapshot
      updateConfig(snapshot);
    }
  }

  // MVP-21: Toggle filter expanded state
  function handleToggleFilterExpanded(event: CustomEvent<{ blockId: string; filterName: string }>) {
    const { blockId, filterName } = event.detail;
    
    // Get or create set for this block
    let filtersSet = expandedFiltersByBlock.get(blockId);
    if (!filtersSet) {
      filtersSet = new Set();
      expandedFiltersByBlock.set(blockId, filtersSet);
    }
    
    // Toggle the filter
    if (filtersSet.has(filterName)) {
      filtersSet.delete(filterName);
    } else {
      filtersSet.add(filterName);
    }
    
    // Trigger reactivity
    expandedFiltersByBlock = expandedFiltersByBlock;
  }

  // MVP-21: Filter removal handler
  function handleFilterRemove(event: CustomEvent<{ filterName: string; blockId: string }>) {
    const { filterName, blockId } = event.detail;

    if (!$dspConfig) return;

    // Clear any previous error
    validationError = null;

    // Take snapshot for potential revert
    const snapshot = JSON.parse(JSON.stringify($dspConfig));

    try {
      // Find actual pipeline step index by blockId
      const stepObj = getStepByBlockId(blockId);
      if (!stepObj) {
        throw new Error('Pipeline step not found');
      }

      const stepIndex = $dspConfig.pipeline.indexOf(stepObj as any);
      if (stepIndex === -1) {
        throw new Error('Pipeline step not found in config');
      }

      // Remove filter from step
      let updatedConfig = removeFilterFromStep($dspConfig, stepIndex, filterName);
      
      // Remove filter definition if orphaned
      updatedConfig = removeFilterDefinitionIfOrphaned(updatedConfig, filterName);

      // Validate
      const dspInstance = getDspInstance();
      if (dspInstance) {
        dspInstance.config = updatedConfig;
        if (!dspInstance.validateConfig()) {
          throw new Error('Invalid configuration after filter removal');
        }
      }

      // Optimistically update UI
      updateConfig(updatedConfig);

      // Trigger debounced upload
      commitPipelineConfigChange(updatedConfig);
    } catch (error) {
      console.error('Filter removal error:', error);
      validationError = error instanceof Error ? error.message : 'Filter removal failed';

      // Revert to snapshot
      updateConfig(snapshot);
    }
  }

  // Filter-name reorder handler (from FilterBlock event)
  function handleFilterNameReorder(event: CustomEvent<{ blockId: string; fromIndex: number; toIndex: number }>) {
    const { blockId, fromIndex, toIndex } = event.detail;

    if (!$dspConfig) return;

    // Clear any previous error
    validationError = null;

    // Take snapshot for potential revert
    const snapshot = JSON.parse(JSON.stringify($dspConfig));

    try {
      // Find actual pipeline step index by blockId
      const stepObj = getStepByBlockId(blockId);
      if (!stepObj) {
        throw new Error('Pipeline step not found');
      }

      const stepIndex = $dspConfig.pipeline.indexOf(stepObj as any);
      if (stepIndex === -1) {
        throw new Error('Pipeline step not found in config');
      }

      // Find the FilterBlockVm for this blockId to get the full filter list
      const block = blocks.find(b => b.blockId === blockId);
      if (!block || block.kind !== 'filter') {
        throw new Error('Filter block not found');
      }

      // Convert FilterInfo[] to FilterItem[] for reordering
      const filterItems = block.filters.map(f => ({
        name: f.name,
        disabled: f.disabled,
      }));

      // Apply reorder using the new helper
      const reorderResult = reorderFiltersWithDisabled(filterItems, fromIndex, toIndex);

      // Update config with new enabled names order
      const updatedConfig = JSON.parse(JSON.stringify($dspConfig)) as typeof $dspConfig;
      const step = updatedConfig.pipeline[stepIndex];
      if (step.type === 'Filter') {
        (step as any).names = reorderResult.enabledNames;
      }

      // Update disabled filter indices in localStorage overlay
      const channels = (stepObj as any).channels || [];
      const stepKey = getStepKey(channels, stepIndex);
      for (const [filterName, newIndex] of Object.entries(reorderResult.disabledIndices)) {
        markFilterDisabled(filterName, stepKey, newIndex);
      }

      // Validate
      const dspInstance = getDspInstance();
      if (dspInstance) {
        dspInstance.config = updatedConfig;
        if (!dspInstance.validateConfig()) {
          throw new Error('Invalid configuration after reorder');
        }
      }

      // Optimistically update UI
      updateConfig(updatedConfig);

      // Trigger debounced upload
      commitPipelineConfigChange(updatedConfig);
    } catch (error) {
      console.error('Filter name reorder error:', error);
      validationError = error instanceof Error ? error.message : 'Filter reorder failed';

      // Revert to snapshot
      updateConfig(snapshot);
    }
  }
</script>

<div class="pipeline-page">
  <div class="page-header">
    <h1>Pipeline Editor</h1>
    <p>Visual representation of the CamillaDSP audio processing pipeline</p>
  </div>

  {#if !isConnected}
    <div class="empty-state">
      <div class="empty-icon">🔌</div>
      <h2>Not Connected</h2>
      <p>Connect to CamillaDSP to view the pipeline configuration</p>
    </div>
  {:else if !$dspConfig}
    <div class="empty-state">
      <div class="empty-icon">⏳</div>
      <h2>Loading Configuration</h2>
      <p>Fetching pipeline data from CamillaDSP...</p>
    </div>
  {:else if blocks.length === 0}
    <div class="empty-state">
      <div class="empty-icon">📋</div>
      <h2>Empty Pipeline</h2>
      <p>No processing steps configured</p>
    </div>
  {:else}
    <div class="pipeline-container">
      <!-- Input indicator -->
      <div class="flow-indicator input-indicator">
        <span class="flow-label">INPUT</span>
        <div class="flow-arrow">↓</div>
      </div>

      <!-- Pipeline blocks -->
      <div class="pipeline-blocks" on:click={handlePageBackgroundClick}>
        {#each blocks as block, i (block.blockId)}
          <!-- Block wrapper with selection state -->
          <div
            class="block-wrapper"
            class:selected={selection?.kind === 'block' && selection.blockId === block.blockId}
            class:dragging={dragState?.blockId === block.blockId}
            on:click={() => selectBlock(block.blockId)}
          >
            <!-- Grab handle -->
            <button
              class="grab-handle"
              on:pointerdown={(e) => handleBlockGrabPointerDown(e, block)}
              on:pointermove={handleBlockGrabPointerMove}
              on:pointerup={handleBlockGrabPointerUp}
              title="Drag to reorder"
            >
              ☰
            </button>

            <!-- Block content -->
            {#if block.kind === 'filter'}
              <FilterBlock 
                {block} 
                expanded={selection?.kind === 'block' && selection.blockId === block.blockId}
                expandedFilters={selectedBlockExpandedFilters}
                on:reorderName={handleFilterNameReorder}
                on:updateFilterParam={handleFilterParamUpdate}
                on:enableFilter={handleFilterEnable}
                on:disableFilter={handleFilterDisable}
                on:toggleFilterExpanded={handleToggleFilterExpanded}
                on:removeFilter={(e) => handleFilterRemove({ ...e, detail: { ...e.detail, blockId: block.blockId } })}
              />
            {:else if block.kind === 'mixer'}
              <MixerBlock {block} />
            {:else if block.kind === 'processor'}
              <ProcessorBlock {block} />
            {/if}
          </div>

          <!-- Landing zone (shown during drag) -->
          {#if landingZoneIndex === i}
            <div class="landing-zone">Drop here</div>
          {/if}

          <!-- Connector arrow between blocks -->
          {#if i < blocks.length - 1 && landingZoneIndex !== i + 1}
            <div class="flow-connector">
              <div class="flow-line"></div>
              <div class="flow-arrow">↓</div>
            </div>
          {/if}
        {/each}

        <!-- Final landing zone (at end) -->
        {#if landingZoneIndex === blocks.length}
          <div class="landing-zone">Drop here</div>
        {/if}
      </div>

      <!-- Output indicator -->
      <div class="flow-indicator output-indicator">
        <div class="flow-arrow">↓</div>
        <span class="flow-label">OUTPUT</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .pipeline-page {
    max-width: 720px;
    margin: 1rem auto;
    padding: 0 1rem;
  }

  .page-header {
    margin-bottom: 2rem;
  }

  h1 {
    font-size: 1.75rem;
    margin-bottom: 0.5rem;
    color: var(--ui-text);
  }

  p {
    color: var(--ui-text-muted);
    margin: 0;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    text-align: center;
  }

  .empty-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .empty-state h2 {
    font-size: 1.25rem;
    color: var(--ui-text);
    margin-bottom: 0.5rem;
  }

  .empty-state p {
    font-size: 0.9375rem;
    color: var(--ui-text-muted);
  }

  .pipeline-container {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .flow-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1rem 0;
  }

  .flow-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--ui-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .flow-arrow {
    font-size: 1.5rem;
    color: var(--ui-text-dim);
    line-height: 1;
  }

  .input-indicator {
    padding-top: 0;
  }

  .output-indicator {
    padding-bottom: 0;
  }

  .pipeline-blocks {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .flow-connector {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.5rem 0;
  }

  .flow-line {
    width: 2px;
    height: 1rem;
    background: var(--ui-border);
  }

  .flow-connector .flow-arrow {
    font-size: 1.25rem;
    color: var(--ui-text-dim);
    line-height: 1;
  }

  .block-wrapper {
    position: relative;
    display: flex;
    align-items: stretch;
    gap: 0.5rem;
    transition: all 0.15s ease;
  }

  /* Ensure child blocks stretch to fill available width */
  .block-wrapper :global(.pipeline-block) {
    flex: 1;
    min-width: 0;
  }

  .block-wrapper.selected {
    outline: 2px solid rgba(74, 158, 255, 0.5);
    outline-offset: 2px;
    border-radius: 8px;
  }

  .block-wrapper.dragging {
    opacity: 0.5;
  }

  .grab-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    flex-shrink: 0;
    background: var(--ui-panel);
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    color: var(--ui-text-muted);
    font-size: 1.25rem;
    cursor: grab;
    transition: all 0.15s ease;
    padding: 0;
  }

  .grab-handle:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.2);
    color: var(--ui-text);
  }

  .grab-handle:active {
    cursor: grabbing;
  }

  .landing-zone {
    height: 60px;
    margin: 0.5rem 0;
    border: 2px dashed rgba(74, 158, 255, 0.5);
    border-radius: 8px;
    background: rgba(74, 158, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(74, 158, 255, 0.8);
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
</style>
