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
  insertPipelineStep,
  removePipelineStep,
  createNewFilterStep,
  createNewMixerBlock,
  createNewProcessorBlock,
  cleanupOrphanDefinitions,
  setPipelineStepBypassed,
  setFilterStepChannels,
  getAvailableChannels,
} from '../lib/pipelineBlockEdit';
import {
  setBiquadFreq,
  setBiquadQ,
  setBiquadGain,
  disableFilter,
  enableFilter,
  removeFilterFromStep,
  removeFilterDefinitionIfOrphaned,
  addNewBiquadFilterToStep,
} from '../lib/pipelineFilterEdit';
import {
  setMixerSourceGain,
  toggleMixerSourceMute,
  toggleMixerSourceInverted,
  setMixerDestMute,
  addMixerSource,
  removeMixerSource,
} from '../lib/pipelineMixerEdit';
import {
  setProcessorStepBypassed,
  setCompressorParam,
  setNoiseGateParam,
} from '../lib/pipelineProcessorEdit';
import { validateMixerRouting, type MixerValidationResult } from '../lib/mixerRoutingValidation';
import type { CamillaDSPConfig } from '../lib/camillaDSP';
import { getDisabledFilterLocations, getStepKey, markFilterDisabled, remapDisabledFiltersAfterPipelineReorder, removeDisabledLocationsForStep, remapDisabledFiltersAfterFilterStepChannelsChange } from '../lib/disabledFiltersOverlay';
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
      // Find step index by blockId
      const stepObj = getStepByBlockId(blockId);
      if (!stepObj) {
        throw new Error('Pipeline step not found');
      }

      const stepIndex = $dspConfig.pipeline.indexOf(stepObj as any);
      if (stepIndex === -1) {
        throw new Error('Pipeline step not found in config');
      }

      // Get step-specific location from overlay (per-block behavior)
      const channels = (stepObj as any).channels || [];
      const stepKey = getStepKey(channels, stepIndex);
      const locations = getDisabledFilterLocations(filterName);
      const location = locations.find(loc => loc.stepKey === stepKey);
      
      if (!location) {
        throw new Error(`Filter "${filterName}" not found in disabled overlay for this step`);
      }

      // Re-enable filter at original position in THIS step only
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

  // MVP-22: Mixer edit handlers
  function handleMixerEdit(mixerName: string, mutationFn: (config: CamillaDSPConfig) => CamillaDSPConfig) {
    if (!$dspConfig) return;

    // Clear any previous error
    validationError = null;

    // Take snapshot for potential revert
    const snapshot = JSON.parse(JSON.stringify($dspConfig)) as CamillaDSPConfig;

    try {
      // Apply mutation
      const updatedConfig = mutationFn($dspConfig);

      // Validate mixer routing
      const mixer = updatedConfig.mixers[mixerName];
      if (mixer) {
        const mixerValidation = validateMixerRouting(mixer);
        if (!mixerValidation.valid) {
          // Extract error messages
          const errors = mixerValidation.perDest.flatMap(d => d.errors).filter(Boolean);
          throw new Error(`Mixer routing error: ${errors.join('; ')}`);
        }
      }

      // Validate config
      const dspInstance = getDspInstance();
      if (dspInstance) {
        dspInstance.config = updatedConfig;
        if (!dspInstance.validateConfig()) {
          throw new Error('Invalid configuration after mixer edit');
        }
      }

      // Optimistically update UI
      updateConfig(updatedConfig);

      // Trigger debounced upload
      commitPipelineConfigChange(updatedConfig);
    } catch (error) {
      console.error('Mixer edit error:', error);
      validationError = error instanceof Error ? error.message : 'Mixer edit failed';

      // Revert to snapshot
      updateConfig(snapshot);
    }
  }

  function handleMixerSetGain(event: CustomEvent<{ destIndex: number; sourceIndex: number; gain: number }>) {
    if (!selection || selection.kind !== 'block') return;
    const block = blocks.find(b => b.blockId === selection.blockId && b.kind === 'mixer');
    if (!block || block.kind !== 'mixer') return;

    const { destIndex, sourceIndex, gain } = event.detail;
    handleMixerEdit(block.name, (config) => 
      setMixerSourceGain(config, block.name, destIndex, sourceIndex, gain)
    );
  }

  function handleMixerToggleSourceMute(event: CustomEvent<{ destIndex: number; sourceIndex: number }>) {
    if (!selection || selection.kind !== 'block') return;
    const block = blocks.find(b => b.blockId === selection.blockId && b.kind === 'mixer');
    if (!block || block.kind !== 'mixer') return;

    const { destIndex, sourceIndex } = event.detail;
    handleMixerEdit(block.name, (config) => 
      toggleMixerSourceMute(config, block.name, destIndex, sourceIndex)
    );
  }

  function handleMixerToggleSourceInvert(event: CustomEvent<{ destIndex: number; sourceIndex: number }>) {
    if (!selection || selection.kind !== 'block') return;
    const block = blocks.find(b => b.blockId === selection.blockId && b.kind === 'mixer');
    if (!block || block.kind !== 'mixer') return;

    const { destIndex, sourceIndex } = event.detail;
    handleMixerEdit(block.name, (config) => 
      toggleMixerSourceInverted(config, block.name, destIndex, sourceIndex)
    );
  }

  function handleMixerSetDestMute(event: CustomEvent<{ destIndex: number; mute: boolean }>) {
    if (!selection || selection.kind !== 'block') return;
    const block = blocks.find(b => b.blockId === selection.blockId && b.kind === 'mixer');
    if (!block || block.kind !== 'mixer') return;

    const { destIndex, mute } = event.detail;
    handleMixerEdit(block.name, (config) => 
      setMixerDestMute(config, block.name, destIndex, mute)
    );
  }

  function handleMixerAddSource(event: CustomEvent<{ destIndex: number; channel: number }>) {
    if (!selection || selection.kind !== 'block') return;
    const block = blocks.find(b => b.blockId === selection.blockId && b.kind === 'mixer');
    if (!block || block.kind !== 'mixer') return;

    const { destIndex, channel } = event.detail;
    handleMixerEdit(block.name, (config) => 
      addMixerSource(config, block.name, destIndex, channel)
    );
  }

  function handleMixerRemoveSource(event: CustomEvent<{ destIndex: number; sourceIndex: number }>) {
    if (!selection || selection.kind !== 'block') return;
    const block = blocks.find(b => b.blockId === selection.blockId && b.kind === 'mixer');
    if (!block || block.kind !== 'mixer') return;

    const { destIndex, sourceIndex } = event.detail;
    handleMixerEdit(block.name, (config) => 
      removeMixerSource(config, block.name, destIndex, sourceIndex)
    );
  }

  // Compute mixer validation results for selected mixer block
  $: selectedMixerValidation = (() => {
    if (!selection || selection.kind !== 'block' || !$dspConfig) return null;
    const block = blocks.find(b => b.blockId === selection.blockId);
    if (!block || block.kind !== 'mixer') return null;
    const mixer = $dspConfig.mixers[block.name];
    if (!mixer) return null;
    return validateMixerRouting(mixer);
  })();

  // MVP-24: Processor parameter update handler
  function handleProcessorParamUpdate(event: CustomEvent<{ processorName: string; param: string; value: number }>) {
    const { processorName, param, value } = event.detail;

    if (!$dspConfig) return;

    // Clear any previous error
    validationError = null;

    // Take snapshot for potential revert
    const snapshot = JSON.parse(JSON.stringify($dspConfig));

    try {
      // Determine processor type
      const processor = $dspConfig.processors?.[processorName];
      if (!processor) {
        throw new Error(`Processor "${processorName}" not found`);
      }

      // Apply parameter update based on processor type
      let updatedConfig = $dspConfig;
      if (processor.type === 'Compressor') {
        updatedConfig = setCompressorParam(updatedConfig, processorName, param as any, value);
      } else if (processor.type === 'NoiseGate') {
        updatedConfig = setNoiseGateParam(updatedConfig, processorName, param as any, value);
      } else {
        throw new Error(`Unsupported processor type: ${processor.type}`);
      }

      // Validate
      const dspInstance = getDspInstance();
      if (dspInstance) {
        dspInstance.config = updatedConfig;
        if (!dspInstance.validateConfig()) {
          throw new Error('Invalid configuration after processor parameter update');
        }
      }

      // Optimistically update UI
      updateConfig(updatedConfig);

      // Trigger debounced upload
      commitPipelineConfigChange(updatedConfig);
    } catch (error) {
      console.error('Processor parameter update error:', error);
      validationError = error instanceof Error ? error.message : 'Processor parameter update failed';

      // Revert to snapshot
      updateConfig(snapshot);
    }
  }

  // MVP-24: Processor bypass toggle handler
  function handleSetProcessorBypassed(event: CustomEvent<{ blockId: string; bypassed: boolean }>) {
    const { blockId, bypassed } = event.detail;

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

      // Apply bypass state change
      const updatedConfig = setProcessorStepBypassed($dspConfig, stepIndex, bypassed);

      // Validate
      const dspInstance = getDspInstance();
      if (dspInstance) {
        dspInstance.config = updatedConfig;
        if (!dspInstance.validateConfig()) {
          throw new Error('Invalid configuration after processor bypass toggle');
        }
      }

      // Optimistically update UI
      updateConfig(updatedConfig);

      // Trigger debounced upload
      commitPipelineConfigChange(updatedConfig);
    } catch (error) {
      console.error('Processor bypass toggle error:', error);
      validationError = error instanceof Error ? error.message : 'Processor bypass toggle failed';

      // Revert to snapshot
      updateConfig(snapshot);
    }
  }

  // MVP-23: Add/remove block handlers
  function handleAddFilterBlock() {
    if (!$dspConfig) return;
    
    // MVP-27: Prompt for channels
    const channelsInput = window.prompt('Channels (comma-separated):', '0');
    if (channelsInput === null) return; // User cancelled
    
    validationError = null;
    const snapshot = JSON.parse(JSON.stringify($dspConfig));
    
    try {
      // Parse and validate channels
      const availableChannels = getAvailableChannels($dspConfig);
      const requestedChannels = channelsInput
        .split(',')
        .map(ch => parseInt(ch.trim(), 10))
        .filter(ch => !isNaN(ch));
      
      if (requestedChannels.length === 0) {
        throw new Error('No valid channels specified');
      }
      
      // Check all channels are available
      for (const ch of requestedChannels) {
        if (!availableChannels.includes(ch)) {
          throw new Error(`Channel ${ch} is not available`);
        }
      }
      
      const newStep = createNewFilterStep($dspConfig, requestedChannels);
      const insertIndex = selection?.kind === 'block' 
        ? blocks.findIndex(b => b.blockId === selection.blockId) + 1 
        : blocks.length;
      const updatedConfig = insertPipelineStep($dspConfig, insertIndex, newStep);
      
      const dspInstance = getDspInstance();
      if (dspInstance) {
        dspInstance.config = updatedConfig;
        if (!dspInstance.validateConfig()) {
          throw new Error('Invalid configuration after adding filter block');
        }
      }
      
      updateConfig(updatedConfig);
      commitPipelineConfigChange(updatedConfig);
    } catch (error) {
      console.error('Add filter block error:', error);
      validationError = error instanceof Error ? error.message : 'Failed to add filter block';
      updateConfig(snapshot);
    }
  }

  function handleAddMixerBlock() {
    if (!$dspConfig) return;
    validationError = null;
    const snapshot = JSON.parse(JSON.stringify($dspConfig));
    
    try {
      const { mixerName, mixerDef, step } = createNewMixerBlock($dspConfig);
      const insertIndex = selection?.kind === 'block'
        ? blocks.findIndex(b => b.blockId === selection.blockId) + 1
        : blocks.length;
      
      let updatedConfig = JSON.parse(JSON.stringify($dspConfig)) as typeof $dspConfig;
      updatedConfig.mixers[mixerName] = mixerDef;
      updatedConfig = insertPipelineStep(updatedConfig, insertIndex, step);
      
      const dspInstance = getDspInstance();
      if (dspInstance) {
        dspInstance.config = updatedConfig;
        if (!dspInstance.validateConfig()) {
          throw new Error('Invalid configuration after adding mixer block');
        }
      }
      
      updateConfig(updatedConfig);
      commitPipelineConfigChange(updatedConfig);
    } catch (error) {
      console.error('Add mixer block error:', error);
      validationError = error instanceof Error ? error.message : 'Failed to add mixer block';
      updateConfig(snapshot);
    }
  }

  function handleAddProcessorBlock() {
    if (!$dspConfig) return;
    
    // Prompt for processor name
    const baseName = window.prompt('Enter processor name:', 'processor');
    if (!baseName) return; // User cancelled
    
    validationError = null;
    const snapshot = JSON.parse(JSON.stringify($dspConfig));
    
    try {
      const { processorName, processorDef, step } = createNewProcessorBlock($dspConfig, 'Processor', baseName);
      const insertIndex = selection?.kind === 'block'
        ? blocks.findIndex(b => b.blockId === selection.blockId) + 1
        : blocks.length;
      
      let updatedConfig = JSON.parse(JSON.stringify($dspConfig)) as typeof $dspConfig;
      if (!updatedConfig.processors) {
        updatedConfig.processors = {};
      }
      updatedConfig.processors[processorName] = processorDef;
      updatedConfig = insertPipelineStep(updatedConfig, insertIndex, step);
      
      const dspInstance = getDspInstance();
      if (dspInstance) {
        dspInstance.config = updatedConfig;
        if (!dspInstance.validateConfig()) {
          throw new Error('Invalid configuration after adding processor block');
        }
      }
      
      updateConfig(updatedConfig);
      commitPipelineConfigChange(updatedConfig);
    } catch (error) {
      console.error('Add processor block error:', error);
      validationError = error instanceof Error ? error.message : 'Failed to add processor block';
      updateConfig(snapshot);
    }
  }

  function handleRemoveBlock() {
    if (!selection || selection.kind !== 'block' || !$dspConfig) return;
    validationError = null;
    const snapshot = JSON.parse(JSON.stringify($dspConfig));
    
    try {
      const blockIndex = blocks.findIndex(b => b.blockId === selection.blockId);
      if (blockIndex === -1) throw new Error('Block not found');
      
      // If removing a Filter block, cleanup its disabled filter overlay state
      const block = blocks[blockIndex];
      if (block.kind === 'filter') {
        const stepObj = getStepByBlockId(block.blockId);
        if (stepObj) {
          const channels = (stepObj as any).channels || [];
          const stepKey = getStepKey(channels, blockIndex);
          removeDisabledLocationsForStep(stepKey);
        }
      }
      
      let updatedConfig = removePipelineStep($dspConfig, blockIndex);
      updatedConfig = cleanupOrphanDefinitions(updatedConfig);
      
      const dspInstance = getDspInstance();
      if (dspInstance) {
        dspInstance.config = updatedConfig;
        if (!dspInstance.validateConfig()) {
          throw new Error('Invalid configuration after removing block');
        }
      }
      
      updateConfig(updatedConfig);
      commitPipelineConfigChange(updatedConfig);
      deselectAll();
    } catch (error) {
      console.error('Remove block error:', error);
      validationError = error instanceof Error ? error.message : 'Failed to remove block';
      updateConfig(snapshot);
    }
  }

  // MVP-27: Filter block bypass handler
  function handleSetFilterBlockBypassed(event: CustomEvent<{ blockId: string; bypassed: boolean }>) {
    const { blockId, bypassed } = event.detail;

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

      // Apply bypass state change
      const updatedConfig = setPipelineStepBypassed($dspConfig, stepIndex, bypassed);

      // Validate
      const dspInstance = getDspInstance();
      if (dspInstance) {
        dspInstance.config = updatedConfig;
        if (!dspInstance.validateConfig()) {
          throw new Error('Invalid configuration after bypass toggle');
        }
      }

      // Optimistically update UI
      updateConfig(updatedConfig);

      // Trigger debounced upload
      commitPipelineConfigChange(updatedConfig);
    } catch (error) {
      console.error('Filter block bypass toggle error:', error);
      validationError = error instanceof Error ? error.message : 'Bypass toggle failed';

      // Revert to snapshot
      updateConfig(snapshot);
    }
  }

  // MVP-27: Filter block channels handler
  function handleSetFilterBlockChannels(event: CustomEvent<{ blockId: string; channels: number[] }>) {
    const { blockId, channels } = event.detail;

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

      // Compute old and new step keys for disabled filter overlay remapping
      const oldChannels = (stepObj as any).channels || [];
      const oldStepKey = getStepKey(oldChannels, stepIndex);
      const newStepKey = getStepKey(channels, stepIndex);

      // Apply channels change
      const updatedConfig = setFilterStepChannels($dspConfig, stepIndex, channels);

      // Remap disabled filters overlay to follow the channel change
      remapDisabledFiltersAfterFilterStepChannelsChange(oldStepKey, newStepKey);

      // Validate
      const dspInstance = getDspInstance();
      if (dspInstance) {
        dspInstance.config = updatedConfig;
        if (!dspInstance.validateConfig()) {
          throw new Error('Invalid configuration after channels change');
        }
      }

      // Optimistically update UI
      updateConfig(updatedConfig);

      // Trigger debounced upload
      commitPipelineConfigChange(updatedConfig);
    } catch (error) {
      console.error('Filter block channels change error:', error);
      validationError = error instanceof Error ? error.message : 'Channels change failed';

      // Revert to snapshot
      updateConfig(snapshot);
    }
  }

  // MVP-27: Add filter to block handler
  function handleAddFilterToBlock(event: CustomEvent<{ blockId: string; biquadType: string }>) {
    const { blockId, biquadType } = event.detail;

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

      // Add new biquad filter to step
      const result = addNewBiquadFilterToStep($dspConfig, stepIndex, biquadType);

      // Validate
      const dspInstance = getDspInstance();
      if (dspInstance) {
        dspInstance.config = result.config;
        if (!dspInstance.validateConfig()) {
          throw new Error('Invalid configuration after adding filter');
        }
      }

      // Optimistically update UI
      updateConfig(result.config);

      // Trigger debounced upload
      commitPipelineConfigChange(result.config);
    } catch (error) {
      console.error('Add filter to block error:', error);
      validationError = error instanceof Error ? error.message : 'Add filter failed';

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

  {#if validationError}
    <div class="error-banner">
      <span class="error-icon">⚠️</span>
      <span class="error-message">{validationError}</span>
    </div>
  {/if}

  {#if isConnected && $dspConfig}
    <div class="toolbar">
      <button class="toolbar-btn" on:click={handleAddFilterBlock} title="Add Filter Block">
        <span class="btn-icon">+🎚️</span>
        <span class="btn-label">Filter</span>
      </button>
      <button class="toolbar-btn" on:click={handleAddMixerBlock} title="Add Mixer Block">
        <span class="btn-icon">+🔀</span>
        <span class="btn-label">Mixer</span>
      </button>
      <button class="toolbar-btn" on:click={handleAddProcessorBlock} title="Add Processor Block">
        <span class="btn-icon">+⚙️</span>
        <span class="btn-label">Processor</span>
      </button>
      <button 
        class="toolbar-btn remove-btn" 
        on:click={handleRemoveBlock} 
        disabled={!selection}
        title="Remove Selected Block"
      >
        <span class="btn-icon">🗑️</span>
        <span class="btn-label">Remove</span>
      </button>
    </div>
  {/if}

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
                availableChannels={$dspConfig ? getAvailableChannels($dspConfig) : []}
                on:reorderName={handleFilterNameReorder}
                on:updateFilterParam={handleFilterParamUpdate}
                on:enableFilter={handleFilterEnable}
                on:disableFilter={handleFilterDisable}
                on:toggleFilterExpanded={handleToggleFilterExpanded}
                on:removeFilter={(e) => handleFilterRemove({ ...e, detail: { ...e.detail, blockId: block.blockId } })}
                on:setBlockBypassed={handleSetFilterBlockBypassed}
                on:setBlockChannels={handleSetFilterBlockChannels}
                on:addFilter={handleAddFilterToBlock}
              />
            {:else if block.kind === 'mixer'}
              <MixerBlock 
                {block}
                expanded={selection?.kind === 'block' && selection.blockId === block.blockId}
                mixer={$dspConfig?.mixers[block.name] || null}
                validation={selectedMixerValidation}
                on:setGain={handleMixerSetGain}
                on:toggleSourceMute={handleMixerToggleSourceMute}
                on:toggleSourceInvert={handleMixerToggleSourceInvert}
                on:setDestMute={handleMixerSetDestMute}
                on:addSource={handleMixerAddSource}
                on:removeSource={handleMixerRemoveSource}
              />
            {:else if block.kind === 'processor'}
              <ProcessorBlock 
                {block}
                expanded={selection?.kind === 'block' && selection.blockId === block.blockId}
                on:updateProcessorParam={handleProcessorParamUpdate}
                on:setProcessorBypassed={handleSetProcessorBypassed}
              />
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

  .toolbar {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    padding: 0.75rem;
    background: var(--ui-panel);
    border: 1px solid var(--ui-border);
    border-radius: 8px;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    color: var(--ui-text);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toolbar-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .toolbar-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .toolbar-btn.remove-btn {
    margin-left: auto;
    background: rgba(255, 80, 80, 0.1);
    border-color: rgba(255, 80, 80, 0.3);
  }

  .toolbar-btn.remove-btn:hover:not(:disabled) {
    background: rgba(255, 80, 80, 0.2);
    border-color: rgba(255, 80, 80, 0.5);
  }

  .btn-icon {
    font-size: 1rem;
    line-height: 1;
  }

  .btn-label {
    font-weight: 500;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    background: rgba(255, 80, 80, 0.1);
    border: 1px solid rgba(255, 80, 80, 0.3);
    border-radius: 8px;
    color: #ff9999;
    font-size: 0.875rem;
  }

  .error-icon {
    font-size: 1.25rem;
    line-height: 1;
  }

  .error-message {
    flex: 1;
  }
</style>
