<script lang="ts">
  import { setPreampGain, preampGain as preampGainStore } from '../../../state/eqStore';
  import {
    showFaderTooltip,
    updateFaderTooltipPosition,
    hideFaderTooltip,
  } from '../../../state/eqUiOverlayStore';
  
  export let preampGain: number;
  
  function handleFaderPointerDown(event: PointerEvent) {
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
      
      // Update tooltip position
      updateFaderTooltipPosition(thumb, gain);
    };
    
    updatePreampFromPointer(event.clientY);
    
    // Show tooltip
    showFaderTooltip(null, thumb, preampGain);
    
    const onMove = (e: PointerEvent) => {
      updatePreampFromPointer(e.clientY);
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
    event.preventDefault();
    setPreampGain(0);
  }
</script>

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
        <div class="fader-thumb-wrap" style="bottom: {((preampGain + 24) / 48) * 100}%;">
          <div
            class="fader-thumb"
            on:pointerdown={handleFaderPointerDown}
            on:dblclick={handleFaderDoubleClick}
            role="slider"
            tabindex="-1"
            aria-label="Preamp gain"
            aria-valuemin={-24}
            aria-valuemax={24}
            aria-valuenow={preampGain}
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
