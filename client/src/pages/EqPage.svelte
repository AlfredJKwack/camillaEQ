<script lang="ts">
  import FilterIcon from '../components/icons/FilterIcons.svelte';
  import KnobDial from '../components/KnobDial.svelte';

  // Mock data for testing - 5 bands initially
  const bands = [
    { id: 1, type: 'Peaking', enabled: true, freq: 100, gain: 3, q: 1.0 },
    { id: 2, type: 'Peaking', enabled: true, freq: 500, gain: -2, q: 1.5 },
    { id: 3, type: 'LowShelf', enabled: true, freq: 1000, gain: 1, q: 0.8 },
    { id: 4, type: 'HighShelf', enabled: true, freq: 3000, gain: 2, q: 1.2 },
    { id: 5, type: 'Peaking', enabled: true, freq: 8000, gain: -1, q: 1.0 },
  ];

  let showPerBandCurves = false;
  let spectrumMode = 'off'; // 'off' | 'pre' | 'post'
  
  // Plot dimensions for responsive tokens
  let plotWidth = 1000;
  let plotHeight = 400;
  let plotElement: HTMLDivElement;

  // Track plot size for token compensation
  $: if (plotElement) {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        plotWidth = entry.contentRect.width;
        plotHeight = entry.contentRect.height;
      }
    });
    observer.observe(plotElement);
  }

  // Base-10 logarithmic frequency mapping (per spec)
  function freqToX(freq: number, width: number): number {
    const fMin = 20;
    const fMax = 20000;
    const xNorm = (Math.log10(freq) - Math.log10(fMin)) / (Math.log10(fMax) - Math.log10(fMin));
    return xNorm * width;
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
</script>

<div class="eq-editor">
  <!-- Main Panel -->
  <div class="main-panel">
    <!-- EQ Graph Panel: 4-zone grid container -->
    <div class="eq-graph">
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

      <!-- Zone 3: Main Graph Area (2 columns: plot + gain scale) -->
      <div class="eq-plot-area">
        <div class="eq-plot" bind:this={plotElement}>
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

          <!-- Zero line (emphasized) -->
          <g class="zero-line">
            <line
              x1="0"
              y1="200"
              x2="1000"
              y2="200"
              stroke="var(--zero-line)"
              stroke-width="1"
            />
          </g>

          <!-- Placeholder: Analyzer layer -->
          <g class="analyzer"></g>

          <!-- Placeholder: Curves (sum + per-band) -->
          <g class="curves">
            <text x="500" y="200" fill="var(--ui-text-dim)" text-anchor="middle" font-size="14">
              EQ curves will render here (MVP-5)
            </text>
          </g>

          <!-- Tokens (band handles) - compensated ellipses to remain circular when stretched -->
          <g class="tokens">
            {#each bands as band, i}
              {@const sx = plotWidth / 1000}
              {@const sy = plotHeight / 400}
              {@const r = 8}
              <ellipse
                cx={freqToX(band.freq, 1000)}
                cy={200 - (band.gain / (GAIN_MAX - GAIN_MIN)) * 400}
                rx={r / sx}
                ry={r / sy}
                fill="var(--ui-panel)"
                stroke="var(--band-{(i % 10) + 1})"
                stroke-width="2"
                class="band-token"
              />
            {/each}
          </g>
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
    </div>

    <!-- Visualization Options Bar -->
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
    </div>
  </div>

  <!-- Right Panel: Band Columns -->
  <div class="band-panel">
    <!-- Master/General Band Column -->
    <div class="band-column master-band band" style="--band-color: var(--band-10);" data-enabled={true}>
      <div class="filter-type-icon" style="visibility: hidden;">
        <!-- Empty spacer -->
      </div>

      <div class="slope-icon" style="visibility: hidden;">
        <!-- Empty spacer -->
      </div>

      <div class="gain-fader">
        <div class="fader-track">
          <div
            class="fader-thumb"
            style="bottom: 50%;"
          ></div>
        </div>
        <span class="fader-value">0 dB</span>
      </div>

      <button class="mute-btn" title="Master Mute">
        <span class="mute-indicator"></span>
      </button>

      <div class="knob-label">FREQ</div>
      <div class="knob-label">BW</div>
    </div>
    
    <!-- Band columns -->
    {#each bands as band, i}
      <div class="band-column band" style="--band-color: var(--band-{(i % 10) + 1});" data-enabled={band.enabled}>
        <div class="filter-type-icon" title="Band {band.id} — {band.type}">
          <FilterIcon type={band.type} />
        </div>

        <div class="slope-icon">
          <div class="icon-placeholder" style="font-size: 0.875rem;">24dB</div>
        </div>

        <div class="gain-fader">
          <div class="fader-track">
            <div
              class="fader-thumb"
              style="bottom: {((band.gain + 12) / 24) * 100}%;"
            ></div>
          </div>
          <span class="fader-value">{band.gain > 0 ? '+' : ''}{band.gain} dB</span>
        </div>

        <button class="mute-btn" class:muted={!band.enabled} title={band.enabled ? 'Mute' : 'Unmute'}>
          <span class="mute-indicator"></span>
        </button>

        <div class="knob-wrapper">
          <KnobDial value={band.freq} mode="frequency" size={19} />
        </div>

        <div class="knob-wrapper">
          <KnobDial value={band.q} mode="q" size={19} />
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .eq-editor {
    display: flex;
    height: 100vh;
    gap: 1rem;
    padding: 1rem;
    box-sizing: border-box;
  }

  /* Main Panel */
  .main-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
    min-height: 0;
  }

  /* EQ Graph Panel: 4-zone grid structure */
  .eq-graph {
    flex: 1;
    display: grid;
    grid-template-rows: 34px 34px 1fr 34px;
    /* background: var(--ui-panel); */
    /* border: 1px solid var(--ui-border); */
    border-radius: 8px;
    overflow: hidden;
    min-height: 0;
  }

  /* Zone 1: Octave Indicators Row */
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

  /* Zone 2: Frequency Region Labels Row */
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

  /* Zone 3: Main Graph Area (2-column layout) */
  .eq-plot-area {
    display: grid;
    grid-template-columns: 1fr 32px; /* Matches .eq-freqscale-area */
    min-height: 0;
  }

  .eq-plot {
    position: relative;
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

  /* Zone 4: Frequency Scale Row */
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

  /* Band tokens */
  .band-token {
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .band-token:hover {
    stroke-width: 3;
  }

  .viz-options {
    display: flex;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--ui-panel);
    border: 1px solid var(--ui-border);
    border-radius: 4px;
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

  /* Right Panel: Band Columns */
  .band-panel {
    display: grid;
    grid-auto-flow: column;
    /* grid-auto-columns: 80px; */
    gap: 0.375rem;
    /* padding: 0.5rem; */
    border-radius: 8px;
    overflow-x: auto;
  }

  .band-column {
    display: grid;
    grid-template-rows: auto auto 1fr auto auto auto;
    row-gap: 0.5rem;
    align-items: center;
    justify-items: center;
    padding: 0.5rem 0.375rem;
    max-width: 80px;
    background: var(--ui-panel);
    border: 1px solid var(--ui-border);
    border-radius: 8px;
  }

  .band-column[data-enabled='false'] {
    opacity: 0.5;
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
    font-size: 0.875rem;
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

  .fader-track {
    position: relative;
    width: 4px;
    flex: 1;
    background: var(--ui-border);
    border-radius: 2px;
  }

  .fader-thumb {
    position: absolute;
    left: 50%;
    transform: translate(-50%, 50%);
    width: 14px;
    height: 14px;
    background: var(--band-ink);
    border: 2px solid var(--band-outline);
    border-radius: 50%;
    cursor: pointer;
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
