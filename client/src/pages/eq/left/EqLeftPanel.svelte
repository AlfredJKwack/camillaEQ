<script lang="ts">
  import EqPlotArea from './EqPlotArea.svelte';
  import VizOptionsBar from '../vizOptions/VizOptionsBar.svelte';
  import {
    freqToX,
    formatFreq,
    calcOctaveWidths,
    calcRegionWidths,
    generateFrequencyTicks,
  } from '../plot/eqPlotMath';
  import {
    spectrumMode,
    smoothingMode,
    showSTA,
    showLTA,
    showPeak,
    heatmapEnabled,
    showPerBandCurves,
    showBandwidthMarkers,
    bandFillOpacity,
    soloWhileEditing,
  } from '../vizOptions/vizOptionsStore';

  // Calculate octave and region column widths
  const octaveWidths = calcOctaveWidths();
  const regionWidths = calcRegionWidths();

  // Generate frequency ticks
  const { majors: majorTicks } = generateFrequencyTicks();
</script>

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

  <!-- Row 2: Middle (Plot) -->
  <div class="eq-left-middle">
    <EqPlotArea />
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
      <VizOptionsBar
        {spectrumMode}
        {smoothingMode}
        {showSTA}
        {showLTA}
        {showPeak}
        {heatmapEnabled}
        {showPerBandCurves}
        {showBandwidthMarkers}
        {bandFillOpacity}
        {soloWhileEditing}
      />
      <div class="viz-options-spacer"></div>
    </div>
  </div>
</div>

<style>
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

  /* Frequency Scale Row */
  .eq-freqscale-area {
    display: grid;
    grid-template-columns: 1fr 32px;
  }

  .eq-freqscale {
    position: relative;
    padding: 0 14px;
    display: flex;
    align-items: center;
  }

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
    grid-template-columns: 1fr 32px;
    margin-top: 1rem;
    min-width: 0;
  }

  .viz-options-spacer {
  }
</style>
