<script lang="ts">
  import FilterIcon from '../../../components/icons/FilterIcons.svelte';
  import BandOrderIcon from '../../../components/icons/BandOrderIcon.svelte';
  import KnobDial from '../../../components/KnobDial.svelte';
  import type { EqBand } from '../../../dsp/filterResponse';
  import {
    setBandGain,
    setBandFreq,
    setBandQ,
    toggleBandEnabled,
    selectBand,
  } from '../../../state/eqStore';
  import {
    showFaderTooltip,
    updateFaderTooltipPosition,
    hideFaderTooltip,
    openFilterTypePicker,
  } from '../../../state/eqUiOverlayStore';
  
  export let band: EqBand;
  export let bandIndex: number;
  export let orderNumber: number;
  export let filterName: string;
  export let selected: boolean;
  
  function handleFaderPointerDown(event: PointerEvent) {
    if (!band.enabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    
    event.preventDefault();
    event.stopPropagation();
    
    const thumb = event.currentTarget as HTMLElement;
    const track = thumb.closest('.fader-track') as HTMLElement;
    if (!track) return;
    
    const rect = track.getBoundingClientRect();
    
    const updateGainFromPointer = (clientY: number) => {
      const relY = (clientY - rect.top) / rect.height;
      const gain = 24 - relY * 48; // Fader: top = +24, bottom = -24
      setBandGain(bandIndex, gain);
      
      // Update tooltip position
      updateFaderTooltipPosition(thumb, gain);
    };
    
    updateGainFromPointer(event.clientY);
    
    // Show tooltip
    showFaderTooltip(bandIndex, thumb, band.gain);
    
    const onMove = (e: PointerEvent) => {
      updateGainFromPointer(e.clientY);
    };
    
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      hideFaderTooltip();
    };
    
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  
  function handleFaderDoubleClick(event: MouseEvent) {
    if (!band.enabled) {
      event.preventDefault();
      return;
    }
    
    event.preventDefault();
    setBandGain(bandIndex, 0);
  }
  
  function handleFilterIconClick(event: MouseEvent) {
    if (!band.enabled) {
      event.stopPropagation();
      return;
    }
    
    event.stopPropagation();
    
    const target = event.currentTarget as HTMLElement;
    const bandColumn = target.closest('.band-column') as HTMLElement;
    if (!bandColumn) return;
    
    openFilterTypePicker(bandIndex, target, bandColumn);
    selectBand(bandIndex);
  }
  
  function handleMuteToggle() {
    toggleBandEnabled(bandIndex);
  }
  
  function handleFreqChange(event: CustomEvent<{ value: number }>) {
    if (band.enabled) {
      setBandFreq(bandIndex, event.detail.value);
    }
  }
  
  function handleQChange(event: CustomEvent<{ value: number }>) {
    if (band.enabled) {
      setBandQ(bandIndex, event.detail.value);
    }
  }
  
  function handleSelect() {
    selectBand(bandIndex);
  }
  
  $: supportsGain = band.type === 'Peaking' || band.type === 'LowShelf' || band.type === 'HighShelf';
</script>

<div 
  class="band-column band" 
  style="--band-color: var(--band-{(bandIndex % 10) + 1});" 
  data-enabled={band.enabled}
  data-selected={selected}
  on:pointerdown|capture={handleSelect}
  role="button"
  tabindex="-1"
>
  <div class="band-top">
    <button
      type="button"
      class="filter-type-icon"
      aria-label="Change filter type for band {bandIndex + 1} — {band.type}"
      title="Band {bandIndex + 1} — {band.type}"
      on:click={handleFilterIconClick}
    >
      <FilterIcon type={band.type} />
    </button>

    <div class="order-icon">
      <BandOrderIcon position={orderNumber} title={filterName} />
    </div>
  </div>

  <div class="band-middle">
    <div class="gain-fader" data-supports-gain={supportsGain}>
      <div class="fader-track">
        <!-- Tickmarks at ±18, ±12, ±6 dB -->
        {#each [-18, -12, -6, 6, 12, 18] as tickGain}
          <div class="fader-tick" style="bottom: {((tickGain + 24) / 48) * 100}%;"></div>
        {/each}
        
        <!-- Thumb wrapper -->
        <div class="fader-thumb-wrap" style="bottom: {((band.gain + 24) / 48) * 100}%;">
          <div
            class="fader-thumb"
            on:pointerdown={handleFaderPointerDown}
            on:dblclick={handleFaderDoubleClick}
            role="slider"
            tabindex="-1"
            aria-label="Band {bandIndex + 1} gain"
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
      on:click={handleMuteToggle}
    >
      <span class="mute-indicator"></span>
    </button>

    <div class="knob-wrapper" class:disabled={!band.enabled}>
      <KnobDial 
        value={band.freq} 
        mode="frequency" 
        size={19} 
        on:change={handleFreqChange}
      />
    </div>

    <div class="knob-wrapper" class:disabled={!band.enabled}>
      <KnobDial 
        value={band.q} 
        mode="q" 
        size={19}
        on:change={handleQChange}
      />
    </div>
  </div>
</div>

<style>
  /* Band column base styles */
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
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 2px;
    touch-action: none;
  }

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
</style>
