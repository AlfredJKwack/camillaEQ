<script lang="ts">
  export let value: number; // dB value to display
  export let visible: boolean = false;
  export let fading: boolean = false;
  export let x: number = 0; // Fixed position X
  export let y: number = 0; // Fixed position Y
  export let side: 'left' | 'right' = 'left'; // Which side of thumb
  export let strokeColor: string = 'rgba(255, 255, 255, 0.14)'; // Band outline color

  // Format value with sign
  $: formattedValue = value > 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
</script>

{#if visible}
  <div 
    class="fader-tooltip" 
    class:fading
    class:right-side={side === 'right'}
    style="left: {x}px; top: {y}px;"
  >
    <svg width="60" height="32" viewBox="0 0 60 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Tooltip shape (mirrored if right side) -->
      <path
        d="M6.9 29.4c-3.3 0-6-3-6-6.7V9.3c0-3.7 2.6-6.8 5.8-6.8h37.7c3.8 0 14.4 11.5 14.4 13.4 0 2-10.6 13.5-14.4 13.5H7z"
        fill="var(--ui-panel-2)"
        stroke={strokeColor}
        stroke-width="1"
      />
    </svg>
    <span class="tooltip-text">{formattedValue} dB</span>
  </div>
{/if}

<style>
  .fader-tooltip {
    position: fixed;
    transform: translate(-100%, -50%); /* Anchor at right edge, vertically centered */
    pointer-events: none;
    opacity: 1;
    transition: opacity 1.5s ease;
    z-index: 100;
  }

  .fader-tooltip.right-side {
    transform: translate(0, -50%) scaleX(-1); /* Mirror horizontally */
  }

  .fader-tooltip.right-side .tooltip-text {
    transform: translate(-50%, -50%) scaleX(-1); /* Un-mirror text */
  }

  .fader-tooltip.fading {
    opacity: 0;
  }

  .fader-tooltip svg {
    display: block;
  }

  .tooltip-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 0.6rem;
    font-weight: 600;
    color: var(--ui-text);
    white-space: nowrap;
    pointer-events: none;
  }
</style>
