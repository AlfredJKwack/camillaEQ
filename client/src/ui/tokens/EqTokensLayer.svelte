<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { EqBand } from '../../dsp/filterResponse';
  import {
    formatTokenFrequency,
    formatTokenQ,
    qToSweepDeg,
    describeEllipseArcPath,
    labelShiftFactor,
  } from './tokenUtils';

  // Props
  export let bands: EqBand[];
  export let bandOrderNumbers: number[] = []; // Pipeline-relative position (1-based) for each band
  export let selectedBandIndex: number | null;
  export let plotWidth: number;
  export let plotHeight: number;
  export let shiftPressed: boolean;
  export let focusMode: boolean = false; // MVP-14: dim unselected tokens in focus mode

  const dispatch = createEventDispatcher<{
    tokenPointerDown: { bandIndex: number; event: PointerEvent };
    tokenPointerMove: { event: PointerEvent };
    tokenPointerUp: { event: PointerEvent };
    tokenWheel: { bandIndex: number; event: WheelEvent };
  }>();

  // Coordinate mapping functions
  function freqToX(freq: number, width: number): number {
    const fMin = 20;
    const fMax = 20000;
    const xNorm = (Math.log10(freq) - Math.log10(fMin)) / (Math.log10(fMax) - Math.log10(fMin));
    return xNorm * width;
  }

  function gainToY(gain: number): number {
    const gainRange = 48; // -24 to +24
    return 200 - (gain / gainRange) * 400;
  }

  // Event handlers that dispatch to parent
  function handleTokenPointerDown(event: PointerEvent, bandIndex: number) {
    dispatch('tokenPointerDown', { bandIndex, event });
  }

  function handleTokenPointerMove(event: PointerEvent) {
    dispatch('tokenPointerMove', { event });
  }

  function handleTokenPointerUp(event: PointerEvent) {
    dispatch('tokenPointerUp', { event });
  }

  function handleTokenWheel(event: WheelEvent, bandIndex: number) {
    dispatch('tokenWheel', { bandIndex, event });
  }
</script>

<!-- Tokens (band handles) - compensated ellipses to remain circular when stretched -->
<g class="tokens">
  {#each bands as band, i}
    {@const sx = plotWidth / 1000}
    {@const sy = plotHeight / 400}
    {@const tokenRadius = 20}
    {@const centerRadius = 17}
    {@const arcStrokeWidth = 6}
    {@const arcGap = 3}
    {@const cx = freqToX(band.freq, 1000)}
    {@const cy = gainToY(band.gain)}
    {@const ringStrokeWidth = tokenRadius - centerRadius}
    {@const ringCenterRadius = centerRadius + ringStrokeWidth / 2}
    {@const sweepDeg = qToSweepDeg(band.q)}
    {@const arcCenterRadius = tokenRadius + arcGap + arcStrokeWidth / 2}
    {@const tokenTransform = `translate(${cx} ${cy}) scale(${1/sx} ${1/sy})`}
    {@const arcPath = describeEllipseArcPath({
      cx: 0,
      cy: 0,
      rx: arcCenterRadius,
      ry: arcCenterRadius,
      startDeg: -sweepDeg / 2,
      endDeg: sweepDeg / 2,
    })}
    {@const freqNum = formatTokenFrequency(band.freq)}
    {@const qLabel = formatTokenQ(band.q)}
    {@const hzLabelY = tokenRadius + 10}
    {@const qLabelY = hzLabelY + 14 + 5}
    {@const labelBlockHeight = 14 + 5 + 14}
    {@const shiftT = labelShiftFactor(cy, plotHeight)}
    
    // Side placement logic: move labels to left/right based on X position
    {@const isLeftHalf = cx < 500}
    {@const sideSign = isLeftHalf ? 1 : -1}
    {@const sideDistance = 70}
    {@const sideFreqY = -labelBlockHeight / 2}
    
    // Interpolate from "below" (0,0) to "side" (sideDistance, sideFreqY)
    {@const targetDeltaX = sideSign * sideDistance}
    {@const targetDeltaY = sideFreqY - hzLabelY}
    {@const labelTranslateX = shiftT * targetDeltaX}
    {@const labelTranslateY = shiftT * targetDeltaY}
    
    // MVP-14: Focus mode dimming
    {@const isSelected = selectedBandIndex === i}
    {@const shouldDim = focusMode && !isSelected}
    {@const showLabels = !focusMode || isSelected}
    
    <g 
      class="token-group" 
      class:dimmed={shouldDim}
      style="--band-color: var(--band-{(i % 10) + 1})" 
      transform={tokenTransform}
    >
      <!-- Selection halo (only when selected, 20% bigger = 1.8x) -->
      {#if selectedBandIndex === i}
        <circle
          r={tokenRadius * 1.8}
          fill="none"
          stroke="var(--band-color)"
          stroke-width="2"
          opacity="0.3"
          class="token-halo"
          pointer-events="none"
          filter="url(#halo-blur)"
        />
      {/if}
      
      <!-- Q arc indicator (6px wide, outside token, butt caps) -->
      <path
        d={arcPath}
        fill="none"
        stroke="var(--band-color)"
        stroke-width={arcStrokeWidth}
        stroke-linecap="butt"
        opacity="0.85"
        class="token-arc"
        pointer-events="none"
      />
      
      <!-- Transparent center (17px radius) -->
      <circle
        r={centerRadius}
        style="fill: color-mix(in oklab, var(--band-color) 35%, var(--ui-panel) 65%);"
        fill-opacity="0.75"
        pointer-events="none"
      />
      
      <!-- Token ring (visible 3px ring: 20px outer, 17px inner) -->
      <circle
        r={ringCenterRadius}
        fill="none"
        stroke="var(--band-color)"
        stroke-width={ringStrokeWidth}
        class="band-token-ring"
        pointer-events="none"
      />
      
      <!-- Invisible hit area (full 20px radius for easy grabbing) -->
      <circle
        r={tokenRadius}
        fill="transparent"
        class="band-token-hitarea"
        class:shift-mode={shiftPressed}
        data-band-index={i}
        data-selected={selectedBandIndex === i}
        on:pointerdown={(e) => handleTokenPointerDown(e, i)}
        on:pointermove={handleTokenPointerMove}
        on:pointerup={handleTokenPointerUp}
        on:wheel={(e) => handleTokenWheel(e, i)}
      />
      
      <!-- Center index number (no additional transform needed - already in local coords) -->
      <text
        x={0}
        y={0}
        text-anchor="middle"
        dominant-baseline="central"
        class="token-index"
        pointer-events="none"
      >
        {bandOrderNumbers[i] ?? (i + 1)}
      </text>
      
      <!-- Labels group with smooth boundary-aware positioning (hidden in focus mode for unselected) -->
      {#if showLabels}
      <g class="token-labels" transform="translate({labelTranslateX} {labelTranslateY})">
        <!-- Frequency label (10px below token, 14px font) -->
        <text
          x={0}
          y={hzLabelY}
          text-anchor="middle"
          dominant-baseline="hanging"
          class="token-label-freq"
          pointer-events="none"
        >
          <tspan class="freq-number">{freqNum}</tspan>
          <tspan class="freq-unit" dx="2"> Hz</tspan>
        </text>
        
        <!-- Q label (5px below Hz label, 14px font) -->
        <text
          x={0}
          y={qLabelY}
          text-anchor="middle"
          dominant-baseline="hanging"
          class="token-label-q"
          pointer-events="none"
        >
          {qLabel}
        </text>
      </g>
      {/if}
    </g>
  {/each}
</g>

<!-- SVG filter definitions for halo blur -->
<defs>
  <filter id="halo-blur">
    <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
  </filter>
</defs>

<style>
  /* MVP-12: Token visual enhancements */
  .token-group {
    /* Inherits --band-color from inline style */
    transition: opacity 0.2s ease;
  }
  
  /* MVP-14: Focus mode dimming for unselected tokens */
  .token-group.dimmed {
    opacity: 0.3;
  }
  
  .token-halo {
    /* Selection halo - outer glow effect */
    transition: opacity 0.2s ease;
  }
  
  .token-arc {
    /* Q/BW arc indicator around token perimeter */
    transition: opacity 0.15s ease, d 0.1s ease;
  }
  
  .token-index {
    /* Center number showing band order (1-based) */
    fill: var(--ui-text);
    font-size: 12px;
    font-weight: 700;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    user-select: none;
  }
  
  .token-label-freq {
    /* Frequency label: 10px below token, 14px font */
    font-size: 14px;
    font-weight: 600;
    user-select: none;
  }
  
  .token-label-freq .freq-number {
    /* Numeric part in band accent color */
    fill: var(--band-color);
  }
  
  .token-label-freq .freq-unit {
    /* "Hz" unit in muted band color, same 14px size */
    fill: color-mix(in oklab, var(--band-color) 70%, transparent);
    font-size: 14px;
  }
  
  .token-label-q {
    /* Q label: 5px below Hz label, 14px font */
    fill: color-mix(in oklab, var(--band-color) 70%, transparent);
    font-size: 14px;
    font-weight: 500;
    user-select: none;
  }

  /* Smooth transition for boundary-aware label placement */
  .token-labels {
    transition: transform 120ms ease-out;
  }

  /* Token ring (3px visible ring) */
  .band-token-ring {
    transition: stroke-width 0.15s ease;
  }

  /* Invisible hit area for interaction */
  .band-token-hitarea {
    cursor: grab;
    touch-action: none;
  }
  
  /* Shift mode: vertical adjust cursor */
  .band-token-hitarea.shift-mode {
    cursor: ns-resize;
  }

  .band-token-hitarea:hover + .band-token-ring {
    stroke-width: 4;
  }

  .band-token-hitarea:active {
    cursor: grabbing;
  }
  
  .band-token-hitarea.shift-mode:active {
    cursor: ns-resize;
  }

  .band-token-hitarea[data-selected='true'] {
    filter: drop-shadow(0 0 6px color-mix(in oklab, currentColor 45%, transparent));
  }
</style>
