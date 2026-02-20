<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import FilterIcon from '../components/icons/FilterIcons.svelte';
  import BandOrderIcon from '../components/icons/BandOrderIcon.svelte';
  import KnobDial from '../components/KnobDial.svelte';
  import FaderTooltip from '../components/FaderTooltip.svelte';
  import FilterTypePicker from '../components/FilterTypePicker.svelte';
  import HeatmapSettings from '../components/HeatmapSettings.svelte';
  import preEqSpectrumUrl from '../assets/vis-opt-spectrum-preeq.webp';
  import postEqSpectrumUrl from '../assets/vis-opt-spectrum-posteq.webp';
  import type { EqBand } from '../dsp/filterResponse';
  import {
    bands,
    filterNames,
    bandOrderNumbers,
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
  import { SpectrumAnalyzerLayer } from '../ui/rendering/canvasLayers/SpectrumAnalyzerLayer';
  import { SpectrumHeatmapLayer, type HeatmapMaskMode } from '../ui/rendering/canvasLayers/SpectrumHeatmapLayer';
  import { parseSpectrumData, dbArrayToNormalized } from '../dsp/spectrumParser';
  import { SpectrumAnalyzer } from '../dsp/spectrumAnalyzer';
  import { smoothDbBins, type SmoothingMode } from '../dsp/fractionalOctaveSmoothing';
  import {
    selectPrimarySeries,
    getEffectiveSmoothing,
    getEffectivePollInterval,
    getEffectiveAnalyzerTau,
  } from '../dsp/heatmapSeries';
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
  import { loadVizOptions, saveVizOptions } from '../lib/vizOptionsPersistence';
  import { debounce } from '../lib/debounce';

  // VizLayoutManager: Responsive collapse/expand logic for viz-options groups
  interface VizGroup {
    id: string;
    priority: number;
    expandedWidth: number;
    el: HTMLElement;
  }

  class VizLayoutManager {
    private host: HTMLElement;
    private viewport: HTMLElement;
    private strip: HTMLElement;
    private groups: VizGroup[];
    private S: number; // stub width
    private N: number; // number of groups
    private capExpandedCount: number;
    private maxWi: number;
    private MIN_SCROLL_WIDTH: number;
    private userChosen: Set<string>;
    private lastUser: string | null;
    private ro: ResizeObserver;
    private _frozenId: string | null = null;
    private _t: number | null = null;

    constructor(hostEl: HTMLElement, viewportEl: HTMLElement, stripEl: HTMLElement, groups: VizGroup[], opts: { stubWidth?: number } = {}) {
      this.host = hostEl;
      this.viewport = viewportEl;
      this.strip = stripEl;
      this.groups = groups;

      this.S = opts.stubWidth ?? 44;
      this.N = groups.length;
      this.capExpandedCount = this.N; // Allow all groups expanded when space permits

      this.maxWi = Math.max(...groups.map(g => g.expandedWidth));
      this.MIN_SCROLL_WIDTH = (this.N - 1) * this.S + this.maxWi;

      this.userChosen = new Set();
      this.lastUser = null;

      this.strip.style.minWidth = this.MIN_SCROLL_WIDTH + 'px';

      this.ro = new ResizeObserver(() => this.scheduleLayout());
      this.ro.observe(this.host);

      // Wire up stub click handlers
      for (const g of this.groups) {
        const stub = g.el.querySelector('.groupStub') as HTMLElement;
        if (stub) {
          stub.addEventListener('click', () => this.toggleChoice(g.id));
          stub.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              this.toggleChoice(g.id);
            }
          });
        }
      }

      this.viewport.addEventListener('scroll', () => this.updateOverflowAffordances());
      this.layout(true);
      this.updateOverflowAffordances();
    }

    scheduleLayout() {
      if (this._t !== null) clearTimeout(this._t);
      this._t = window.setTimeout(() => {
        this.layout(false);
        this.updateOverflowAffordances();
      }, 30);
    }

    availableWidth() {
      return this.host.clientWidth;
    }

    constrained() {
      return this.availableWidth() < this.MIN_SCROLL_WIDTH;
    }

    groupById(id: string): VizGroup | null {
      return this.groups.find(g => g.id === id) ?? null;
    }

    sortedByPriorityAsc(list: VizGroup[]): VizGroup[] {
      return [...list].sort((a, b) => a.priority - b.priority);
    }

    resetVisual() {
      for (const g of this.groups) {
        g.el.classList.remove('expanded', 'chosen');
      }
    }

    markChosen() {
      for (const g of this.groups) {
        if (this.userChosen.has(g.id)) g.el.classList.add('chosen');
      }
    }

    totalWidthForExpandedSet(E: Set<string>): number {
      let total = this.N * this.S;
      for (const id of E) {
        const g = this.groupById(id);
        if (g) total += (g.expandedWidth - this.S);
      }
      return total;
    }

    defaultExpandedSetResponsive(): Set<string> {
      const E = new Set<string>();
      const budget = this.availableWidth() - this.N * this.S;
      let used = 0;
      for (const g of this.sortedByPriorityAsc(this.groups)) {
        if (E.size >= this.capExpandedCount) break;
        const extra = g.expandedWidth - this.S;
        if (used + extra <= budget) {
          E.add(g.id);
          used += extra;
        }
      }
      if (E.size === 0) E.add(this.sortedByPriorityAsc(this.groups)[0].id);
      return E;
    }

    evictUntilFits(E: Set<string>, protectId: string | null = null) {
      while (E.size > this.capExpandedCount) {
        const v = this.pickEvictionCandidate(E, protectId);
        if (!v) break;
        E.delete(v.id);
        this.userChosen.delete(v.id);
        if (this.lastUser === v.id) this.lastUser = null;
      }
      while (this.totalWidthForExpandedSet(E) > this.availableWidth()) {
        const v = this.pickEvictionCandidate(E, protectId);
        if (!v) break;
        E.delete(v.id);
        this.userChosen.delete(v.id);
        if (this.lastUser === v.id) this.lastUser = null;
      }
    }

    pickEvictionCandidate(E: Set<string>, protectId: string | null): VizGroup | null {
      const candidates = [...E]
        .map(id => this.groupById(id))
        .filter((g): g is VizGroup => g !== null)
        .filter(g => g.id !== protectId);
      if (!candidates.length) return null;
      candidates.sort((a, b) => b.priority - a.priority);
      return candidates[0];
    }

    toggleChoice(id: string) {
      const already = this.userChosen.has(id);
      if (already) {
        this.userChosen.delete(id);
        if (this.lastUser === id) this.lastUser = null;
      } else {
        this.userChosen.add(id);
        this.lastUser = id;
      }
      this.layout(false);
      const target = this.groupById(this.lastUser ?? id);
      if (target) requestAnimationFrame(() => this.scrollGroupIntoView(target.el));
    }

    expandedIdConstrained(): string {
      if (this.lastUser) return this.lastUser;
      return this.sortedByPriorityAsc(this.groups)[0].id;
    }

    layout(first: boolean) {
      const isCon = this.constrained();
      this.viewport.classList.toggle('constrained', isCon);
      this.resetVisual();
      this.markChosen();

      if (isCon) {
        const id = this.expandedIdConstrained();
        const g = this.groupById(id) ?? this.sortedByPriorityAsc(this.groups)[0];
        g.el.classList.add('expanded');
        if (this._frozenId !== g.id || first) {
          this._frozenId = g.id;
          requestAnimationFrame(() => this.scrollGroupIntoView(g.el));
        }
        return;
      }

      let E = this.defaultExpandedSetResponsive();
      const orderedChosen: VizGroup[] = [];
      if (this.lastUser) {
        const lu = this.groupById(this.lastUser);
        if (lu) orderedChosen.push(lu);
      }
      for (const g of this.sortedByPriorityAsc([...this.userChosen].map(id => this.groupById(id)).filter((g): g is VizGroup => g !== null))) {
        if (!orderedChosen.find(x => x.id === g.id)) orderedChosen.push(g);
      }
      for (const cg of orderedChosen) {
        E.add(cg.id);
        this.evictUntilFits(E, this.lastUser ?? cg.id);
      }
      for (const g of this.sortedByPriorityAsc(this.groups)) {
        if (E.size >= this.capExpandedCount) break;
        if (E.has(g.id)) continue;
        const t = new Set(E);
        t.add(g.id);
        if (this.totalWidthForExpandedSet(t) <= this.availableWidth()) E = t;
      }
      if (E.size === 0) E.add(this.sortedByPriorityAsc(this.groups)[0].id);
      for (const id of E) {
        const g = this.groupById(id);
        if (g) g.el.classList.add('expanded');
      }
    }

    scrollGroupIntoView(groupEl: HTMLElement) {
      if (!this.viewport.classList.contains('constrained')) return;
      const vp = this.viewport;
      const vpR = vp.getBoundingClientRect();
      const elR = groupEl.getBoundingClientRect();
      if (elR.left >= vpR.left && elR.right <= vpR.right) return;
      const ld = elR.left - vpR.left;
      const rd = elR.right - vpR.right;
      let t = vp.scrollLeft;
      if (ld < 0) t += ld - 16;
      else if (rd > 0) t += rd + 16;
      vp.scrollTo({ left: t, behavior: 'smooth' });
    }

    updateOverflowAffordances() {
      const vp = this.viewport;
      const hasOverflow = vp.classList.contains('constrained') && (vp.scrollWidth > vp.clientWidth + 1);
      if (!hasOverflow) {
        vp.classList.remove('hasLeftOverflow', 'hasRightOverflow');
        return;
      }
      vp.classList.toggle('hasLeftOverflow', vp.scrollLeft > 2);
      vp.classList.toggle('hasRightOverflow', vp.scrollLeft < (vp.scrollWidth - vp.clientWidth - 2));
    }

    destroy() {
      this.ro.disconnect();
    }
  }

  let showPerBandCurves = false;
  let spectrumMode: 'pre' | 'post' = 'pre'; // pre or post (no off mode)
  
  // MVP-16: Analyzer controls
  let smoothingMode: SmoothingMode = '1/6'; // Default: 1/6 octave per spec
  let showSTA = true; // Default ON per spec
  let showLTA = false; // Default OFF per spec
  let showPeak = false; // Default OFF per spec
  
  // Derived: overlay is enabled if at least one series is on
  $: overlayEnabled = showSTA || showLTA || showPeak;
  
  // Derived: spectrum visualization needed (analyzer OR heatmap)
  $: spectrumVizEnabled = overlayEnabled || heatmapEnabled;
  
  let analyzerOpacity = 0.5; // 0-1 range (default 50%)
  let peakHoldTime = 2.0; // seconds (default 2.0, range 1.0-5.0)
  let peakDecayRate = 12; // dB/s (default 12, range 6-24)
  
  // MVP-30: Heatmap controls
  let heatmapEnabled = false; // Default: OFF
  let heatmapMaskMode: HeatmapMaskMode = 'full'; // Default: full
  let heatmapHighPrecision = false; // Default: OFF
  
  // MVP-30: Heatmap dB range tuning (for better contrast)
  const heatmapMinDb = -85; // Floor for normalized mapping (tweak for more/less contrast)
  const heatmapMaxDb = -10; // Ceiling for normalized mapping (tweak for punch)
  
  // MVP-30: Heatmap visual tuning parameters (exposed via settings popover)
  let heatmapAlphaGamma = 2.8; // Contrast (0.8-4.0)
  let heatmapMagnitudeGain = 2.5; // Gain (0.5-4.0)
  let heatmapGateThreshold = 0.05; // Gate (0.0-0.20)
  let heatmapMaxAlpha = 0.95; // Max opacity (0.2-1.0)
  
  // MVP-30: Heatmap settings popover state
  let heatmapSettingsOpen = false;
  let heatmapSettingsButtonEl: HTMLButtonElement | null = null;
  let heatmapSettingsButtonLeft = 0;
  let heatmapSettingsButtonRight = 0;
  let heatmapSettingsButtonCenterY = 0;
  
  // MVP-14: Focus mode and visualization controls
  let showBandwidthMarkers = true; // Default: ON per spec
  let bandFillOpacity = 0.4; // Default: 40% per spec
  let isActivelyEditing = false; // Track active editing state
  let editingTimeoutId: number | null = null;
  
  // Track initialization state
  let eqInitialized = false;
  
  // MVP-16: Spectrum analyzer + rendering
  let canvasElement: HTMLCanvasElement;
  let spectrumRenderer: SpectrumCanvasRenderer | null = null;
  let analyzerLayer: SpectrumAnalyzerLayer | null = null;
  let heatmapLayer: SpectrumHeatmapLayer | null = null; // MVP-30
  let analyzer: SpectrumAnalyzer | null = null;
  let spectrumPollingInterval: number | null = null;
  let lastSpectrumFrame: number = 0;
  const SPECTRUM_POLL_INTERVAL = 100; // 10 Hz (base, overridden by high precision)
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
  let resizeObserver: ResizeObserver | null = null;
  
  // VizLayoutManager refs
  let vizHostEl: HTMLDivElement;
  let vizViewportEl: HTMLDivElement;
  let vizStripEl: HTMLDivElement;
  let vizLayoutManager: VizLayoutManager | null = null;
  
  // Load persisted viz options on mount
  onMount(() => {
    const saved = loadVizOptions();
    
    // Restore all persisted settings
    spectrumMode = saved.spectrumMode;
    smoothingMode = saved.smoothingMode;
    showSTA = saved.showSTA;
    showLTA = saved.showLTA;
    showPeak = saved.showPeak;
    showPerBandCurves = saved.showPerBandCurves;
    showBandwidthMarkers = saved.showBandwidthMarkers;
    bandFillOpacity = saved.bandFillOpacity;
    heatmapEnabled = saved.heatmapEnabled;
    heatmapMaskMode = saved.heatmapMaskMode;
    heatmapHighPrecision = saved.heatmapHighPrecision;
    heatmapAlphaGamma = saved.heatmapAlphaGamma;
    heatmapMagnitudeGain = saved.heatmapMagnitudeGain;
    heatmapGateThreshold = saved.heatmapGateThreshold;
    heatmapMaxAlpha = saved.heatmapMaxAlpha;
    
    console.log('Loaded viz options from localStorage');
  });
  
  // Lifecycle: Initialize VizLayoutManager for collapsible viz-options
  onMount(() => {
    if (vizHostEl && vizViewportEl && vizStripEl) {
      const gCurvesEl = document.getElementById('g_curves');
      const gSmoothEl = document.getElementById('g_smooth');
      const gHeatmapEl = document.getElementById('g_heatmap');
      const gTapEl = document.getElementById('g_tap');
      const gTokensEl = document.getElementById('g_tokens');
      
      if (gCurvesEl && gSmoothEl && gHeatmapEl && gTapEl && gTokensEl) {
        const groups: VizGroup[] = [
          { id: 'g_tap', priority: 4, expandedWidth: 256, el: gTapEl },
          { id: 'g_curves', priority: 1, expandedWidth: 200, el: gCurvesEl },
          { id: 'g_smooth', priority: 2, expandedWidth: 190, el: gSmoothEl },
          { id: 'g_heatmap', priority: 3, expandedWidth: 210, el: gHeatmapEl },
          { id: 'g_tokens', priority: 5, expandedWidth: 230, el: gTokensEl },
        ];
        
        vizLayoutManager = new VizLayoutManager(
          vizHostEl,
          vizViewportEl,
          vizStripEl,
          groups,
          { stubWidth: 44 }
        );
        console.log('VizLayoutManager initialized');
        
        // Drag-to-scroll: only captures after movement threshold to preserve stub clicks
        let down = false;
        let dragging = false;
        let startX = 0;
        let startScroll = 0;
        let pointerId: number | null = null;
        const THRESHOLD = 4;
        
        const handlePointerDown = (e: PointerEvent) => {
          if (!vizViewportEl.classList.contains('constrained')) return;
          down = true;
          dragging = false;
          startX = e.clientX;
          startScroll = vizViewportEl.scrollLeft;
          pointerId = e.pointerId;
        };
        
        const handlePointerMove = (e: PointerEvent) => {
          if (!down) return;
          if (!dragging && Math.abs(e.clientX - startX) > THRESHOLD) {
            dragging = true;
            if (pointerId !== null) {
              vizViewportEl.setPointerCapture(pointerId);
            }
          }
          if (dragging) {
            vizViewportEl.scrollLeft = startScroll - (e.clientX - startX);
          }
        };
        
        const handlePointerUp = (e: PointerEvent) => {
          down = false;
          dragging = false;
          try {
            vizViewportEl.releasePointerCapture(e.pointerId);
          } catch {}
        };
        
        const handlePointerCancel = () => {
          down = false;
          dragging = false;
        };
        
        vizViewportEl.addEventListener('pointerdown', handlePointerDown);
        vizViewportEl.addEventListener('pointermove', handlePointerMove);
        vizViewportEl.addEventListener('pointerup', handlePointerUp);
        vizViewportEl.addEventListener('pointercancel', handlePointerCancel);
        
        // Wheel pan: convert vertical wheel to horizontal scroll when constrained
        const handleWheel = (e: WheelEvent) => {
          if (!vizViewportEl.classList.contains('constrained')) return;
          if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
          if (vizViewportEl.scrollWidth <= vizViewportEl.clientWidth + 1) return;
          e.preventDefault();
          vizViewportEl.scrollLeft += e.deltaY;
        };
        
        vizViewportEl.addEventListener('wheel', handleWheel, { passive: false });
        
        // Cleanup
        return () => {
          vizViewportEl.removeEventListener('pointerdown', handlePointerDown);
          vizViewportEl.removeEventListener('pointermove', handlePointerMove);
          vizViewportEl.removeEventListener('pointerup', handlePointerUp);
          vizViewportEl.removeEventListener('pointercancel', handlePointerCancel);
          vizViewportEl.removeEventListener('wheel', handleWheel);
        };
      }
    }
  });
  
  // Lifecycle: Initialize canvas renderer + analyzer
  onMount(() => {
    // Initialize analyzer with peak hold config
    analyzer = new SpectrumAnalyzer({
      holdTimeMs: peakHoldTime * 1000,
      decayRateDbPerSec: peakDecayRate,
    });
    
    // Initialize canvas renderer with heatmap + analyzer layers
    if (canvasElement) {
      // MVP-30: Heatmap layer (rendered first, so curves appear on top)
      heatmapLayer = new SpectrumHeatmapLayer({
        enabled: heatmapEnabled,
        maskMode: heatmapMaskMode,
        primarySeries: null,
      });
      
      analyzerLayer = new SpectrumAnalyzerLayer({
        showSTA,
        showLTA,
        showPeak,
      });
      
      spectrumRenderer = new SpectrumCanvasRenderer(canvasElement, [heatmapLayer, analyzerLayer]);
      spectrumRenderer.resize(plotWidth, plotHeight);
    }
    
    // Setup ResizeObserver for plot element
    if (plotElement) {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          plotWidth = entry.contentRect.width;
          plotHeight = entry.contentRect.height;
          
          // Resize spectrum canvas
          if (spectrumRenderer) {
            spectrumRenderer.resize(plotWidth, plotHeight);
          }
        }
      });
      resizeObserver.observe(plotElement);
    }
    
    // Track shift key for cursor feedback and Escape to deselect
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
  
  // Reactive: Update analyzer config when controls change
  $: if (analyzer) {
    analyzer.updateConfig({
      holdTimeMs: peakHoldTime * 1000,
      decayRateDbPerSec: peakDecayRate,
    });
  }
  
  // Reactive: Update analyzer layer visibility
  $: if (analyzerLayer) {
    analyzerLayer.setConfig({
      showLive: false, // Never show raw live (use STA instead)
      showSTA,
      showLTA,
      showPeak,
    });
  }
  
  // MVP-30: Reactive: Update analyzer time constants for high precision mode
  $: if (analyzer && heatmapHighPrecision) {
    const tau = getEffectiveAnalyzerTau(heatmapHighPrecision);
    analyzer.updateConfig({
      ...analyzer.getConfig(),
      tauShort: tau.tauShort,
      tauLong: tau.tauLong,
    });
  }
  
  // MVP-30: Reactive: Update heatmap layer config (including visual tuning)
  $: if (heatmapLayer) {
    heatmapLayer.setConfig({
      enabled: heatmapEnabled,
      maskMode: heatmapMaskMode,
      primarySeries: null, // Updated in pollSpectrum
      visualTuning: {
        minAlpha: 0.0,
        maxAlpha: heatmapMaxAlpha,
        alphaGamma: heatmapAlphaGamma,
        colorGamma: 1.2,
        gateThreshold: heatmapGateThreshold,
        gateSoftness: 0.03,
        magnitudeGain: heatmapMagnitudeGain,
        darkOrange: { r: 180, g: 80, b: 20 },
        brightOrange: { r: 255, g: 140, b: 40 },
      },
    });
  }
  
  onDestroy(() => {
    // Clean up VizLayoutManager
    if (vizLayoutManager) {
      vizLayoutManager.destroy();
      vizLayoutManager = null;
    }
    
    // Clean up polling interval
    if (spectrumPollingInterval !== null) {
      clearInterval(spectrumPollingInterval);
    }
    
    // Clean up ResizeObserver
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    
    // Note: We don't disconnect the global DSP instance here
    // It persists across page navigation
  });
  
  // Reactive: Start/stop spectrum polling based on spectrumVizEnabled and spectrum socket readiness
  $: {
    // Add reactive dependency on connectionState so this block re-runs after auto-connect
    const state = $connectionState;
    const dsp = getDspInstance();
    const isReady = state === 'connected' && dsp?.isSpectrumSocketOpen();
    
    if (spectrumVizEnabled && isReady && !spectrumPollingInterval) {
      // Start polling (use high precision interval if enabled)
      const pollInterval = getEffectivePollInterval(heatmapHighPrecision);
      spectrumPollingInterval = window.setInterval(pollSpectrum, pollInterval);
      console.log('Spectrum polling started', { pollInterval, highPrecision: heatmapHighPrecision });
    } else if ((!spectrumVizEnabled || !isReady) && spectrumPollingInterval !== null) {
      // Stop polling when spectrum viz disabled OR spectrum socket not ready
      clearInterval(spectrumPollingInterval);
      spectrumPollingInterval = null;
      
      // Clear canvas
      if (spectrumRenderer) {
        spectrumRenderer.clear();
      }
      console.log('Spectrum polling stopped', { spectrumVizEnabled, isReady });
    }
  }
  
  // MVP-16: Poll spectrum data, process through analyzer, and render
  async function pollSpectrum() {
    const dsp = getDspInstance();
    if (!dsp || !dsp.isSpectrumSocketOpen() || !spectrumRenderer || !analyzer || !analyzerLayer) return;
    
    try {
      const rawData = await dsp.getSpectrumData();
      const spectrumData = parseSpectrumData(rawData);
      
      if (spectrumData) {
        const nowMs = Date.now();
        lastSpectrumFrame = nowMs;
        
        // Apply fractional-octave smoothing (use effective mode for high precision)
        const effectiveSmoothing = getEffectiveSmoothing(smoothingMode, heatmapHighPrecision);
        const smoothedDb = smoothDbBins(spectrumData.binsDb, effectiveSmoothing);
        
        // Update analyzer state (STA/LTA/Peak computation)
        analyzer.update(smoothedDb, nowMs);
        
        // Get analyzer state
        const state = analyzer.getState();
        
        // Prepare series for rendering (convert dB to normalized [0..1])
        // For histogram curves: use default range (-100..0)
        const staNorm = state.staDb ? dbArrayToNormalized(state.staDb) : null;
        const ltaNorm = state.ltaDb ? dbArrayToNormalized(state.ltaDb) : null;
        const peakNorm = state.peakDb ? dbArrayToNormalized(state.peakDb) : null;
        
        // MVP-30: For heatmap: use custom dB range for better contrast
        const staHeatNorm = state.staDb ? dbArrayToNormalized(state.staDb, heatmapMinDb, heatmapMaxDb) : null;
        
        // Update analyzer layer with new series data
        analyzerLayer.setSeries({
          liveNorm: null, // Not used (we show STA instead of raw)
          staNorm,
          ltaNorm,
          peakNorm,
        });
        
        // MVP-30: Update heatmap layer with primary series for masking
        if (heatmapLayer) {
          const primarySeries = selectPrimarySeries(
            { showSTA, showLTA, showPeak },
            { staNorm, ltaNorm, peakNorm }
          );
          heatmapLayer.setConfig({
            primarySeries,
          });
        }
        
        // Render (pass heatmap bins with custom dB range to renderer)
        // Note: analyzerLayer ignores binsNormalized and uses internal series state
        spectrumRenderer.resetOpacity();
        spectrumRenderer.render(staHeatNorm || staNorm || [], {
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
  
  // MVP-16: Reset analyzer averages
  function resetAverages() {
    if (analyzer) {
      analyzer.resetAverages();
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
    // MVP-21: Block interaction with disabled bands
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
    // MVP-21: Block interaction with disabled bands
    const band = $bands[bandIndex];
    if (!band.enabled) {
      event.preventDefault();
      return;
    }
    
    event.preventDefault();
    
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
  function handleFaderDoubleClick(event: MouseEvent, bandIndex: number) {
    // MVP-21: Block interaction with disabled bands
    const band = $bands[bandIndex];
    if (!band.enabled) {
      event.preventDefault();
      return;
    }
    
    event.preventDefault();
    setBandGain(bandIndex, 0);
  }

  function handleFaderPointerDown(event: PointerEvent, bandIndex: number) {
    // MVP-21: Block interaction with disabled bands
    const band = $bands[bandIndex];
    if (!band.enabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    
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
    // MVP-21: Block interaction with disabled bands
    const band = $bands[bandIndex];
    if (!band.enabled) {
      event.stopPropagation();
      return;
    }
    
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

  // MVP-30: Heatmap settings popover handlers
  function handleHeatmapSettingsClick(event: MouseEvent) {
    event.stopPropagation();
    
    // Toggle: if already open, close it
    if (heatmapSettingsOpen) {
      heatmapSettingsOpen = false;
      return;
    }
    
    // Otherwise, open it with updated position
    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    
    heatmapSettingsButtonLeft = rect.left;
    heatmapSettingsButtonRight = rect.right;
    heatmapSettingsButtonCenterY = rect.top + rect.height / 2;
    heatmapSettingsOpen = true;
  }
  
  function handleHeatmapSettingsChange(event: CustomEvent<{
    maskMode?: HeatmapMaskMode;
    highPrecision?: boolean;
    alphaGamma?: number;
    magnitudeGain?: number;
    gateThreshold?: number;
    maxAlpha?: number;
  }>) {
    const changes = event.detail;
    
    if (changes.maskMode !== undefined) {
      heatmapMaskMode = changes.maskMode;
    }
    if (changes.highPrecision !== undefined) {
      heatmapHighPrecision = changes.highPrecision;
    }
    if (changes.alphaGamma !== undefined) {
      heatmapAlphaGamma = changes.alphaGamma;
    }
    if (changes.magnitudeGain !== undefined) {
      heatmapMagnitudeGain = changes.magnitudeGain;
    }
    if (changes.gateThreshold !== undefined) {
      heatmapGateThreshold = changes.gateThreshold;
    }
    if (changes.maxAlpha !== undefined) {
      heatmapMaxAlpha = changes.maxAlpha;
    }
  }
  
  function handleHeatmapSettingsClose() {
    heatmapSettingsOpen = false;
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
  
  // Persist viz options to localStorage (debounced)
  const debouncedSaveVizOptions = debounce((state: any) => {
    saveVizOptions(state);
  }, 200);
  
  $: {
    // Watch all viz-options variables and save changes
    const vizState = {
      version: 1,
      spectrumMode,
      smoothingMode,
      showSTA,
      showLTA,
      showPeak,
      showPerBandCurves,
      showBandwidthMarkers,
      bandFillOpacity,
      heatmapEnabled,
      heatmapMaskMode,
      heatmapHighPrecision,
      heatmapAlphaGamma,
      heatmapMagnitudeGain,
      heatmapGateThreshold,
      heatmapMaxAlpha,
    };
    
    debouncedSaveVizOptions(vizState);
  }
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
        <div class="eq-plot" bind:this={plotElement} on:click={handlePlotBackgroundClick} on:keydown={() => {}} role="button" tabindex="-1">
          <!-- Canvas spectrum layer (behind SVG) with ducking -->
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

      <!-- MVP-16: Visualization Options Bar -->
      <div class="viz-options-area">
      <div class="vizHost" id="vizHost" bind:this={vizHostEl}>
        <div class="vizViewport" id="vizViewport" bind:this={vizViewportEl} aria-label="Visualization options">
          <div class="edgeFade left"></div>
          <div class="edgeFade right"></div>
          
          <div class="vizStrip" id="vizStrip" bind:this={vizStripEl}>
            
        <!-- ===== SPECTRUM SIGNAL TAP ===== -->
        <div class="groupContainer expanded" id="g_tap" data-group="tap"
             data-sel={spectrumMode}
             style="--expandedWidth:256px">
          
          <!-- Glyph: line + block + two tap nodes, wired to data-sel -->
          <div class="stubGlyph">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <line class="glyphTapLine"  x1="3"  y1="12" x2="21" y2="12"/>
              <rect class="glyphTapBlock" x="9.5" y="9.5" width="5" height="5" rx="1"/>
              <circle class="glyphTapNode" data-pos="pre"  cx="6"  cy="12" r="3"/>
              <circle class="glyphTapNode" data-pos="post" cx="18" cy="12" r="3"/>
            </svg>
          </div>

          <div class="groupStub" role="button" tabindex="0" aria-label="Spectrum signal tap"></div>

          <div class="groupExpanded">
            <div class="groupTitle">Spectrum Signal Tap</div>
          <div class="sigTapGroup" data-sel={spectrumMode}>
            <svg class="sigTap" viewBox="0 0 190 50" width="190" height="50" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="tapGlow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="2.2" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            <!-- Signal path: left segment (dim base, active overlay) -->
            <line class="sigLine" x1="6" y1="30" x2="72" y2="30"/>
            <line class="sigSegActive pre" x1="6" y1="30" x2="72" y2="30"/>

            <!-- EQ processing block -->
            <rect class="eqBlock" x="72" y="20" width="46" height="20" rx="3"/>
            <!-- Tiny bell curve inside block to suggest parametric EQ -->
            <path class="eqBlockCurve" d="M76 30 C80 30 83 23 95 23 C107 23 110 30 114 30"/>
            <text class="eqBlockLabel" x="95" y="17">EQ</text>

            <!-- Signal path: right segment -->
            <line class="sigLine" x1="118" y1="30" x2="184" y2="30"/>
            <line class="sigSegActive post" x1="118" y1="30" x2="184" y2="30"/>

            <!-- PRE tap (x=42) — before EQ block -->
            <g class="tap" data-pos="pre" on:click={() => (spectrumMode = 'pre')} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && (spectrumMode = 'pre')}>
              <line class="tapStem" x1="42" y1="10" x2="42" y2="24.5"/>
              <circle class="tapNode" cx="42" cy="30" r="5.5"/>
              <circle class="tapHead" cx="42" cy="7" r="3.5"/>
              <text class="tapLabel" x="42" y="46">PRE</text>
            </g>

            <!-- POST tap (x=148) — after EQ block -->
            <g class="tap" data-pos="post" on:click={() => (spectrumMode = 'post')} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && (spectrumMode = 'post')}>
              <line class="tapStem" x1="148" y1="10" x2="148" y2="24.5"/>
              <circle class="tapNode" cx="148" cy="30" r="5.5"/>
              <circle class="tapHead" cx="148" cy="7" r="3.5"/>
              <text class="tapLabel" x="148" y="46">POST</text>
            </g>

            </svg>
          </div>
          </div><!-- end groupExpanded -->
        </div><!-- end g_tap groupContainer -->
        
        <!-- ===== SPECTRUM CURVES ===== -->
        <div class="groupContainer expanded" id="g_curves" data-group="curves"
             data-lta={showLTA ? 'on' : 'off'}
             data-sta={showSTA ? 'on' : 'off'}
             data-peak={showPeak ? 'on' : 'off'}
             style="--expandedWidth:200px">

          <!-- Glyph: 3 lines ordered Peak/STA/LTA (top to bottom), each wired to its toggle state -->
          <div class="stubGlyph">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <line class="glyphPeak" x1="4" y1="7"  x2="20" y2="7"  stroke="var(--amber)" stroke-width="1.9" stroke-linecap="round"/>
              <line class="glyphSta"  x1="4" y1="12" x2="20" y2="12" stroke="var(--lime)"  stroke-width="1.9" stroke-linecap="round"/>
              <line class="glyphLta"  x1="4" y1="17" x2="20" y2="17" stroke="var(--teal)"  stroke-width="1.9" stroke-linecap="round"/>
            </svg>
          </div>

          <div class="groupStub" role="button" tabindex="0" aria-label="Spectrum analyzer"></div>

          <div class="groupExpanded">
            <div class="groupTitle">Spectrum Curves</div>
          <div class="row">
            <div class="waveStack">
              <svg viewBox="0 0 120 24" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="ltaGrad" x1="0" y1="0" x2="120" y2="0" gradientUnits="userSpaceOnUse">
                  <stop offset="0%"   stop-color="#00b4cc"/>
                  <stop offset="50%"  stop-color="#00d4b8"/>
                  <stop offset="100%" stop-color="#0099bb"/>
                </linearGradient>
                <filter id="ltaGlow" x="-20%" y="-100%" width="140%" height="300%">
                  <feGaussianBlur stdDeviation="1.4" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                <pattern id="ltaWaveP" width="60" height="24" patternUnits="userSpaceOnUse">
                  <path d="M0 12 C10 12 10 8.5 15 8.5 S20 15.5 30 15.5 S40 8.5 45 8.5 S50 12 60 12"
                    stroke="url(#ltaGrad)" fill="none" stroke-width="1.6" stroke-linecap="round" opacity="0.85"/>
                  <animateTransform attributeName="patternTransform"
                    type="translate" from="0 0" to="-60 0" dur="9s" repeatCount="indefinite"/>
                </pattern>
                <linearGradient id="staGrad" x1="0" y1="0" x2="120" y2="0" gradientUnits="userSpaceOnUse">
                  <stop offset="0%"   stop-color="#7CFF00"/>
                  <stop offset="55%"  stop-color="#a8ff00"/>
                  <stop offset="100%" stop-color="#c6f000"/>
                </linearGradient>
                <filter id="staGlow" x="-20%" y="-120%" width="140%" height="340%">
                  <feGaussianBlur stdDeviation="2.0" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                <pattern id="staWaveP" width="40" height="24" patternUnits="userSpaceOnUse">
                  <path d="M0 12 C4 12 5 5 10 5 S16 19 20 19 S26 5 30 5 S36 12 40 12"
                    stroke="url(#staGrad)" fill="none" stroke-width="2" stroke-linecap="round"/>
                  <animateTransform attributeName="patternTransform"
                    type="translate" from="0 0" to="-40 0" dur="4.5s" repeatCount="indefinite"/>
                </pattern>
                <linearGradient id="peakGrad" x1="0" y1="0" x2="120" y2="0" gradientUnits="userSpaceOnUse">
                  <stop offset="0%"   stop-color="#e6c200"/>
                  <stop offset="45%"  stop-color="#f0a800"/>
                  <stop offset="100%" stop-color="#d4b800"/>
                </linearGradient>
                <filter id="peakGlow" x="-20%" y="-140%" width="140%" height="380%">
                  <feGaussianBlur stdDeviation="2.4" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                <pattern id="peakWaveP" width="40" height="24" patternUnits="userSpaceOnUse">
                  <path d="M0 10 L5 7 L8 11 L11 4 L14 9 L18 6 L21 12 L25 5 L29 9 L32 6 L36 10 L40 9"
                    stroke="url(#peakGrad)" fill="none" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
                  <animateTransform attributeName="patternTransform"
                    type="translate" from="0 0" to="-40 0" dur="2.8s" repeatCount="indefinite"/>
                </pattern>
              </defs>

              <line class="waveFlat" x1="2" y1="12" x2="118" y2="12"/>
              <rect class="ltaFill"  x="2" y="0" width="116" height="24" fill="url(#ltaWaveP)"  filter="url(#ltaGlow)"/>
              <rect class="staFill"  x="2" y="0" width="116" height="24" fill="url(#staWaveP)"  filter="url(#staGlow)"/>
              <rect class="peakFill" x="2" y="0" width="116" height="24" fill="url(#peakWaveP)" filter="url(#peakGlow)"/>
              </svg>
            </div>

            <button class="chip waveSwitch" data-on={showLTA} data-mode="lta" on:click={() => (showLTA = !showLTA)}>LTA</button>
            <button class="chip waveSwitch" data-on={showSTA} data-mode="sta" on:click={() => (showSTA = !showSTA)}>STA</button>
            <button class="chip waveSwitch" data-on={showPeak} data-mode="peak" on:click={() => (showPeak = !showPeak)}>Peak</button>
            <button class="button button--icon" id="resetBtn" aria-label="Reset averages" title="Reset" on:click={resetAverages}>
              <svg class="resetIcon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M20 12a8 8 0 1 1-2.1-5.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M19.8 3.8v3.9h-3.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M7 14h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>
                <path d="M8 11c1 0 1 .9 2 .9s1-1.8 2-1.8 1 1.8 2 1.8 1-.9 2-.9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>
              </svg>
            </button>
          </div>
          </div><!-- end groupExpanded -->
        </div><!-- end g_curves groupContainer -->
        
        <!-- ===== CURVE SMOOTHING ===== -->
        <div class="groupContainer expanded" id="g_smooth" data-group="smooth"
             data-smooth={smoothingMode === 'off' ? '0' : smoothingMode === '1/12' ? '1' : smoothingMode === '1/6' ? '2' : '3'}
             style="--expandedWidth:190px">

          <!-- Glyph: 4 paths, one per smoothing level, wired to data-smooth -->
          <div class="stubGlyph">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <!-- Off: jagged -->
              <path class="gSmooth" data-level="0" d="M4 12 L7 8 L10 15 L13 8 L16 14 L20 12"/>
              <!-- 1/12 Oct: slight curves -->
              <path class="gSmooth" data-level="1" d="M4 14 C6 14 7 8 10 8 S14 14 17 14 S19 11 20 11"/>
              <!-- 1/6 Oct: moderate -->
              <path class="gSmooth" data-level="2" d="M4 14 C7 14 8 7 12 7 S17 14 20 14"/>
              <!-- 1/3 Oct: very smooth -->
              <path class="gSmooth" data-level="3" d="M4 12 C9 5 15 18 20 12"/>
            </svg>
          </div>

          <div class="groupStub" role="button" tabindex="0" aria-label="Curve smoothing"></div>

          <div class="groupExpanded">
            <div class="groupTitle">Curve Smoothing</div>
          <div class="row">
            <button class="chip option" class:active={smoothingMode === 'off'} on:click={() => (smoothingMode = 'off')}>Off</button>
            <button class="chip option" class:active={smoothingMode === '1/12'} on:click={() => (smoothingMode = '1/12')}>1/12 Oct</button>
            <button class="chip option" class:active={smoothingMode === '1/6'} on:click={() => (smoothingMode = '1/6')}>1/6 Oct</button>
            <button class="chip option" class:active={smoothingMode === '1/3'} on:click={() => (smoothingMode = '1/3')}>1/3 Oct</button>
          </div>
          </div><!-- end groupExpanded -->
        </div><!-- end g_smooth groupContainer -->

        <!-- ===== HEATMAP ===== -->
        <div class="groupContainer expanded" id="g_heatmap" data-group="heatmap"
             data-power={heatmapEnabled ? 'on' : 'off'}
             style="--expandedWidth:210px">

          <!-- Glyph: ring wired to data-power -->
          <div class="stubGlyph">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <circle class="glyphRingMetal" cx="12" cy="12" r="7"   stroke="#5a6370"       fill="none" stroke-width="1.6"/>
              <circle class="glyphRingNeon"  cx="12" cy="12" r="7"   stroke="var(--green)"  fill="none" stroke-width="1.3"/>
              <circle class="glyphDot"       cx="12" cy="12" r="2.5"/>
            </svg>
          </div>

          <div class="groupStub" role="button" tabindex="0" aria-label="Heatmap"></div>

          <div class="groupExpanded">
            <div class="groupTitle">Heatmap</div>
          <div class="row">
            <button class="heatmapToggle" on:click={() => (heatmapEnabled = !heatmapEnabled)}>
              <div class="halo">
                <svg width="30" height="30" viewBox="0 0 64 64">
                <defs>
                  <radialGradient id="metalGrad" cx="28%" cy="22%" r="72%" fx="28%" fy="22%">
                    <stop offset="0%"   stop-color="#8a96a3" stop-opacity=".55"/>
                    <stop offset="30%"  stop-color="#5a6370" stop-opacity=".38"/>
                    <stop offset="70%"  stop-color="#2e343c" stop-opacity=".28"/>
                    <stop offset="100%" stop-color="#1c2028" stop-opacity=".22"/>
                  </radialGradient>
                  <linearGradient id="neonGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%"   stop-color="#5affa0"/>
                    <stop offset="50%"  stop-color="#39ff8f"/>
                    <stop offset="100%" stop-color="#00e06b"/>
                  </linearGradient>
                  <radialGradient id="bloomGrad" cx="50%" cy="50%" r="50%">
                    <stop offset="0%"   stop-color="#39ff8f" stop-opacity=".22"/>
                    <stop offset="55%"  stop-color="#39ff8f" stop-opacity=".07"/>
                    <stop offset="100%" stop-color="#39ff8f" stop-opacity="0"/>
                  </radialGradient>
                  <filter id="neonGlow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="1.5" result="blur"/>
                    <feMerge>
                      <feMergeNode in="blur"/>
                      <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                  </filter>
                </defs>
                <circle class="bloom"      cx="32" cy="32" r="28" fill="url(#bloomGrad)"/>
                <circle class="ring-metal" cx="32" cy="32" r="18" stroke="url(#metalGrad)" stroke-width="1.8" fill="none"/>
                <circle class="ring-neon"  cx="32" cy="32" r="18" stroke="url(#neonGrad)"  stroke-width="1.4" fill="none" filter="url(#neonGlow)"/>
                <circle class="dot"        cx="32" cy="32" r="3.5"/>
                </svg>
              </div>
              <span class="powerLabel">On / Off</span>
            </button>

            <button 
              class="chip disclosureChip" 
              data-open={heatmapSettingsOpen}
              disabled={!heatmapEnabled}
              bind:this={heatmapSettingsButtonEl}
              on:click={handleHeatmapSettingsClick}
              title="Heatmap settings"
              aria-label="Heatmap settings"
            >
              <span>Prefs</span>
              <span class="arrow">▲</span>
            </button>
          </div>
          </div><!-- end groupExpanded -->
        </div><!-- end g_heatmap groupContainer -->

        <!-- ===== TOKEN VISUALS ===== -->
        <div class="groupContainer expanded" id="g_tokens" data-group="tokens"
             style="--expandedWidth:230px">

          <!-- Glyph: dot + curve + tick marks suggesting EQ visualization -->
          <div class="stubGlyph">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <!-- Small curve -->
              <path d="M4 16 Q8 8 12 12 T20 10" fill="none" stroke="var(--indigo)" stroke-width="1.8" stroke-linecap="round"/>
              <!-- Center dot (token) -->
              <circle cx="12" cy="12" r="2.5" fill="var(--indigo)"/>
              <!-- Bandwidth tick marks -->
              <line x1="8" y1="18" x2="8" y2="20" stroke="var(--indigo)" stroke-width="1.5" stroke-linecap="round"/>
              <line x1="16" y1="18" x2="16" y2="20" stroke="var(--indigo)" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>

          <div class="groupStub" role="button" tabindex="0" aria-label="Token visuals"></div>

          <div class="groupExpanded">
            <div class="groupTitle">Token Visuals</div>
            <div class="row">
              <button 
                class="chip option" 
                class:active={showPerBandCurves}
                aria-pressed={showPerBandCurves}
                on:click={() => (showPerBandCurves = !showPerBandCurves)}
              >
                Per-band
              </button>
              <button 
                class="chip option" 
                class:active={showBandwidthMarkers}
                aria-pressed={showBandwidthMarkers}
                on:click={() => (showBandwidthMarkers = !showBandwidthMarkers)}
              >
                BW
              </button>
              <span class="knob-wrapper-inline" style="--knob-arc: var(--indigo);">
                <KnobDial 
                  value={bandFillOpacity}
                  min={0}
                  max={1}
                  scale="linear"
                  size={20}
                  on:change={(e) => (bandFillOpacity = Math.max(0, Math.min(1, e.detail.value)))}
                />
              </span>
            </div>
          </div><!-- end groupExpanded -->
        </div><!-- end g_tokens groupContainer -->

          </div><!-- end vizStrip -->
        </div><!-- end vizViewport -->
      </div><!-- end vizHost -->
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

            <div class="order-icon" style="visibility: hidden;">
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
                    on:dblclick={(e) => { e.preventDefault(); setPreampGain(0); }}
                    role="slider"
                    tabindex="-1"
                    aria-label="Preamp gain"
                    aria-valuemin={-24}
                    aria-valuemax={24}
                    aria-valuenow={$preampGain}
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
              <button
                type="button"
                class="filter-type-icon"
                aria-label="Change filter type for band {i + 1} — {band.type}"
                title="Band {i + 1} — {band.type}"
                on:click={(e) => handleFilterIconClick(e, i)}
              >
                <FilterIcon type={band.type} />
              </button>

              <div class="order-icon">
                <BandOrderIcon position={$bandOrderNumbers[i] ?? (i + 1)} title={$filterNames[i]} />
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
                      on:dblclick={(e) => handleFaderDoubleClick(e, i)}
                      role="slider"
                      tabindex="-1"
                      aria-label="Band {i + 1} gain"
                      aria-valuemin={-24}
                      aria-valuemax={24}
                      aria-valuenow={band.gain}
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

              <div class="knob-wrapper" class:disabled={!band.enabled}>
                <KnobDial 
                  value={band.freq} 
                  mode="frequency" 
                  size={19} 
                  on:change={(e) => band.enabled && setBandFreq(i, e.detail.value)}
                />
              </div>

              <div class="knob-wrapper" class:disabled={!band.enabled}>
                <KnobDial 
                  value={band.q} 
                  mode="q" 
                  size={19}
                  on:change={(e) => band.enabled && setBandQ(i, e.detail.value)}
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
  
  <!-- MVP-30: Heatmap settings popover -->
  {#if heatmapSettingsOpen}
    <HeatmapSettings
      maskMode={heatmapMaskMode}
      highPrecision={heatmapHighPrecision}
      alphaGamma={heatmapAlphaGamma}
      magnitudeGain={heatmapMagnitudeGain}
      gateThreshold={heatmapGateThreshold}
      maxAlpha={heatmapMaxAlpha}
      anchorEl={heatmapSettingsButtonEl}
      buttonLeft={heatmapSettingsButtonLeft}
      buttonRight={heatmapSettingsButtonRight}
      buttonCenterY={heatmapSettingsButtonCenterY}
      on:change={handleHeatmapSettingsChange}
      on:close={handleHeatmapSettingsClose}
    />
  {/if}
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

  /* Left side: participates in parent's 3 rows */
  .eq-left {
    display: grid;
    grid-template-rows: subgrid;
    grid-row: 1 / span 3;
    min-height: 0;
    min-width: 0;
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
    overflow: hidden;
  }

  .band-grid {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: subgrid;
    grid-row: 1 / span 3;
    gap: 0.375rem;
    height: 100%;
    width: 100%;
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
    min-width: 0;
  }

  .viz-options-spacer {
    /* Empty gutter column to align with plot area */
  }

  .option-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .option-group label,
  .option-group .option-label {
    color: var(--ui-text-muted);
    font-size: 0.875rem;
  }

  .option-group button:not(.heatmap-settings-btn) {
    padding: 0.375rem 0.75rem;
    background: transparent;
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    color: var(--ui-text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .option-group button:not(.heatmap-settings-btn):hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .option-group button:not(.heatmap-settings-btn).active {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.25);
    color: var(--ui-text);
  }
  
  
  /* MVP-16: Analyzer controls */
  .option-group select {
    padding: 0.25rem 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    color: var(--ui-text-muted);
    font-size: 0.875rem;
    cursor: pointer;
  }
  
  .option-group select:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.2);
  }

  /* MVP-15: Spectrum selector - vertical stacked image buttons */
  .spectrum-selector {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .spectrum-button {
    padding: 0;
    width: 80px;
    height: 32px;
    background: transparent;
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .spectrum-button img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .spectrum-button:hover {
    border-color: rgba(255, 255, 255, 0.3);
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.1);
  }

  .spectrum-button.active {
    border-color: rgba(255, 255, 255, 0.45);
    box-shadow: 0 0 12px rgba(255, 255, 255, 0.15);
  }
  
  .spectrum-button.dimmed {
    opacity: 0.4;
  }
  
  /* MVP-16: Analyzer grid (2x2 layout) */
  .analyzer-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    grid-template-rows: repeat(2, 1fr);
    gap: 4px;
  }
  
  .analyzer-btn {
    width: 100%;
    height: 32px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 48px;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  
  .analyzer-btn.active {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
    color: var(--ui-text);
  }
  
  .analyzer-btn.reset-btn {
    font-size: 1.25rem;
  }

  /* MVP-30: Heatmap mask buttons */
  .heatmap-mask-buttons {
    display: flex;
    gap: 4px;
  }

  .mask-btn {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    min-width: 48px;
  }

  .mask-btn.dimmed {
    opacity: 0.4;
  }

  .mask-btn:disabled {
    cursor: not-allowed;
  }

  /* MVP-30: Heatmap settings button */
  .heatmap-settings-btn {
    width: 1.8rem;
    height: 1.8rem;
    padding: 0;
    display: grid;
    place-items: center;
    font-size: 1rem;
    line-height: 1;
    background: transparent;
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    color: var(--ui-text-muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .heatmap-settings-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.15);
    color: var(--ui-text);
  }

  .heatmap-settings-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .settings-icon {
    width: 0.9rem;
    height: 0.9rem;
    display: block;
    stroke: currentColor;
    fill: none;
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
    padding-top: 1.5rem;
  }

  .band-column[data-enabled='false'] {
    opacity: 0.5;
  }
  
  .band-column[data-enabled='false'] .fader-track {
    pointer-events: none;
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
    background: transparent;
    border: 0;
    padding: 0;
    color: inherit;
  }
  
  .band-column[data-enabled='false'] .filter-type-icon {
    pointer-events: none;
  }

  .order-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 21px;
    height: 21px;
    cursor: pointer;
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
  
  .knob-wrapper.disabled {
    pointer-events: none;
    opacity: 0.5;
  }

  .knob-wrapper-inline {
    display: inline-flex;
    align-items: center;
    justify-content: center;
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

  /* ====== VIZ-OPTIONS: DEMO DESIGN SYSTEM ====== */
  /* Scoped styling for the collapsible group controls */

  .groupExpanded .row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* Shared chip base for waveSwitch, option, and disclosureChip */
  .chip {
    padding: 3px 8px;
    border: 1px solid var(--ui-border);
    border-radius: 5px;
    font-size: 11px;
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
    background: transparent;
    color: var(--ui-text-muted);
    transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
  }

  /* Wave stack SVG container */
  .waveStack {
    flex-shrink: 0;
  }

  .waveStack svg {
    width: 56px;
    height: 20px;
    display: block;
  }

  .waveFlat {
    stroke: #5f6b7a;
    stroke-width: 1.5;
    transition: opacity 0.2s ease;
  }

  .ltaFill,
  .staFill,
  .peakFill {
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  #g_curves[data-lta="on"] .ltaFill {
    opacity: 1;
  }

  #g_curves[data-sta="on"] .staFill {
    opacity: 1;
  }

  #g_curves[data-peak="on"] .peakFill {
    opacity: 1;
  }

  #g_curves[data-lta="on"] .waveFlat,
  #g_curves[data-sta="on"] .waveFlat,
  #g_curves[data-peak="on"] .waveFlat {
    opacity: 0;
  }

  /* Wave toggle buttons (LTA/STA/Peak) */
  .waveSwitch {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  /* Per-mode hover tints */
  .waveSwitch[data-mode="lta"]:hover {
    border-color: #1a6060;
    background: rgba(0, 212, 184, 0.06);
  }

  .waveSwitch[data-mode="sta"]:hover {
    border-color: #3d5a00;
    background: rgba(168, 255, 0, 0.06);
  }

  .waveSwitch[data-mode="peak"]:hover {
    border-color: #604010;
    background: rgba(240, 168, 0, 0.06);
  }

  /* Active states */
  .waveSwitch[data-on="true"][data-mode="lta"] {
    border-color: #00d4b8;
    color: #b0fff4;
  }

  .waveSwitch[data-on="true"][data-mode="sta"] {
    border-color: #a8ff00;
    color: #eaffd0;
  }

  .waveSwitch[data-on="true"][data-mode="peak"] {
    border-color: #f0a800;
    color: #fff3cc;
  }

  /* Smoothing option chips */
  .option:hover {
    border-color: #1a5c3a;
    background: rgba(0, 255, 163, 0.06);
  }

  .option.active {
    border-color: #00ffa3;
    color: #eafff5;
  }

  /* Reset button (filled surface style) */
  .button {
    background: var(--ui-panel-2);
    padding: 4px 7px;
    border-radius: 5px;
    cursor: pointer;
    user-select: none;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s ease;
    font-size: 11px;
    white-space: nowrap;
    border: none;
    color: var(--ui-text-muted);
  }

  .button:hover {
    background: #3a424c;
  }

  .button.button--icon {
    padding: 3px 8px;
    min-width: 0;
    width: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    border: none;
    outline: none;
    font: inherit;
    -webkit-appearance: none;
    appearance: none;
  }

  .resetIcon {
    display: block;
    color: #6f7a86;
    transition: color 0.2s ease, filter 0.2s ease;
  }

  .button.button--icon:hover .resetIcon {
    color: #c8d1db;
    filter: drop-shadow(0 0 4px rgba(0, 255, 163, 0.25));
  }

  .button.button--icon:active .resetIcon {
    filter: drop-shadow(0 0 6px rgba(0, 255, 163, 0.35));
  }

  /* Disclosure chip (Heatmap Prefs) */
  .disclosureChip {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .disclosureChip:hover:not(:disabled) {
    border-color: #4a5260;
  }

  .disclosureChip[data-open="true"] {
    border-color: #39ff8f;
    color: #caffea;
  }

  .disclosureChip:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .disclosureChip .arrow {
    font-size: 10px;
    opacity: 0.7;
    transition: transform 0.2s ease, opacity 0.2s ease;
  }

  .disclosureChip[data-open="true"] .arrow {
    transform: rotate(180deg);
    opacity: 1;
  }

  /* Heatmap power toggle */
  .heatmapToggle {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    cursor: pointer;
    background: transparent;
    border: none;
    padding: 0;
    color: inherit;
  }

  .heatmapToggle:hover .ring-metal {
    stroke: #7a8a90;
  }

  .heatmapToggle:hover .powerLabel {
    color: #2a7a50;
  }

  .halo {
    user-select: none;
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .halo svg {
    display: block;
  }

  .halo .bloom {
    opacity: 0;
    transition: opacity 0.35s ease;
  }

  #g_heatmap[data-power="on"] .halo .bloom {
    opacity: 1;
    animation: haloPulse 2.8s ease-in-out infinite;
  }

  @keyframes haloPulse {
    0% {
      opacity: 0.5;
      transform: scale(0.95);
    }
    50% {
      opacity: 1;
      transform: scale(1.08);
    }
    100% {
      opacity: 0.5;
      transform: scale(0.95);
    }
  }

  .halo .ring-neon {
    opacity: 0;
    transition: opacity 0.35s ease;
  }

  #g_heatmap[data-power="on"] .halo .ring-neon {
    opacity: 1;
  }

  .halo .ring-metal {
    transition: opacity 0.35s ease, stroke 0.2s ease;
  }

  #g_heatmap[data-power="on"] .halo .ring-metal {
    opacity: 0;
  }

  .halo .dot {
    fill: #4a5260;
    transition: fill 0.35s ease;
  }

  #g_heatmap[data-power="on"] .halo .dot {
    fill: #39ff8f;
  }

  .powerLabel {
    font-size: 11px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #6b7785;
    line-height: 1;
    transition: color 0.35s ease;
  }

  #g_heatmap[data-power="on"] .powerLabel {
    color: #39ff8f;
  }

  /* ====== VIZ HOST / VIEWPORT / STRIP ====== */
  .vizHost {
    height: 120px;
    position: relative;
    min-width: 0;
    width: 100%;
  }

  .vizViewport {
    position: relative;
    height: 100%;
    border: 1px solid var(--ui-border);
    border-radius: 10px;
    overflow-x: hidden;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    min-width: 0;
  }

  .vizViewport.constrained {
    overflow-x: auto;
  }

  .edgeFade {
    pointer-events: none;
    position: absolute;
    top: 0;
    bottom: 0;
    width: 28px;
    opacity: 0;
    transition: opacity 0.18s ease;
    z-index: 10;
  }

  .edgeFade.left {
    left: 0;
    background: linear-gradient(90deg, var(--ui-panel) 0%, transparent 100%);
    border-top-left-radius: 10px;
    border-bottom-left-radius: 10px;
  }

  .edgeFade.right {
    right: 0;
    background: linear-gradient(270deg, var(--ui-panel) 0%, transparent 100%);
    border-top-right-radius: 10px;
    border-bottom-right-radius: 10px;
  }

  .vizViewport.hasLeftOverflow .edgeFade.left {
    opacity: 1;
  }

  .vizViewport.hasRightOverflow .edgeFade.right {
    opacity: 1;
  }

  .vizStrip {
    height: 100%;
    display: flex;
    align-items: stretch;
  }

  /* ====== GROUP CONTAINER ====== */
  .groupContainer {
    --expandedWidth: 200px;
    width: 44px;
    height: 100%;
    flex: 0 0 auto;
    position: relative;
    overflow: hidden;
    border-right: 1px solid var(--ui-border);
    transition: width 0.18s ease, box-shadow 0.18s ease;
  }

  .groupContainer:last-child {
    border-right: none;
  }

  .groupContainer.expanded {
    width: var(--expandedWidth);
    /* inset accent line avoids layout shift from border-left */
    box-shadow: inset 2px 0 0 rgba(57, 255, 143, 0.25);
  }

  /* ====== STUB GLYPH — always at left edge, always visible ====== */
  .stubGlyph {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 44px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 9px;
    z-index: 2;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }

  /* ====== STUB — transparent click target ====== */
  .groupStub {
    position: absolute;
    inset: 0;
    z-index: 3;
    cursor: pointer;
    border-radius: inherit;
    transition: background 0.2s ease;
  }

  .groupStub:hover {
    background: rgba(255, 255, 255, 0.025);
  }

  /* When expanded: stub shrinks to glyph column so controls stay clickable */
  .groupContainer.expanded .groupStub {
    right: auto;
    width: 44px;
  }

  /* ====== EXPANDED CONTENT — fades in right of stub ====== */
  .groupExpanded {
    position: absolute;
    left: 44px;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    padding: 10px 12px 8px 8px;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.14s ease;
  }

  .groupContainer.expanded .groupExpanded {
    opacity: 1;
    pointer-events: auto;
  }

  /* Title appears to the right of the glyph, above the controls */
  .groupTitle {
    margin: 0.2rem 0 0.7rem;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ui-text-dim);
    white-space: nowrap;
  }

  /* ====== GLYPH — SPECTRUM CURVES (wired to data-lta/sta/peak) ====== */
  .glyphLta,
  .glyphSta,
  .glyphPeak {
    opacity: 0.2;
    transition: opacity 0.2s ease;
  }

  #g_curves[data-lta="on"] .glyphLta {
    opacity: 1;
  }

  #g_curves[data-sta="on"] .glyphSta {
    opacity: 1;
  }

  #g_curves[data-peak="on"] .glyphPeak {
    opacity: 1;
  }

  /* ====== GLYPH — SMOOTHING (wired to data-smooth="0|1|2|3") ====== */
  .gSmooth {
    fill: none;
    stroke: var(--lime);
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  #g_smooth[data-smooth="0"] .gSmooth[data-level="0"] {
    opacity: 0.85;
  }

  #g_smooth[data-smooth="1"] .gSmooth[data-level="1"] {
    opacity: 0.85;
  }

  #g_smooth[data-smooth="2"] .gSmooth[data-level="2"] {
    opacity: 0.85;
  }

  #g_smooth[data-smooth="3"] .gSmooth[data-level="3"] {
    opacity: 0.85;
  }

  /* ====== GLYPH — HEATMAP (wired to data-power) ====== */
  .glyphRingMetal {
    transition: opacity 0.35s ease;
  }

  .glyphRingNeon {
    opacity: 0;
    transition: opacity 0.35s ease;
  }

  .glyphDot {
    fill: #4a5260;
    transition: fill 0.35s ease;
  }

  #g_heatmap[data-power="on"] .glyphRingNeon {
    opacity: 1;
  }

  #g_heatmap[data-power="on"] .glyphRingMetal {
    opacity: 0;
  }

  #g_heatmap[data-power="on"] .glyphDot {
    fill: var(--green);
  }

  /* ====== GLYPH — SIGNAL TAP (wired to data-sel) ====== */
  .glyphTapLine {
    stroke: #4a5260;
    stroke-width: 1.3;
    stroke-linecap: round;
  }

  .glyphTapBlock {
    fill: #2a3037;
    stroke: #4a5260;
    stroke-width: 1;
  }

  .glyphTapNode {
    fill: rgb(17, 20, 25);
    stroke: #4a5260;
    stroke-width: 1.4;
    transition: fill 0.2s ease, stroke 0.2s ease;
  }

  #g_tap[data-sel="pre"] .glyphTapNode[data-pos="pre"] {
    fill: var(--indigo);
    stroke: var(--indigo);
  }

  #g_tap[data-sel="post"] .glyphTapNode[data-pos="post"] {
    fill: var(--indigo);
    stroke: var(--indigo);
  }

  /* ====== SIGNAL TAP SELECTOR (EQ Source) ====== */

  .sigTapGroup {
    display: block;
  }

  .sigTap {
    display: block;
  }

  .sigLine {
    stroke: #4a5260;
    stroke-width: 1.3;
  }

  /* Active signal segment — lights up on the selected side */
  .sigSegActive {
    stroke: #7b8fff;
    stroke-width: 1.3;
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .sigTapGroup[data-sel="pre"] .sigSegActive.pre {
    opacity: 1;
  }

  .sigTapGroup[data-sel="post"] .sigSegActive.post {
    opacity: 1;
  }

  .eqBlock {
    fill: #2a3037;
    stroke: #4a5260;
    stroke-width: 1;
  }

  .eqBlockCurve {
    fill: none;
    stroke: #00ffa3;
    stroke-width: 1;
    stroke-linecap: round;
    opacity: 0.5;
  }

  .eqBlockLabel {
    fill: #6b7785;
    font-size: 7px;
    font-family: system-ui;
    text-anchor: middle;
    dominant-baseline: middle;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  /* Tap groups */
  .tap {
    cursor: pointer;
  }

  .tapNode {
    fill: rgb(17, 20, 25);
    stroke: #4a5260;
    stroke-width: 1.5;
    transition: fill 0.2s ease, stroke 0.2s ease;
  }

  .tapStem {
    stroke: #4a5260;
    stroke-width: 1;
    stroke-dasharray: 2 2;
    transition: stroke 0.2s ease;
  }

  .tapHead {
    fill: #4a5260;
    transition: fill 0.2s ease;
  }

  .tapLabel {
    fill: #6b7785;
    font-size: 8px;
    font-family: system-ui;
    text-anchor: middle;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    transition: fill 0.2s ease;
    user-select: none;
  }

  /* Hover */
  .tap:hover .tapNode {
    stroke: #7b8fff;
  }

  .tap:hover .tapStem {
    stroke: #2e3580;
  }

  .tap:hover .tapHead {
    fill: #2e3580;
  }

  .tap:hover .tapLabel {
    fill: #9aa4af;
  }

  /* Active — driven by data-sel on parent */
  .sigTapGroup[data-sel="pre"] .tap[data-pos="pre"] .tapNode {
    fill: #7b8fff;
    stroke: #7b8fff;
    filter: url(#tapGlow);
  }

  .sigTapGroup[data-sel="pre"] .tap[data-pos="pre"] .tapStem {
    stroke: #7b8fff;
    stroke-dasharray: none;
  }

  .sigTapGroup[data-sel="pre"] .tap[data-pos="pre"] .tapHead {
    fill: #7b8fff;
    filter: url(#tapGlow);
  }

  .sigTapGroup[data-sel="pre"] .tap[data-pos="pre"] .tapLabel {
    fill: #dde0ff;
  }

  .sigTapGroup[data-sel="post"] .tap[data-pos="post"] .tapNode {
    fill: #7b8fff;
    stroke: #7b8fff;
    filter: url(#tapGlow);
  }

  .sigTapGroup[data-sel="post"] .tap[data-pos="post"] .tapStem {
    stroke: #7b8fff;
    stroke-dasharray: none;
  }

  .sigTapGroup[data-sel="post"] .tap[data-pos="post"] .tapHead {
    fill: #7b8fff;
    filter: url(#tapGlow);
  }

  .sigTapGroup[data-sel="post"] .tap[data-pos="post"] .tapLabel {
    fill: #dde0ff;
  }

</style>
