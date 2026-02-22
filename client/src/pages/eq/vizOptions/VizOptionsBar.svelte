<!--
VizOptionsBar.svelte
Visualization options bar with collapsible groups for spectrum analyzer, heatmap, and token controls.
Uses VizLayoutManager for responsive layout with smart expansion/collapse behavior.
-->
<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import type { Writable } from 'svelte/store';
  import type { SmoothingMode } from '../../../dsp/fractionalOctaveSmoothing';
  import type { HeatmapMaskMode } from '../../../ui/rendering/canvasLayers/SpectrumHeatmapLayer';
  import { VizLayoutManager, type VizGroup } from './vizLayoutManager';
  import KnobDial from '../../../components/KnobDial.svelte';
  import { heatmapSettingsState, toggleHeatmapSettings } from '../../../state/eqUiOverlayStore';

  // Props: Spectrum mode (store)
  export let spectrumMode: Writable<'pre' | 'post'>;
  
  // Props: Analyzer controls (stores)
  export let smoothingMode: Writable<SmoothingMode>;
  export let showSTA: Writable<boolean>;
  export let showLTA: Writable<boolean>;
  export let showPeak: Writable<boolean>;
  
  // Props: Heatmap controls (stores)
  export let heatmapEnabled: Writable<boolean>;
  
  // Props: Token visuals (stores)
  export let showPerBandCurves: Writable<boolean>;
  export let showBandwidthMarkers: Writable<boolean>;
  export let bandFillOpacity: Writable<number>;

  const dispatch = createEventDispatcher<{
    resetAverages: void;
  }>();

  // VizLayoutManager refs
  let vizHostEl: HTMLDivElement;
  let vizViewportEl: HTMLDivElement;
  let vizStripEl: HTMLDivElement;
  let vizLayoutManager: VizLayoutManager | null = null;

  // Initialize VizLayoutManager
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
        
        // Drag-to-scroll
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
            if (pointerId !== null) vizViewportEl.setPointerCapture(pointerId);
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
        
        // Wheel pan
        const handleWheel = (e: WheelEvent) => {
          if (!vizViewportEl.classList.contains('constrained')) return;
          if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
          if (vizViewportEl.scrollWidth <= vizViewportEl.clientWidth + 1) return;
          e.preventDefault();
          vizViewportEl.scrollLeft += e.deltaY;
        };
        
        vizViewportEl.addEventListener('wheel', handleWheel, { passive: false });
        
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

  onDestroy(() => {
    if (vizLayoutManager) {
      vizLayoutManager.destroy();
      vizLayoutManager = null;
    }
  });
</script>

<div class="vizHost" id="vizHost" bind:this={vizHostEl}>
  <div class="vizViewport" id="vizViewport" bind:this={vizViewportEl} aria-label="Visualization options">
    <div class="edgeFade left"></div>
    <div class="edgeFade right"></div>
    
    <div class="vizStrip" id="vizStrip" bind:this={vizStripEl}>
      
      <!-- ===== SPECTRUM SIGNAL TAP ===== -->
      <div class="groupContainer expanded" id="g_tap" data-group="tap"
           data-sel={$spectrumMode}
           style="--expandedWidth:256px">
        
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
          <div class="sigTapGroup" data-sel={$spectrumMode}>
            <svg class="sigTap" viewBox="0 0 190 50" width="190" height="50" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <filter id="tapGlow" x="-100%" y="-100%" width="300%" height="300%">
                  <feGaussianBlur stdDeviation="2.2" result="blur"/>
                  <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
              </defs>

              <line class="sigLine" x1="6" y1="30" x2="72" y2="30"/>
              <line class="sigSegActive pre" x1="6" y1="30" x2="72" y2="30"/>

              <rect class="eqBlock" x="72" y="20" width="46" height="20" rx="3"/>
              <path class="eqBlockCurve" d="M76 30 C80 30 83 23 95 23 C107 23 110 30 114 30"/>
              <text class="eqBlockLabel" x="95" y="17">EQ</text>

              <line class="sigLine" x1="118" y1="30" x2="184" y2="30"/>
              <line class="sigSegActive post" x1="118" y1="30" x2="184" y2="30"/>

              <g class="tap" data-pos="pre" on:click={() => ($spectrumMode = 'pre')} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && ($spectrumMode = 'pre')} aria-label="Analyze signal before EQ (input)">
                <title>Analyze signal before EQ (input)</title>
                <line class="tapStem" x1="42" y1="10" x2="42" y2="24.5"/>
                <circle class="tapNode" cx="42" cy="30" r="5.5"/>
                <circle class="tapHead" cx="42" cy="7" r="3.5"/>
                <text class="tapLabel" x="42" y="46">PRE</text>
              </g>

              <g class="tap" data-pos="post" on:click={() => ($spectrumMode = 'post')} role="button" tabindex="0" on:keydown={(e) => e.key === 'Enter' && ($spectrumMode = 'post')} aria-label="Analyze signal after EQ (output)">
                <title>Analyze signal after EQ (output)</title>
                <line class="tapStem" x1="148" y1="10" x2="148" y2="24.5"/>
                <circle class="tapNode" cx="148" cy="30" r="5.5"/>
                <circle class="tapHead" cx="148" cy="7" r="3.5"/>
                <text class="tapLabel" x="148" y="46">POST</text>
              </g>
            </svg>
          </div>
        </div>
      </div>
      
      <!-- ===== SPECTRUM CURVES ===== -->
      <div class="groupContainer expanded" id="g_curves" data-group="curves"
           data-lta={$showLTA ? 'on' : 'off'}
           data-sta={$showSTA ? 'on' : 'off'}
           data-peak={$showPeak ? 'on' : 'off'}
           style="--expandedWidth:200px">

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

            <button class="chip waveSwitch" data-on={$showLTA} data-mode="lta" on:click={() => ($showLTA = !$showLTA)} title="Long-term average (slow)">LTA</button>
            <button class="chip waveSwitch" data-on={$showSTA} data-mode="sta" on:click={() => ($showSTA = !$showSTA)} title="Short-term average (fast)">STA</button>
            <button class="chip waveSwitch" data-on={$showPeak} data-mode="peak" on:click={() => ($showPeak = !$showPeak)} title="Peak hold">Peak</button>
            <button class="button button--icon" id="resetBtn" aria-label="Reset averages" title="Reset STA/LTA/Peak averages" on:click={() => dispatch('resetAverages')}>
              <svg class="resetIcon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path d="M20 12a8 8 0 1 1-2.1-5.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M19.8 3.8v3.9h-3.9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M7 14h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>
                <path d="M8 11c1 0 1 .9 2 .9s1-1.8 2-1.8 1 1.8 2 1.8 1-.9 2-.9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".75"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      <!-- ===== CURVE SMOOTHING ===== -->
      <div class="groupContainer expanded" id="g_smooth" data-group="smooth"
           data-smooth={$smoothingMode === 'off' ? '0' : $smoothingMode === '1/12' ? '1' : $smoothingMode === '1/6' ? '2' : '3'}
           style="--expandedWidth:190px">

        <div class="stubGlyph">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path class="gSmooth" data-level="0" d="M4 12 L7 8 L10 15 L13 8 L16 14 L20 12"/>
            <path class="gSmooth" data-level="1" d="M4 14 C6 14 7 8 10 8 S14 14 17 14 S19 11 20 11"/>
            <path class="gSmooth" data-level="2" d="M4 14 C7 14 8 7 12 7 S17 14 20 14"/>
            <path class="gSmooth" data-level="3" d="M4 12 C9 5 15 18 20 12"/>
          </svg>
        </div>

        <div class="groupStub" role="button" tabindex="0" aria-label="Curve smoothing"></div>

        <div class="groupExpanded">
          <div class="groupTitle">Curve Smoothing</div>
          <div class="row">
            <button class="chip option" class:active={$smoothingMode === 'off'} on:click={() => ($smoothingMode = 'off')} title="No smoothing (raw spectrum)">Off</button>
            <button class="chip option" class:active={$smoothingMode === '1/12'} on:click={() => ($smoothingMode = '1/12')} title="1/12-octave smoothing (most detail)">1/12 Oct</button>
            <button class="chip option" class:active={$smoothingMode === '1/6'} on:click={() => ($smoothingMode = '1/6')} title="1/6-octave smoothing (balanced)">1/6 Oct</button>
            <button class="chip option" class:active={$smoothingMode === '1/3'} on:click={() => ($smoothingMode = '1/3')} title="1/3-octave smoothing (smoothest)">1/3 Oct</button>
          </div>
        </div>
      </div>

      <!-- ===== HEATMAP ===== -->
      <div class="groupContainer expanded" id="g_heatmap" data-group="heatmap"
           data-power={$heatmapEnabled ? 'on' : 'off'}
           style="--expandedWidth:210px">

        <div class="stubGlyph">
          <!-- Glyph: gradient grid — dark-to-bright encodes heatmap intensity, wired to data-power -->
          <svg class="glyphHeatmap" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3"  y="3"  width="5" height="5" rx=".8" fill="var(--orange)" opacity=".12"/>
            <rect x="10" y="3"  width="5" height="5" rx=".8" fill="var(--orange)" opacity=".28"/>
            <rect x="17" y="3"  width="5" height="5" rx=".8" fill="var(--orange)" opacity=".50"/>
            <rect x="3"  y="10" width="5" height="5" rx=".8" fill="var(--orange)" opacity=".28"/>
            <rect x="10" y="10" width="5" height="5" rx=".8" fill="var(--orange)" opacity=".55"/>
            <rect x="17" y="10" width="5" height="5" rx=".8" fill="var(--orange)" opacity=".80"/>
            <rect x="3"  y="17" width="5" height="5" rx=".8" fill="var(--orange)" opacity=".50"/>
            <rect x="10" y="17" width="5" height="5" rx=".8" fill="var(--orange)" opacity=".80"/>
            <rect x="17" y="17" width="5" height="5" rx=".8" fill="var(--orange)" opacity="1"/>
          </svg>
        </div>

        <div class="groupStub" role="button" tabindex="0" aria-label="Heatmap"></div>

        <div class="groupExpanded">
          <div class="groupTitle">Heatmap</div>
          <div class="row">
            <button class="heatmapToggle" on:click={() => ($heatmapEnabled = !$heatmapEnabled)}>
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
                      <stop offset="0%"   stop-color="#ffb060"/>
                      <stop offset="50%"  stop-color="#ff7a00"/>
                      <stop offset="100%" stop-color="#e06000"/>
                    </linearGradient>
                    <radialGradient id="bloomGrad" cx="50%" cy="50%" r="50%">
                      <stop offset="0%"   stop-color="#ff8c28" stop-opacity=".22"/>
                      <stop offset="55%"  stop-color="#ff8c28" stop-opacity=".07"/>
                      <stop offset="100%" stop-color="#ff8c28" stop-opacity="0"/>
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
              data-open={$heatmapSettingsState.open}
              disabled={!$heatmapEnabled}
              on:click={(e) => toggleHeatmapSettings(e.currentTarget)}
              title="Heatmap settings"
              aria-label="Heatmap settings"
            >
              <span>Prefs</span>
              <span class="arrow">▲</span>
            </button>
          </div>
        </div>
      </div>

      <!-- ===== TOKEN VISUALS ===== -->
      <div class="groupContainer expanded" id="g_tokens" data-group="tokens"
           data-curves={$showPerBandCurves ? 'on' : 'off'}
           data-bw={$showBandwidthMarkers ? 'on' : 'off'}
           style="--expandedWidth:230px; --tokenFill:{$bandFillOpacity}">

        <div class="stubGlyph">
          <!--
            Glyph geometry: paths are the designer-provided filter-curve-01 (primary/gentler),
            filter-curve-02 (secondary/steeper), and single-band-token circle, all in viewBox 0 0 22 22.
            Both curves share transform="matrix(0.816941,0,0,1,2.00812,4.19545)".
            In SVG coords the curve baseline lands at y≈15.2, x from ≈2 to ≈20.
          -->
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <!-- baseline (SVG-space coords derived from the shared transform) -->
            <line class="tokGlyph-base" x1="2.01" y1="15.19" x2="20.0" y2="15.19"/>

            <!-- shaded area under primary curve; fill-opacity driven by --tokenFill -->
            <g transform="matrix(0.816941,0,0,1,2.00812,4.19545)">
              <!-- Close the curve back along y=11 (the baseline in local space) via implicit Z -->
              <path class="tokGlyph-shade" d="M0,11 C3.047,11 4.286,6 7.333,6 C9.754,6 11.11,11.01 14.028,10.997 C15.929,10.989 18.3,10.965 22,11 Z"/>
            </g>

            <!-- secondary curve (filter-curve-02): visible when Per-band is ON [data-curves="on"] -->
            <g transform="matrix(0.816941,0,0,1,2.00812,4.19545)">
              <path class="tokGlyph-curveB" d="M0,11 C4.437,11 7.583,11 9.869,11 C15.091,11.001 14.804,2.581 16.113,2.573 C17.373,2.565 17.28,10.996 22,11"/>
            </g>

            <!-- primary curve (filter-curve-01): always visible -->
            <g transform="matrix(0.816941,0,0,1,2.00812,4.19545)">
              <path class="tokGlyph-curveA" d="M0,11 C3.047,11 4.286,6 7.333,6 C9.754,6 11.11,11.01 14.028,10.997 C15.929,10.989 18.3,10.965 22,11"/>
            </g>

            <!-- solo-edit token dot (single-band-token): hidden until Solo mode is implemented -->
            <!-- Future hook: set data-solo="on" on #g_tokens to reveal via .tokGlyph-dot selector -->
            <circle class="tokGlyph-dot" cx="7.93" cy="10.723" r="1.49"/>
          </svg>
        </div>

        <div class="groupStub" role="button" tabindex="0" aria-label="Token visuals"></div>

        <div class="groupExpanded">
          <div class="groupTitle">Token Visuals</div>
          <div class="row">
            <button 
              class="chip option" 
              class:active={$showPerBandCurves}
              aria-pressed={$showPerBandCurves}
              on:click={() => ($showPerBandCurves = !$showPerBandCurves)}
              title="Show per-band response curves"
            >
              Per-band
            </button>
            <button 
              class="chip option" 
              class:active={$showBandwidthMarkers}
              aria-pressed={$showBandwidthMarkers}
              on:click={() => ($showBandwidthMarkers = !$showBandwidthMarkers)}
              title="Show bandwidth (Q) markers"
            >
              BW
            </button>
            <span class="knob-wrapper-inline" style="--knob-arc: var(--indigo);" title="Band fill opacity (Shift = fine adjust)" aria-label="Band fill opacity">
              <KnobDial 
                value={$bandFillOpacity}
                min={0}
                max={1}
                scale="linear"
                size={20}
                on:change={(e) => ($bandFillOpacity = Math.max(0, Math.min(1, e.detail.value)))}
              />
            </span>
          </div>
        </div>
      </div>

    </div>
  </div>
</div>

<style>
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
    box-shadow: inset 2px 0 0 rgba(57, 255, 143, 0.25);
  }

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

  .groupContainer.expanded .groupStub {
    right: auto;
    width: 44px;
  }

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

  .groupTitle {
    margin: 0.2rem 0 0.7rem;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ui-text-dim);
    white-space: nowrap;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

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

  .waveSwitch {
    display: flex;
    align-items: center;
    gap: 4px;
  }

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

  .option:hover {
    border-color: #1a5c3a;
    background: rgba(0, 255, 163, 0.06);
  }

  .option.active {
    border-color: #00ffa3;
    color: #eafff5;
  }

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
    color: #7a3a00;
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
    fill: var(--orange);
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
    color: var(--orange);
  }

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

  /* ── Heatmap glyph ── */
  .glyphHeatmap {
    opacity: 0.3;
    transition: opacity 0.28s ease;
  }

  #g_heatmap[data-power="on"] .glyphHeatmap {
    opacity: 1;
  }


  /* ── Token visuals glyph ── */

  /* Baseline */
  .tokGlyph-base {
    stroke: #4a5260;
    stroke-width: 1;
    stroke-linecap: round;
  }

  /* Primary (gentler) curve — always visible */
  .tokGlyph-curveA {
    fill: none;
    stroke: var(--indigo);
    stroke-width: 1.6;
    stroke-linecap: round;
    opacity: 0.95;
  }

  /* Secondary (steeper/offset) curve — visible only when Per-band is ON */
  .tokGlyph-curveB {
    fill: none;
    stroke: var(--teal);
    stroke-width: 1.3;
    stroke-linecap: round;
    opacity: 0;
    transition: opacity 0.18s ease;
  }

  #g_tokens[data-curves="on"] .tokGlyph-curveB {
    opacity: 0.95;
  }

  /* Shaded area under primary curve; fill-opacity driven by --tokenFill (bandFillOpacity) */
  .tokGlyph-shade {
    fill: var(--indigo);
    fill-opacity: var(--tokenFill, 0.4);
    transition: fill-opacity 0.18s ease;
  }

  /*
   * Solo-edit token dot — hidden by default.
   * Future hook: add [data-solo="on"] to #g_tokens when the
   * "edit one band, mute others" feature is implemented.
   */
  .tokGlyph-dot {
    fill: var(--indigo);
    stroke: #0e1116;
    stroke-width: 0.6;
    opacity: 0;
    transition: opacity 0.18s ease;
  }

  #g_tokens[data-solo="on"] .tokGlyph-dot {
    opacity: 1;
  }

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

  .knob-wrapper-inline {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
</style>
