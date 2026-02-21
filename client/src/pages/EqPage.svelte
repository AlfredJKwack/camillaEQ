<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { connectionState, dspConfig, getDspInstance } from '../state/dspStore';
  import {
    bands,
    filterNames,
    bandOrderNumbers,
    selectedBandIndex,
    preampGain,
    initializeFromConfig,
  } from '../state/eqStore';
  import { initializeVizOptions, setupVizOptionsPersistence } from './eq/vizOptions/vizOptionsStore';
  import EqLeftPanel from './eq/left/EqLeftPanel.svelte';
  import EqRightPanel from './eq/right/EqRightPanel.svelte';
  import EqOverlays from './eq/EqOverlays.svelte';

  // Track initialization state
  let eqInitialized = false;
  
  // Initialize viz options from localStorage and setup persistence
  let cleanupVizPersistence: (() => void) | null = null;
  
  onMount(() => {
    initializeVizOptions();
    cleanupVizPersistence = setupVizOptionsPersistence();
  });
  
  onDestroy(() => {
    if (cleanupVizPersistence) {
      cleanupVizPersistence();
    }
  });
  
  // Reactive: Initialize EQ when connection becomes available
  // This handles both immediate connection and delayed auto-reconnect
  $: {
    const dsp = getDspInstance();
    const config = $dspConfig;
    
    if (!eqInitialized && dsp && dsp.connected && config && $connectionState === 'connected') {
      // Initialize EQ store from config
      eqInitialized = initializeFromConfig(config);
      
      if (eqInitialized) {
        console.log('EQ store initialized from global DSP config');
      } else {
        console.warn('Failed to initialize EQ store from config');
      }
    }
  }
</script>

<div class="eq-layout">
  <!-- Left: EQ Plot Area -->
  <EqLeftPanel />

  <!-- Right: Band Columns (Scrollable) -->
  <EqRightPanel
    bands={$bands}
    filterNames={$filterNames}
    bandOrderNumbers={$bandOrderNumbers}
    selectedBandIndex={$selectedBandIndex}
    preampGain={$preampGain}
  />
  
  <!-- Overlays: Tooltips, Popovers, Pickers -->
  <EqOverlays />
</div>

<style>
  /* MVP-11: CSS Subgrid Layout */
  .eq-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, clamp(240px, 32vw, 520px));
    grid-template-rows: auto 1fr auto;
    height: 100vh;
    padding: 1rem;
    gap: 1rem;
    box-sizing: border-box;
    min-height: 0;
  }
</style>
