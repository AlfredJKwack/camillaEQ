<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import FilterIcon from '../components/icons/FilterIcons.svelte';
  import KnobDial from '../components/KnobDial.svelte';
  import FaderTooltip from '../components/FaderTooltip.svelte';
  import FilterTypePicker from '../components/FilterTypePicker.svelte';
  import type { EqBand } from '../dsp/filterResponse';
  import {
    bands,
    selectedBandIndex,
    sumCurvePath,
    perBandCurvePaths,
    setBandFreq,
    setBandGain,
    setBandQ,
    setBandType,
    toggleBandEnabled,
    selectBand,
    initializeFromConfig,
    clearEqState,
    uploadStatus,
    preampGain,
    setPreampGain,
  } from '../state/eqStore';
  import { connectionState, dspConfig, getDspInstance } from '../state/dspStore';
  import { SpectrumCanvasRenderer } from '../ui/rendering/SpectrumCanvasRenderer';
  import { SpectrumAreaLayer } from '../ui/rendering/canvasLayers/SpectrumAreaLayer';
  import { parseSpectrumData } from '../dsp/spectrumParser';
  import EqTokensLayer from '../ui/tokens/EqTokensLayer.svelte';
  import { calculateBandwidthMarkers } from '../dsp/bandwidthMarkers';
  import {
    generatePeakingFillPath,
    generateShelfTintRect,
    generatePassFilterTint,
    generateBandPassTintRect,
    generateNotchHaloPath,
  } from '../ui/rendering/eqFocusViz';
  import { generateBandCurvePath } from '../ui/rendering/EqSvgRenderer';

  let showPerBandCurves = false;
  let spectrumMode = 'off'; // 'off' | 'pre' | 'post'
  let spectrumSmooth = false; // Spectrum curve smoothing
  
  // MVP-14: Focus mode and visualization controls
  let showBandwidthMarkers = true; // Default: ON per spec
  let bandFillOpacity = 0.4; // Default: 40% per spec
  let isActivelyEditing = false; // Track active editing state
  let editingTimeoutId: number | null = null;
  
  // Track initialization state
  let eqInitialized = false;
  
  // Spectrum rendering
  let canvasElement: HTMLCanvasElement;
  let spectrumRenderer: SpectrumCanvasRenderer | null = null;
  let spectrumAreaLayer: SpectrumAreaLayer | null = null;
  let spectrumPollingInterval: number | null = null;
  let lastSpectrumFrame: number = 0;
  const SPECTRUM_POLL_INTERVAL = 100; // 10 Hz
  const SPECTRUM_STALE_THRESHOLD = 500; // ms
  
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
  
  // Tooltip state (for faders) - now with fixed positioning
  let tooltipState: {
    bandIndex: number | null; // null = master, 0+ = band index
    visible: boolean;
    fading: boolean;
    x: number;
    y: number;
    side: 'left' | 'right';
    value: number;
  } = { 
    bandIndex: null, 
    visible: false, 
    fading: false,
    x: 0,
    y: 0,
    side: 'left',
    value: 0
  };
  
  let tooltipFadeTimer: number | null = null;
  
  // Filter type picker state
  let typePickerOpen = false;
  let typePickerBandIndex: number | null = null;
  let typePickerBandLeft = 0;
  let typePickerBandRight = 0;
  let typePickerIconCenterY = 0;
  
  // Collision detection: determine if tooltip should flip to right side
  function shouldFlipTooltip(thumbElement: HTMLElement): 'left' | 'right' {
    const rect = thumbElement.getBoundingClientRect();
    const tooltipWidth = 60; // SVG width
    const margin = 8; // Minimum margin from edge
    
    // Check if left-side placement would go off-screen
    if (rect.left - tooltipWidth - margin < 0) {
      return 'right';
    }
    
    return 'left';
  }
  
  // Update tooltip position from thumb element
  function updateTooltipPosition(thumbElement: HTMLElement, value: number) {
    const rect = thumbElement.getBoundingClientRect();
    const side = shouldFlipTooltip(thumbElement);
    
    tooltipState.side = side;
    tooltipState.value = value;
    tooltipState.y = rect.top + rect.height / 2;
    
    if (side === 'left') {
      tooltipState.x = rect.left;
    } else {
      tooltipState.x = rect.right;
    }
  }
  
  // Plot dimensions for responsive tokens
  let plotWidth = 1000;
  let plotHeight = 400;
  let plotElement: HTMLDivElement;

  // Track plot size for token compensation and canvas resize
  $: if (plotElement) {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        plotWidth = entry.contentRect.width;
        plotHeight = entry.contentRect.height;
        
        // Resize spectrum canvas
        if (spectrumRenderer) {
          spectrumRenderer.resize(plotWidth, plotHeight);
        }
      }
    });
    observer.observe(plotElement);
  }
  
  // Lifecycle: Initialize canvas renderer
  onMount(() => {
    // Initialize canvas renderer with spectrum area layer
    if (canvasElement) {
      spectrumAreaLayer = new SpectrumAreaLayer({ smooth: spectrumSmooth });
      spectrumRenderer = new SpectrumCanvasRenderer(canvasElement, [spectrumAreaLayer]);
      spectrumRenderer.resize(plotWidth, plotHeight);
    }
    
    // Track shift key for cursor feedback
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftPressed = true;
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
  
  // Reactive: Update layer smoothing when toggle changes
  $: if (spectrumAreaLayer) {
    spectrumAreaLayer.setSmooth(spectrumSmooth);
  }
  
  onDestroy(() => {
    // Clean up polling interval
    if (spectrumPollingInterval !== null) {
      clearInterval(spectrumPollingInterval);
    }
    
    // Note: We don't disconnect the global DSP instance here
    // It persists across page navigation
  });
  
  // Reactive: Start/stop spectrum polling based on mode
  $: {
    const dsp = getDspInstance();
    const isConnected = dsp?.connected && dsp?.spectrumConnected;
    
    if (spectrumMode !== 'off' && isConnected && !spectrumPollingInterval) {
      // Start polling
      spectrumPollingInterval = window.setInterval(pollSpectrum, SPECTRUM_POLL_INTERVAL);
      console.log('Spectrum polling started');
    } else if (spectrumMode === 'off' && spectrumPollingInterval !== null) {
      // Stop polling
      clearInterval(spectrumPollingInterval);
      spectrumPollingInterval = null;
      
      // Clear canvas
      if (spectrumRenderer) {
        spectrumRenderer.clear();
      }
      console.log('Spectrum polling stopped');
    }
  }
  
  // Poll spectrum data and render
  async function pollSpectrum() {
    const dsp = getDspInstance();
    if (!dsp || !spectrumRenderer) return;
    
    try {
      const rawData = await dsp.getSpectrumData();
      const spectrumData = parseSpectrumData(rawData);
      
      if (spectrumData) {
        lastSpectrumFrame = Date.now();
        spectrumRenderer.resetOpacity();
        spectrumRenderer.render(spectrumData.bins, {
          mode: spectrumMode as 'pre' | 'post',
        });
      }
    } catch (error) {
      console.error('Spectrum poll error:', error);
    }
    
    // Check for stale data
    const timeSinceLastFrame = Date.now() - lastSpectrumFrame;
    if (timeSinceLastFrame > SPECTRUM_STALE_THRESHOLD && spectrumRenderer) {
      spectrumRenderer.fadeOut(0.3);
    }
  }

  // Coordinate mapping functions
  
  // Base-10 logarithmic frequency mapping (per spec)
  function freqToX(freq: number, width: number): number {
    const fMin = 20;
    const fMax = 20000;
    const xNorm = (Math.log10(freq) - Math.log10(fMin)) / (Math.log10(fMax) - Math.log10(fMin));
    return xNorm * width;
  }

  // Inverse: X coordinate to frequency
  function xToFreq(x: number, width: number): number {
    const fMin = 20;
    const fMax = 20000;
    const xNorm = x / width;
    const logFreq = xNorm * (Math.log10(fMax) - Math.log10(fMin)) + Math.log10(fMin);
    return Math.pow(10, logFreq);
  }

  // Gain to Y coordinate (linear, inverted for SVG)
  function gainToY(gain: number): number {
    const gainRange = 48; // -24 to +24
    return 200 - (gain / gainRange) * 400;
  }

  // Inverse: Y coordinate to gain
  function yToGain(y: number): number {
    const gainRange = 48;
    return (200 - y) / 400 * gainRange;
  }

  // MVP-14: Active editing tracking helpers
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
    // Only deselect if clicking directly on plot (not on tokens or interactive elements)
    const target = event.target as Element;
    if (target.tagName === 'svg' || target.classList.contains('eq-plot')) {
      selectBand(null);
    }
  }

  // Token interaction handlers
  function handleTokenPointerDown(event: PointerEvent, bandIndex: number) {
    event.preventDefault();
    event.stopPropagation();
    
    const target = event.currentTarget as SVGElement;
    target.setPointerCapture(event.pointerId);
    
    const band = $bands[bandIndex];
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
    setActiveEditing(); // MVP-14: Mark as actively editing
  }

  function handleTokenPointerMove(event: PointerEvent) {
    if (!dragState || !plotElement) return;
    
    const band = $bands[dragState.bandIndex];
    const supportsGain = band.type === 'Peaking' || band.type === 'LowShelf' || band.type === 'HighShelf';
    
    const rect = plotElement.getBoundingClientRect();
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    
    if (event.shiftKey) {
      // Shift + drag Y = adjust Q (log-space for consistent feel)
      const Q_MIN = 0.1;
      const Q_MAX = 10;
      
      const logMin = Math.log(Q_MIN);
      const logMax = Math.log(Q_MAX);
      const logRange = logMax - logMin;
      
      // Half viewport height to traverse the full [min..max] range
      const logPerPx = logRange / (window.innerHeight / 2);
      
      // Dragging up (deltaY negative) should increase Q
      const startLogQ = Math.log(Math.max(Q_MIN, Math.min(Q_MAX, dragState.startQ)));
      const newLogQ = startLogQ - deltaY * logPerPx;
      
      const clampedLogQ = Math.max(logMin, Math.min(logMax, newLogQ));
      const newQ = Math.exp(clampedLogQ);
      
      setBandQ(dragState.bandIndex, newQ);
    } else {
      // Normal drag: X = freq, Y = gain (only for gain-capable types)
      const pixelToViewBoxX = 1000 / rect.width;
      
      const deltaViewBoxX = deltaX * pixelToViewBoxX;
      
      const currentX = freqToX(dragState.startFreq, 1000);
      const newX = currentX + deltaViewBoxX;
      const newFreq = xToFreq(newX, 1000);
      
      setBandFreq(dragState.bandIndex, newFreq);
      
      // Only adjust gain for types that support it
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
    // Active editing state will timeout after 250ms
  }

  function handleTokenWheel(event: WheelEvent, bandIndex: number) {
    event.preventDefault();
    
    const band = $bands[bandIndex];
    const delta = event.deltaY > 0 ? -0.1 : 0.1; // Wheel up = increase Q
    setBandQ(bandIndex, band.q + delta);
  }

  // Tooltip helpers
  function showTooltip(bandIndex: number | null, thumbElement: HTMLElement, value: number) {
    if (tooltipFadeTimer !== null) {
      clearTimeout(tooltipFadeTimer);
      tooltipFadeTimer = null;
    }
    tooltipState.bandIndex = bandIndex;
    tooltipState.visible = true;
    tooltipState.fading = false;
    updateTooltipPosition(thumbElement, value);
  }

  function hideTooltipWithFade() {
    tooltipState.fading = true;
    tooltipFadeTimer = window.setTimeout(() => {
      tooltipState = { 
        bandIndex: null, 
        visible: false, 
        fading: false,
        x: 0,
        y: 0,
        side: 'left',
        value: 0
      };
      tooltipFadeTimer = null;
    }, 1500); // Fade duration matches CSS transition
  }

  // Fader interaction
  function handleFaderPointerDown(event: PointerEvent, bandIndex: number) {
    event.preventDefault();
    event.stopPropagation(); // Prevent band selection from triggering
    
    // Get the track (parent of thumb)
    const thumb = event.currentTarget as HTMLElement;
    const track = thumb.closest('.fader-track') as HTMLElement;
    if (!track) return;
    
    const rect = track.getBoundingClientRect();
    
    setActiveEditing(); // MVP-14: Mark as actively editing
    
    const updateGainFromPointer = (clientY: number) => {
      const relY = (clientY - rect.top) / rect.height;
      const gain = 24 - relY * 48; // Fader: top = +24, bottom = -24
      setBandGain(bandIndex, gain);
      
      // Update tooltip position with new value
      if (tooltipState.visible && tooltipState.bandIndex === bandIndex) {
        updateTooltipPosition(thumb, gain);
      }
    };
    
    updateGainFromPointer(event.clientY);
    
    // Show tooltip after initial update
    const currentBand = $bands[bandIndex];
    showTooltip(bandIndex, thumb, currentBand.gain);
    
    const onMove = (e: PointerEvent) => {
      updateGainFromPointer(e.clientY);
      setActiveEditing(); // Extend editing state on continuous drag
    };
    
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      hideTooltipWithFade();
      // Active editing state will timeout after 250ms
    };
    
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // Filter type picker handlers
  function handleFilterIconClick(event: MouseEvent, bandIndex: number) {
    event.stopPropagation();
    
    const target = event.currentTarget as HTMLElement;
    const iconRect = target.getBoundingClientRect();
    
    // Find the band column container
    const bandColumn = target.closest('.band-column') as HTMLElement;
    if (!bandColumn) return;
    
    const bandRect = bandColumn.getBoundingClientRect();
    
    typePickerBandIndex = bandIndex;
    typePickerBandLeft = bandRect.left;
    typePickerBandRight = bandRect.right;
    typePickerIconCenterY = iconRect.top + iconRect.height / 2;
    typePickerOpen = true;
    
    selectBand(bandIndex);
  }
  
  function handleTypeSelect(event: CustomEvent<{ type: EqBand['type'] }>) {
    if (typePickerBandIndex !== null) {
      setBandType(typePickerBandIndex, event.detail.type);
    }
  }
  
  function handleTypePickerClose() {
    typePickerOpen = false;
    typePickerBandIndex = null;
  }

  // Master fader interaction (preamp gain control)
  function handleMasterFaderPointerDown(event: PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    
    const thumb = event.currentTarget as HTMLElement;
    const track = thumb.closest('.fader-track') as HTMLElement;
    if (!track) return;
    
    const rect = track.getBoundingClientRect();
    
    const updatePreampFromPointer = (clientY: number) => {
      const relY = (clientY - rect.top) / rect.height;
      const gain = 24 - relY * 48; // Fader: top = +24, bottom = -24
      setPreampGain(gain);
      
      // Update tooltip position with new value
      if (tooltipState.visible && tooltipState.bandIndex === null) {
        updateTooltipPosition(thumb, gain);
      }
    };
    
    updatePreampFromPointer(event.clientY);
    
    // Show tooltip after initial update
    showTooltip(null, thumb, $preampGain);
    
    const onMove = (e: PointerEvent) => {
      updatePreampFromPointer(e.clientY);
    };
    
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      hideTooltipWithFade();
    };
    
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // Calculate octave column widths (musical C starting frequencies)
  const octaveFreqs = [32.70, 65.41, 130.81, 261.63, 523.25, 1046.50, 2093.00, 4186.01, 8372.02];
  function calcOctaveWidths(): number[] {
    // Pre-C1 spacer (20→32.70), C1...C9, Post-C9 spacer (8372.02→20000)
    const widths: number[] = [];
    widths.push(Math.log10(octaveFreqs[0]) - Math.log10(20)); // pre-spacer
    for (let i = 0; i < octaveFreqs.length; i++) {
      const end = i < octaveFreqs.length - 1 ? octaveFreqs[i + 1] : octaveFreqs[i] * 2;
      widths.push(Math.log10(end) - Math.log10(octaveFreqs[i]));
    }
    widths.push(Math.log10(20000) - Math.log10(octaveFreqs[octaveFreqs.length - 1] * 2)); // post-spacer
    return widths;
  }
  const octaveWidths = calcOctaveWidths();
  
  // Calculate region column widths (explicit frequency boundaries)
  const regionBoundaries = [20, 60, 250, 500, 2000, 4000, 6000, 20000];
  function calcRegionWidths(): number[] {
    const widths: number[] = [];
    for (let i = 0; i < regionBoundaries.length - 1; i++) {
      widths.push(Math.log10(regionBoundaries[i + 1]) - Math.log10(regionBoundaries[i]));
    }
    return widths;
  }
  const regionWidths = calcRegionWidths();

  // Generate decade-based frequency ticks per spec
  function generateFrequencyTicks(): { majors: number[]; minors: number[] } {
    const majors: number[] = [];
    const minors: number[] = [];
    
    // For each decade 10^n, draw lines at k * 10^n for k ∈ {2,3,4,5,6,7,8,9}
    // Treat k ∈ {2,5,10} as "major", others as "minor"
    for (let exp = 1; exp <= 4; exp++) {
      const decade = Math.pow(10, exp);
      for (let k = 1; k <= 9; k++) {
        const freq = k * decade;
        if (freq >= 20 && freq <= 20000) {
          if (k === 1 || k === 2 || k === 5) {
            majors.push(freq);
          } else {
            minors.push(freq);
          }
        }
      }
    }
    // Add 20 as starting major
    if (!majors.includes(20)) majors.unshift(20);
    
    return { majors, minors };
  }

  const { majors: majorTicks, minors: minorTicks } = generateFrequencyTicks();

  // Gain range (fixed for now)
  const GAIN_MIN = -24;
  const GAIN_MAX = 24;
  const GAIN_STEP = 6;
  
  const gainTicks: number[] = [];
  for (let g = GAIN_MIN; g <= GAIN_MAX; g += GAIN_STEP) {
    gainTicks.push(g);
  }

  // Gain axis labels (right side of plot)
  const gainLabelTicks = [-18, -12, -6, 0, 6, 12, 18];
  
  // Calculate Y position for gain labels (percentage)
  function gainToYPercent(gain: number): number {
    return (1 - (gain + 24) / 48) * 100;
  }

  // Format frequency labels
  function formatFreq(freq: number): string {
    if (freq >= 1000) {
      const k = freq / 1000;
      return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
    }
    return `${freq}`;
  }
  
  // MVP-14: Reactive computed values for focus mode
  $: focusMode = $selectedBandIndex !== null;
  $: selectedBand = $selectedBandIndex !== null ? $bands[$selectedBandIndex] : null;
  
  // MVP-14: Spectrum ducking based on selection and active editing
  $: spectrumOpacity = (() => {
    if (!focusMode) return 1.0; // No selection: full opacity
    if (isActivelyEditing || dragState !== null) return 0.4; // Actively editing: strong duck
    return 0.7; // Selected but not editing: partial duck
  })();
  
  // MVP-14: Focus mode curves (selected band only)
  $: selectedBandCurvePath = selectedBand ? generateBandCurvePath(selectedBand, {
    width: 1000,
    height: 400,
    numPoints: 128,
  }) : '';
  
  // MVP-14: Area-of-effect visualization paths
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
  
  // MVP-14: Bandwidth markers (only for peaking/notch)
  $: bandwidthMarkers = (() => {
    if (!showBandwidthMarkers || !selectedBand) {
      return { leftFreq: null, rightFreq: null };
    }
    
    return calculateBandwidthMarkers(selectedBand);
  })();
</script>

<div class="eq-layout">
  <!-- Left: EQ Plot Area -->
  <div class="eq-left">
    <!-- Row 1: Top Labels -->
    <div class="eq-left-top">
      <!-- Zone 1: Octave Indicators Row (C1-C9 + spacers) -->
      <div class="eq-octaves-area">
        <div class="eq-octaves" style="grid-template-columns: {octaveWidths.map(w => `${w}fr`).join(' ')};">
          <div class="eq-octave-spacer"></div>
          <div class="eq-octave-cell">C1</div>
          <div class="eq-octave-cell">C2</div>
          <div class="eq-octave-cell">C3</div>
          <div class="eq-octave-cell">C4</div>
          <div class="eq-octave-cell">C5</div>
          <div class="eq-octave-cell">C6</div>
          <div class="eq-octave-cell">C7</div>
          <div class="eq-octave-cell">C8</div>
          <div class="eq-octave-cell">C9</div>
          <div class="eq-octave-spacer"></div>
        </div>
        <div class="eq-zone-spacer"></div>
      </div>

      <!-- Zone 2: Frequency Region Labels Row -->
      <div class="eq-regions-area">
        <div class="eq-regions" style="grid-template-columns: {regionWidths.map(w => `${w}fr`).join(' ')};">
          <div class="eq-region-cell">SUB</div>
          <div class="eq-region-cell">BASS</div>
          <div class="eq-region-cell">LOW MID</div>
          <div class="eq-region-cell">MID</div>
          <div class="eq-region-cell">HIGH MID</div>
          <div class="eq-region-cell">PRS</div>
          <div class="eq-region-cell">TREBLE</div>
        </div>
        <div class="eq-zone-spacer"></div>
      </div>
    </div>

    <!-- Row 2: Middle (Plot + Faders) -->
    <div class="eq-left-middle">
      <div class="eq-plot-area">
        <div class="eq-plot" bind:this={plotElement} on:click={handlePlotBackgroundClick}>
          <!-- Canvas spectrum layer (behind SVG) with ducking -->
          <canvas class="spectrum-canvas" bind:this={canvasElement} style="opacity: {spectrumOpacity}; transition: opacity 0.2s ease;"></canvas>
          
          <svg viewBox="0 0 1000 400" preserveAspectRatio="none" on:click={handlePlotBackgroundClick}>
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

          <!-- Zero line (emphasized, follows preamp gain) -->
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

          <!-- Placeholder: Analyzer layer -->
          <g class="analyzer"></g>
          
          <!-- MVP-14: Focus mode area-of-effect visualization -->
          {#if focusMode && selectedBand && $selectedBandIndex !== null}
            <g class="focus-area" opacity={bandFillOpacity}>
              <!-- Area fill/tint for different filter types -->
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
              
              <!-- Notch halo (wider stroke behind curve) -->
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

          <!-- Curves: Per-band (optional, hidden in focus mode) -->
          {#if showPerBandCurves && !focusMode}
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

          <!-- Curves: Sum curve (thinner in focus mode) -->
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
          
          <!-- MVP-14: Selected band curve (focus mode only) -->
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

          <!-- MVP-14: Bandwidth markers (on frequency axis) -->
          {#if showBandwidthMarkers && bandwidthMarkers.leftFreq && bandwidthMarkers.rightFreq && $selectedBandIndex !== null}
            <g class="bandwidth-markers">
              <!-- Left marker -->
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
              <!-- Right marker -->
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

          <!-- Tokens Layer Component -->
          <EqTokensLayer
            bands={$bands}
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

        <!-- Gain Scale Column (right side) -->
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
    </div>

    <!-- Row 3: Bottom Labels -->
    <div class="eq-left-bottom">
      <!-- Zone 4: Frequency Scale Row -->
      <div class="eq-freqscale-area">
        <div class="eq-freqscale">
          {#each majorTicks as freq, i}
            {#if freq !== 20000}
              <span
                class="freq-label"
                class:freq-label-first={i === 0}
                style={i === 0
                  ? 'left: 1em;'
                  : `left: ${(freqToX(freq, 1000) / 1000) * 100}%;`}
              >
                {formatFreq(freq)}
              </span>
            {/if}
          {/each}
        </div>
        <div class="eq-zone-spacer"></div>
      </div>

      <!-- Visualization Options Bar -->
      <div class="viz-options-area">
      <div class="viz-options">
        <div class="option-group">
          <label>Spectrum:</label>
          <button class:active={spectrumMode === 'off'} on:click={() => (spectrumMode = 'off')}>
            Off
          </button>
          <button class:active={spectrumMode === 'pre'} on:click={() => (spectrumMode = 'pre')}>
            Pre-EQ
          </button>
          <button class:active={spectrumMode === 'post'} on:click={() => (spectrumMode = 'post')}>
            Post-EQ
          </button>
        </div>
        <div class="option-group">
          <label>
            <input type="checkbox" bind:checked={showPerBandCurves} />
            Show per-band curves
          </label>
        </div>
        <div class="option-group">
          <label>
            <input type="checkbox" bind:checked={spectrumSmooth} />
            Smooth spectrum
          </label>
        </div>
        <div class="option-group">
          <label>
            <input type="checkbox" bind:checked={showBandwidthMarkers} />
            Show bandwidth markers
          </label>
        </div>
        <div class="option-group">
          <label>Band fill opacity:</label>
          <span style="--knob-arc: var(--sum-curve);">
            <KnobDial 
              value={bandFillOpacity}
              min={0}
              max={1}
              scale="linear"
              size={24}
              on:change={(e) => (bandFillOpacity = Math.max(0, Math.min(1, e.detail.value)))}
            />
          </span>
        </div>
      </div>
      <div class="viz-options-spacer"></div>
      </div>
    </div>
  </div>

  <!-- Right: Band Columns (Scrollable) -->
  <div class="eq-right">
    <div class="band-grid">
      <!-- Master/Preamp Band Column -->
        <div class="band-column master-band band" style="--band-color: var(--band-10);" data-enabled={true}>
          <div class="band-top">
            <div class="filter-type-icon" style="visibility: hidden;">
              <!-- Empty spacer -->
            </div>

            <div class="slope-icon" style="visibility: hidden;">
              <!-- Empty spacer -->
            </div>
          </div>

          <div class="band-middle">
            <div class="gain-fader">
              <div class="fader-track">
                <!-- Tickmarks at ±18, ±12, ±6 dB -->
                {#each [-18, -12, -6, 6, 12, 18] as tickGain}
                  <div class="fader-tick" style="bottom: {((tickGain + 24) / 48) * 100}%;"></div>
                {/each}
                
                <!-- Thumb wrapper -->
                <div class="fader-thumb-wrap" style="bottom: {(($preampGain + 24) / 48) * 100}%;">
                  <div
                    class="fader-thumb"
                    on:pointerdown={handleMasterFaderPointerDown}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <div class="band-bottom">
            <button class="mute-btn" title="Master Mute">
              <span class="mute-indicator"></span>
            </button>

            <div class="knob-label">FREQ</div>
            <div class="knob-label">BW</div>
          </div>
        </div>
    
        <!-- Band columns -->
        {#each $bands as band, i}
          <div 
            class="band-column band" 
            style="--band-color: var(--band-{(i % 10) + 1});" 
            data-enabled={band.enabled}
            data-selected={$selectedBandIndex === i}
            on:pointerdown|capture={() => selectBand(i)}
          >
            <div class="band-top">
              <div class="filter-type-icon" title="Band {i + 1} — {band.type}" on:click={(e) => handleFilterIconClick(e, i)}>
                <FilterIcon type={band.type} />
              </div>

              <div class="slope-icon">
                <div class="icon-placeholder">24dB</div>
              </div>
            </div>

            <div class="band-middle">
              <div class="gain-fader" data-supports-gain={band.type === 'Peaking' || band.type === 'LowShelf' || band.type === 'HighShelf'}>
                <div class="fader-track">
                  <!-- Tickmarks at ±18, ±12, ±6 dB -->
                  {#each [-18, -12, -6, 6, 12, 18] as tickGain}
                    <div class="fader-tick" style="bottom: {((tickGain + 24) / 48) * 100}%;"></div>
                  {/each}
                  
                  <!-- Thumb wrapper -->
                  <div class="fader-thumb-wrap" style="bottom: {((band.gain + 24) / 48) * 100}%;">
                    <div
                      class="fader-thumb"
                      on:pointerdown={(e) => handleFaderPointerDown(e, i)}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="band-bottom">
              <button 
                class="mute-btn" 
                class:muted={!band.enabled} 
                title={band.enabled ? 'Mute' : 'Unmute'}
                on:click={() => toggleBandEnabled(i)}
              >
                <span class="mute-indicator"></span>
              </button>

              <div class="knob-wrapper">
                <KnobDial 
                  value={band.freq} 
                  mode="frequency" 
                  size={19} 
                  on:change={(e) => setBandFreq(i, e.detail.value)}
                />
              </div>

              <div class="knob-wrapper">
                <KnobDial 
                  value={band.q} 
                  mode="q" 
                  size={19}
                  on:change={(e) => setBandQ(i, e.detail.value)}
                />
              </div>
            </div>
          </div>
        {/each}
      </div>
  </div>
  
  <!-- Global tooltip overlay (positioned via fixed coordinates) -->
  <FaderTooltip
    value={tooltipState.value}
    visible={tooltipState.visible}
    fading={tooltipState.fading}
    x={tooltipState.x}
    y={tooltipState.y}
    side={tooltipState.side}
    strokeColor={`color-mix(in oklab, ${
      tooltipState.bandIndex === null
        ? 'hsl(0 0% 72%)'
        : `var(--band-${(tooltipState.bandIndex % 10) + 1})`
    } 55%, white 10%)`}
  />
  
  <!-- Filter type picker popover -->
  {#if typePickerOpen && typePickerBandIndex !== null}
    <FilterTypePicker
      currentType={$bands[typePickerBandIndex].type}
      bandLeft={typePickerBandLeft}
      bandRight={typePickerBandRight}
      iconCenterY={typePickerIconCenterY}
      on:select={handleTypeSelect}
      on:close={handleTypePickerClose}
    />
  {/if}
</div>

<style>
  /* MVP-11: CSS Subgrid Layout */
  .eq-layout {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto 1fr auto;
    height: 100vh;
    padding: 1rem;
    gap: 1rem;
    box-sizing: border-box;
    min-height: 0;
  }

  /* Left side: participates in parent's 3 rows */
  .eq-left {
    display: grid;
    grid-template-rows: subgrid;
    grid-row: 1 / span 3;
    min-height: 0;
  }

  .eq-left-top {
    align-self: end;
  }

  .eq-left-middle {
    min-height: 0;
    height: 100%;
  }

  .eq-left-bottom {
    align-self: start;
  }

  /* Right side: participates in parent's 3 rows via subgrid */
  .eq-right {
    display: grid;
    grid-template-rows: subgrid;
    grid-row: 1 / span 3;
    min-width: 0;
    min-height: 0;
  }

  .band-grid {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: subgrid;
    grid-row: 1 / span 3;
    gap: 0.375rem;
    height: 100%;
    min-height: 0;
    overflow-x: auto;
    overflow-y: hidden;
  }

  /* Octave Indicators Row */
  .eq-octaves-area {
    display: grid;
    grid-template-columns: 1fr 44px;
    align-items: end;
  }

  .eq-octaves {
    padding: 0 14px;
    display: grid;
    grid-template-columns: repeat(9, 1fr);
    align-items: center;
    gap: 6px;
  }

  .eq-octave-cell {
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.10);
    background: rgba(255, 255, 255, 0.07);
    color: rgba(255, 255, 255, 0.72);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    border-radius: 2px;
    background: color-mix(in oklab, var(--ui-panel) 70%, #041b1d 30%);    
  }

  .eq-octave-spacer {
    /* Invisible spacer columns */
    border: none;
    background: transparent;
  }

  /* Frequency Region Labels Row */
  .eq-regions-area {
    display: grid;
    grid-template-columns: 1fr 44px;
  }

  .eq-regions {
    padding: 0 14px;
    display: grid;
    grid-template-columns: repeat(9, 1fr);
    align-items: center;
    gap: 6px;
  }

  .eq-region-cell {
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.10);
    background: rgba(255, 255, 255, 0.07);
    color: rgba(255, 255, 255, 0.72);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    border-radius: 2px;
    background: color-mix(in oklab, var(--ui-panel) 70%, #041b1d 30%);    
  }

  /* Main Graph Area (2-column layout) */
  .eq-plot-area {
    display: grid;
    grid-template-columns: 1fr 32px; /* Matches .eq-freqscale-area */
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

  /* Spectrum canvas layer (behind SVG) */
  .spectrum-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
  }

  /* Gain Scale Column (right side) */
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

  /* Frequency Scale Row */
  .eq-freqscale-area {
    display: grid;
    grid-template-columns: 1fr 32px; /* Matches .eq-plot-area */
  }

  .eq-freqscale {
    position: relative;
    padding: 0 14px;
    display: flex;
    align-items: center;
  }

  /* Spacer column (matches gain scale background) */
  .eq-zone-spacer {
  }

  .freq-label {
    position: absolute;
    transform: translateX(-50%);
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.62);
    font-weight: 500;
    white-space: nowrap;
  }

  .freq-label-first {
    transform: none;
  }

  .viz-options-area {
    display: grid;
    grid-template-columns: 1fr 32px; /* Matches .eq-plot-area and .eq-freqscale-area */
    margin-top: 1rem;
  }

  .viz-options {
    display: flex;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--ui-panel);
    border: 1px solid var(--ui-border);
    border-radius: 4px;
  }

  .viz-options-spacer {
    /* Empty gutter column to align with plot area */
  }

  .option-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .option-group label {
    color: var(--ui-text-muted);
    font-size: 0.875rem;
  }

  .option-group button {
    padding: 0.375rem 0.75rem;
    background: transparent;
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    color: var(--ui-text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .option-group button:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .option-group button.active {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.25);
    color: var(--ui-text);
  }

  /* Band Columns: use subgrid to participate in parent's 3 rows */
  .band-column {
    display: grid;
    grid-template-rows: subgrid;
    grid-row: 1 / span 3;
    max-width: 80px;
    border-radius: 8px;
    border: 1px solid transparent;
    min-width: 40px;
    margin: 0 -3px;    
  }

  /* Band column sections */
  .band-top {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: end;
    gap: 0.5rem;
  }

  .band-middle {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: stretch;
    min-height: 0;
    height: 100%;
  }

  .band-bottom {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: start;
    gap: 0.5rem;
  }

  .band-column[data-enabled='false'] {
    opacity: 0.5;
  }

  .band-column[data-selected='true'] {
    border-color: color-mix(in oklab, var(--band-color) 44%, var(--ui-border));
    background: color-mix(in oklab, var(--band-color) 2%, var(--ui-panel));
    box-shadow: 0 0 0 1px color-mix(in oklab, var(--band-color) 7%, transparent);
  }

  .master-band {
    opacity: 0.6;
  }

  .filter-type-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    cursor: pointer;
  }

  .slope-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 21px;
    height: 21px;
    cursor: pointer;
  }

  .icon-placeholder {
    font-size: 0.625rem;
    opacity: 0.8;
    color: var(--band-ink);
  }

  .gain-fader {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    height: 100%;
    min-height: 120px;
    justify-self: stretch;
  }
  
  /* Dim faders for non-gain filter types */
  .gain-fader[data-supports-gain='false'] {
    opacity: 0.35;
    pointer-events: none;
  }

  .fader-track {
    position: relative;
    width: 24px;
    flex: 1;
    /* background: var(--ui-border); */
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 2px;
    touch-action: none;
  }

  /* Thumb wrapper: positions thumb + tooltip together */
  .fader-thumb-wrap {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
  }

  .fader-thumb {
    position: absolute;
    left: 50%;
    bottom: 0;
    transform: translate(-50%, 50%);
    width: 14px;
    height: 28px;
    background: var(--band-ink);
    border: 2px solid rgba(0, 0, 0, 0.45);
    border-radius: 4px;
    cursor: grab;
    touch-action: none;
  }

  .fader-thumb:active {
    cursor: grabbing;
  }

  /* Fader track tickmarks */
  .fader-tick {
    position: absolute;
    left: 20%;
    width: 60%;
    height: 3px;
    background: var(--band-muted);
    opacity: 0.3;
    pointer-events: none;
  }

  .fader-value {
    font-size: 0.625rem;
    color: var(--band-ink);
    font-weight: 600;
  }

  .mute-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    background: transparent;
    border: 2px solid var(--band-outline);
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mute-indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--band-ink);
    transition: all 0.15s ease;
  }

  .mute-btn:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .mute-btn.muted .mute-indicator {
    background: transparent;
  }

  .mute-btn.muted {
    border-color: var(--ui-border);
    opacity: 0.5;
  }

  .knob-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: auto;
  }

  .knob-label {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.625rem;
    color: var(--ui-text-dim);
    font-weight: 600;
    letter-spacing: 0.05em;
    height: 31px;
  }

</style>
