<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { connectionState, getDspInstance } from '../../../state/dspStore';
  import {
    bands,
    bandOrderNumbers,
    selectedBandIndex,
    sumCurvePath,
    perBandCurvePaths,
    setBandFreq,
    setBandGain,
    setBandQ,
    selectBand,
    preampGain,
  } from '../../../state/eqStore';
  import {
    spectrumMode,
    smoothingMode,
    showSTA,
    showLTA,
    showPeak,
    heatmapEnabled,
    heatmapMaskMode,
    heatmapHighPrecision,
    heatmapAlphaGamma,
    heatmapMagnitudeGain,
    heatmapGateThreshold,
    heatmapMaxAlpha,
    showPerBandCurves,
    showBandwidthMarkers,
    bandFillOpacity,
    spectrumVizEnabled,
  } from '../vizOptions/vizOptionsStore';
  import {
    createSpectrumVizController,
    type SpectrumVizController,
  } from '../spectrum/spectrumVizController';
  import EqTokensLayer from '../../../ui/tokens/EqTokensLayer.svelte';
  import { calculateBandwidthMarkers } from '../../../dsp/bandwidthMarkers';
  import {
    generatePeakingFillPath,
    generateShelfTintRect,
    generatePassFilterTint,
    generateBandPassTintRect,
    generateNotchHaloPath,
  } from '../../../ui/rendering/eqFocusViz';
  import { generateBandCurvePath } from '../../../ui/rendering/EqSvgRenderer';
  import {
    freqToX,
    xToFreq,
    gainToY,
    yToGain,
    gainToYPercent,
    generateFrequencyTicks,
  } from '../plot/eqPlotMath';
  
  // MVP-14: Focus mode and active editing state
  let isActivelyEditing = false;
  let editingTimeoutId: number | null = null;
  
  // MVP-16: Spectrum analyzer + rendering
  let canvasElement: HTMLCanvasElement;
  let spectrumController: SpectrumVizController | null = null;
  
  // Token drag state
  let dragState: {
    bandIndex: number;
    startX: number;
    startY: number;
    startFreq: number;
    startGain: number;
    startQ: number;
    shiftKey: boolean;
  } | null = null;
  
  // Track global shift key state for cursor feedback
  let shiftPressed = false;
  
  // Plot dimensions for responsive tokens
  let plotWidth = 1000;
  let plotHeight = 400;
  let plotElement: HTMLDivElement;
  let resizeObserver: ResizeObserver | null = null;
  
  // MVP-30: Heatmap dB range tuning
  const heatmapMinDb = -85;
  const heatmapMaxDb = -10;
  const peakHoldTime = 2.0;
  const peakDecayRate = 12;
  
  // Generate frequency ticks
  const { majors: majorTicks, minors: minorTicks } = generateFrequencyTicks();
  
  // Gain range
  const GAIN_MIN = -24;
  const GAIN_MAX = 24;
  const GAIN_STEP = 6;
  
  const gainTicks: number[] = [];
  for (let g = GAIN_MIN; g <= GAIN_MAX; g += GAIN_STEP) {
    gainTicks.push(g);
  }
  
  const gainLabelTicks = [-18, -12, -6, 0, 6, 12, 18];
  
  // Lifecycle: Initialize spectrum controller
  onMount(() => {
    if (canvasElement) {
      spectrumController = createSpectrumVizController({
        canvas: canvasElement,
        getPlotSize: () => ({ width: plotWidth, height: plotHeight }),
        getDsp: getDspInstance,
        peakHoldTimeSec: peakHoldTime,
        peakDecayRateDbPerSec: peakDecayRate,
        heatmapMinDb,
        heatmapMaxDb,
        staleThresholdMs: 500,
      });
    }
    
    if (plotElement) {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          plotWidth = entry.contentRect.width;
          plotHeight = entry.contentRect.height;
          
          if (spectrumController) {
            spectrumController.resize(plotWidth, plotHeight);
          }
        }
      });
      resizeObserver.observe(plotElement);
    }
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftPressed = true;
      } else if (e.key === 'Escape' && $selectedBandIndex !== null) {
        selectBand(null);
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftPressed = false;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  });
  
  onDestroy(() => {
    if (spectrumController) {
      spectrumController.destroy();
      spectrumController = null;
    }
    
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
  });
  
  // Reactive: Update spectrum controller config
  $: if (spectrumController) {
    spectrumController.setAnalyzerPeakConfig({
      holdTimeSec: peakHoldTime,
      decayRateDbPerSec: peakDecayRate,
    });
  }
  
  $: if (spectrumController) {
    spectrumController.setAnalyzerVisibility({
      showSTA: $showSTA,
      showLTA: $showLTA,
      showPeak: $showPeak,
    });
  }
  
  $: if (spectrumController) {
    spectrumController.setSpectrumMode($spectrumMode);
  }
  
  $: if (spectrumController) {
    spectrumController.setSmoothingMode($smoothingMode);
  }
  
  $: if (spectrumController) {
    spectrumController.setHeatmapConfig({
      enabled: $heatmapEnabled,
      maskMode: $heatmapMaskMode,
      highPrecision: $heatmapHighPrecision,
      alphaGamma: $heatmapAlphaGamma,
      magnitudeGain: $heatmapMagnitudeGain,
      gateThreshold: $heatmapGateThreshold,
      maxAlpha: $heatmapMaxAlpha,
    });
  }
  
  // Reactive: Start/stop spectrum polling based on readiness
  $: {
    const state = $connectionState;
    const dsp = getDspInstance();
    const isReady = state === 'connected' && (dsp?.isSpectrumSocketOpen() ?? false);
    const shouldBeEnabled = $spectrumVizEnabled && isReady;
    
    if (spectrumController) {
      spectrumController.setEnabled(shouldBeEnabled);
    }
  }
  
  // MVP-14: Active editing tracking
  function setActiveEditing() {
    isActivelyEditing = true;
    if (editingTimeoutId !== null) {
      clearTimeout(editingTimeoutId);
    }
    editingTimeoutId = window.setTimeout(() => {
      isActivelyEditing = false;
      editingTimeoutId = null;
    }, 250);
  }
  
  // MVP-14: Deselect band on plot background click
  function handlePlotBackgroundClick(event: MouseEvent) {
    const target = event.target as Element;
    if (target.tagName === 'svg' || target.classList.contains('eq-plot')) {
      selectBand(null);
    }
  }
  
  // Token interaction handlers
  function handleTokenPointerDown(event: PointerEvent, bandIndex: number) {
    const band = $bands[bandIndex];
    if (!band.enabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    
    event.preventDefault();
    event.stopPropagation();
    
    const target = event.currentTarget as SVGElement;
    target.setPointerCapture(event.pointerId);
    
    dragState = {
      bandIndex,
      startX: event.clientX,
      startY: event.clientY,
      startFreq: band.freq,
      startGain: band.gain,
      startQ: band.q,
      shiftKey: event.shiftKey,
    };
    
    selectBand(bandIndex);
    setActiveEditing();
  }
  
  function handleTokenPointerMove(event: PointerEvent) {
    if (!dragState || !plotElement) return;
    
    const band = $bands[dragState.bandIndex];
    const supportsGain = band.type === 'Peaking' || band.type === 'LowShelf' || band.type === 'HighShelf';
    
    const rect = plotElement.getBoundingClientRect();
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    
    if (event.shiftKey) {
      const Q_MIN = 0.1;
      const Q_MAX = 10;
      
      const logMin = Math.log(Q_MIN);
      const logMax = Math.log(Q_MAX);
      const logRange = logMax - logMin;
      const logPerPx = logRange / (window.innerHeight / 2);
      
      const startLogQ = Math.log(Math.max(Q_MIN, Math.min(Q_MAX, dragState.startQ)));
      const newLogQ = startLogQ - deltaY * logPerPx;
      const clampedLogQ = Math.max(logMin, Math.min(logMax, newLogQ));
      const newQ = Math.exp(clampedLogQ);
      
      setBandQ(dragState.bandIndex, newQ);
    } else {
      const pixelToViewBoxX = 1000 / rect.width;
      const deltaViewBoxX = deltaX * pixelToViewBoxX;
      const currentX = freqToX(dragState.startFreq, 1000);
      const newX = currentX + deltaViewBoxX;
      const newFreq = xToFreq(newX, 1000);
      
      setBandFreq(dragState.bandIndex, newFreq);
      
      if (supportsGain) {
        const pixelToViewBoxY = 400 / rect.height;
        const deltaViewBoxY = deltaY * pixelToViewBoxY;
        const currentY = gainToY(dragState.startGain);
        const newY = currentY + deltaViewBoxY;
        const newGain = yToGain(newY);
        
        setBandGain(dragState.bandIndex, newGain);
      }
    }
  }
  
  function handleTokenPointerUp(event: PointerEvent) {
    if (!dragState) return;
    
    const target = event.currentTarget as SVGElement;
    target.releasePointerCapture(event.pointerId);
    dragState = null;
  }
  
  function handleTokenWheel(event: WheelEvent, bandIndex: number) {
    const band = $bands[bandIndex];
    if (!band.enabled) {
      event.preventDefault();
      return;
    }
    
    event.preventDefault();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    setBandQ(bandIndex, band.q + delta);
  }
  
  // Reactive computed values
  $: focusMode = $selectedBandIndex !== null;
  $: selectedBand = $selectedBandIndex !== null ? $bands[$selectedBandIndex] : null;
  
  $: spectrumOpacity = (() => {
    if (!focusMode) return 1.0;
    if (isActivelyEditing || dragState !== null) return 0.4;
    return 0.7;
  })();
  
  $: selectedBandCurvePath = selectedBand ? generateBandCurvePath(selectedBand, {
    width: 1000,
    height: 400,
    numPoints: 128,
  }) : '';
  
  $: focusAreaPath = (() => {
    if (!selectedBand) return '';
    const options = { width: 1000, height: 400 };
    
    if (selectedBand.type === 'Peaking') {
      return generatePeakingFillPath(selectedBand, options);
    } else if (selectedBand.type === 'Notch') {
      return generateNotchHaloPath(selectedBand, options);
    }
    return '';
  })();
  
  $: focusAreaRect = (() => {
    if (!selectedBand) return null;
    const options = { width: 1000, height: 400 };
    
    if (selectedBand.type === 'LowShelf' || selectedBand.type === 'HighShelf') {
      return generateShelfTintRect(selectedBand, options);
    } else if (selectedBand.type === 'LowPass' || selectedBand.type === 'HighPass') {
      return generatePassFilterTint(selectedBand, options);
    } else if (selectedBand.type === 'BandPass') {
      return generateBandPassTintRect(selectedBand, options);
    }
    return null;
  })();
  
  $: bandwidthMarkers = (() => {
    if (!$showBandwidthMarkers || !selectedBand) {
      return { leftFreq: null, rightFreq: null };
    }
    return calculateBandwidthMarkers(selectedBand);
  })();
</script>

<div class="eq-plot-area">
  <div class="eq-plot" bind:this={plotElement} on:click={handlePlotBackgroundClick} on:keydown={() => {}} role="button" tabindex="-1">
    <canvas class="spectrum-canvas" bind:this={canvasElement} style="opacity: {spectrumOpacity}; transition: opacity 0.2s ease;"></canvas>
    
    <svg viewBox="0 0 1000 400" preserveAspectRatio="none">
      <!-- Grid: Horizontal lines -->
      <g class="grid-horizontal">
        {#each gainTicks as gain}
          {#if gain !== 0}
            <line
              x1="0"
              y1={200 - (gain / (GAIN_MAX - GAIN_MIN)) * 400}
              x2="1000"
              y2={200 - (gain / (GAIN_MAX - GAIN_MIN)) * 400}
              stroke="var(--grid-line)"
              stroke-width="1"
            />
          {/if}
        {/each}
      </g>

      <!-- Grid: Vertical lines (minors) -->
      <g class="grid-vertical">
        {#each minorTicks as freq}
          <line
            x1={freqToX(freq, 1000)}
            y1="0"
            x2={freqToX(freq, 1000)}
            y2="400"
            stroke="var(--grid-line)"
            stroke-width="1"
            opacity="0.7"
          />
        {/each}
      </g>

      <!-- Grid: Vertical lines (majors) -->
      <g class="grid-vertical">
        {#each majorTicks as freq}
          <line
            x1={freqToX(freq, 1000)}
            y1="0"
            x2={freqToX(freq, 1000)}
            y2="400"
            stroke="var(--grid-line-major)"
            stroke-width="1"
          />
        {/each}
      </g>

      <!-- Zero line -->
      <g class="zero-line">
        <line
          x1="0"
          y1={gainToY($preampGain)}
          x2="1000"
          y2={gainToY($preampGain)}
          stroke="var(--zero-line)"
          stroke-width="1"
        />
      </g>

      <g class="analyzer"></g>
      
      <!-- Focus mode area-of-effect -->
      {#if focusMode && selectedBand && $selectedBandIndex !== null}
        <g class="focus-area" opacity={$bandFillOpacity}>
          {#if focusAreaPath}
            <path
              d={focusAreaPath}
              fill={`var(--band-${($selectedBandIndex % 10) + 1})`}
              opacity="0.3"
              class="focus-area-path"
            />
          {/if}
          
          {#if focusAreaRect}
            <rect
              x={focusAreaRect.x}
              y={focusAreaRect.y}
              width={focusAreaRect.width}
              height={focusAreaRect.height}
              fill={`var(--band-${($selectedBandIndex % 10) + 1})`}
              opacity="0.2"
              class="focus-area-rect"
            />
          {/if}
          
          {#if selectedBand.type === 'Notch' && focusAreaPath}
            <path
              d={focusAreaPath}
              fill="none"
              stroke={`var(--band-${($selectedBandIndex % 10) + 1})`}
              stroke-width="8"
              opacity="0.25"
              class="focus-notch-halo"
            />
          {/if}
        </g>
      {/if}

      <!-- Curves: Per-band -->
      {#if $showPerBandCurves && !focusMode}
        <g class="curves-per-band">
          {#each $perBandCurvePaths as path, i}
            <path
              d={path}
              fill="none"
              stroke="var(--band-{(i % 10) + 1})"
              stroke-width="1.25"
              opacity="0.4"
              class="eq-curve-band"
            />
          {/each}
        </g>
      {/if}

      <!-- Curves: Sum curve -->
      <g class="curves-sum">
        <path
          d={$sumCurvePath}
          fill="none"
          stroke="var(--sum-curve)"
          stroke-width={focusMode ? "1.5" : "2.25"}
          opacity={focusMode ? "0.6" : "1"}
          class="eq-curve-sum"
          class:focused={focusMode}
        />
      </g>
      
      <!-- Selected band curve -->
      {#if focusMode && selectedBandCurvePath && $selectedBandIndex !== null}
        <g class="curves-selected">
          <path
            d={selectedBandCurvePath}
            fill="none"
            stroke={`var(--band-${($selectedBandIndex % 10) + 1})`}
            stroke-width="2.75"
            opacity="0.95"
            class="eq-curve-selected"
          />
        </g>
      {/if}

      <!-- Bandwidth markers -->
      {#if $showBandwidthMarkers && bandwidthMarkers.leftFreq && bandwidthMarkers.rightFreq && $selectedBandIndex !== null}
        <g class="bandwidth-markers">
          <line
            x1={freqToX(bandwidthMarkers.leftFreq, 1000)}
            y1="395"
            x2={freqToX(bandwidthMarkers.leftFreq, 1000)}
            y2="400"
            stroke={`var(--band-${($selectedBandIndex % 10) + 1})`}
            stroke-width="2"
            opacity="0.8"
            class="bandwidth-marker"
          />
          <line
            x1={freqToX(bandwidthMarkers.rightFreq, 1000)}
            y1="395"
            x2={freqToX(bandwidthMarkers.rightFreq, 1000)}
            y2="400"
            stroke={`var(--band-${($selectedBandIndex % 10) + 1})`}
            stroke-width="2"
            opacity="0.8"
            class="bandwidth-marker"
          />
        </g>
      {/if}

      <!-- Tokens Layer -->
      <EqTokensLayer
        bands={$bands}
        bandOrderNumbers={$bandOrderNumbers}
        selectedBandIndex={$selectedBandIndex}
        {plotWidth}
        {plotHeight}
        {shiftPressed}
        {focusMode}
        on:tokenPointerDown={(e) => handleTokenPointerDown(e.detail.event, e.detail.bandIndex)}
        on:tokenPointerMove={(e) => handleTokenPointerMove(e.detail.event)}
        on:tokenPointerUp={(e) => handleTokenPointerUp(e.detail.event)}
        on:tokenWheel={(e) => handleTokenWheel(e.detail.event, e.detail.bandIndex)}
      />
    </svg>
  </div>

  <!-- Gain Scale Column -->
  <div class="eq-gainscale">
    {#each gainLabelTicks as gain}
      <span
        class="gain-label"
        class:gain-label-zero={gain === 0}
        style="top: {gainToYPercent(gain)}%;"
      >
        {gain > 0 ? '+' : ''}{gain}
      </span>
    {/each}
  </div>
</div>

<style>
  .eq-plot-area {
    display: grid;
    grid-template-columns: 1fr 32px;
    min-height: 0;
    height: 100%;
  }

  .eq-plot {
    position: relative;
    height: 100%;
    background: linear-gradient(180deg, 
      color-mix(in oklab, #041b1d 100%, black 0%) 0%,
      color-mix(in oklab, #041b1d 100%, white 8%) 60%,
      color-mix(in oklab, #041b1d 100%, black 0%) 100%
    );
  }

  .eq-plot svg {
    width: 100%;
    height: 100%;
    display: block;
    position: relative;
    z-index: 1;
  }

  .spectrum-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
  }

  .eq-gainscale {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .gain-label {
    position: absolute;
    transform: translateY(-50%);
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.62);
    font-weight: 500;
    white-space: nowrap;
    text-align: center;
    width: 100%;
  }

  .gain-label-zero {
    font-weight: 600;
    color: rgba(255, 255, 255, 0.75);
  }
</style>
