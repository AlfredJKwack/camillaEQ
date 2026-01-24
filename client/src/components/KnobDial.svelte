<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let value: number; // frequency (20-20000) or Q (0.1-10)
  export let mode: 'frequency' | 'q' = 'frequency';
  export let size: number = 32; // knob diameter in px

  const dispatch = createEventDispatcher<{ change: { value: number } }>();

  // Drag state
  let isDragging = false;
  let startY = 0;
  let startValue = 0;

  // Mapping functions
  function mapLog(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    const logValue = Math.log(value);
    const logMin = Math.log(inMin);
    const logMax = Math.log(inMax);
    return ((logValue - logMin) / (logMax - logMin)) * (outMax - outMin) + outMin;
  }

  function mapLinear(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
    return ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
  }

  // Constants
  const MIN_ANGLE = -135;
  const MAX_ANGLE = 135;

  // Calculate arc parameters based on mode
  $: arcParams = (() => {
    if (mode === 'frequency') {
      // Frequency: arc sweep (length) encodes value
      // Low freq = short arc, high freq = long arc
      const sweep = mapLog(value, 20, 20000, 30, 270); // 30° to 270° range
      return {
        startAngle: MIN_ANGLE,
        endAngle: MIN_ANGLE + sweep,
      };
    } else {
      // Q: same behavior as frequency - sweep encodes value from fixed start
      // Low Q = short arc, high Q = long arc
      const sweep = mapLinear(value, 0.1, 10, 30, 270); // 30° to 270° range
      return {
        startAngle: MIN_ANGLE,
        endAngle: MIN_ANGLE + sweep,
      };
    }
  })();

  // SVG path generation for arc
  $: arcPath = (() => {
    const { startAngle, endAngle } = arcParams;
    const radius = size / 2 + 4; // arc slightly outside knob body
    const centerX = size / 2 + 6;
    const centerY = size / 2 + 6;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;

    const x1 = centerX + radius * Math.sin(startRad);
    const y1 = centerY - radius * Math.cos(startRad);
    const x2 = centerX + radius * Math.sin(endRad);
    const y2 = centerY - radius * Math.cos(endRad);

    const largeArc = endAngle - startAngle > 180 ? 1 : 0;

    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
  })();

  $: viewBoxSize = size + 12;

  // Interaction handlers
  function handlePointerDown(event: PointerEvent) {
    event.preventDefault();
    const target = event.currentTarget as SVGElement;
    target.setPointerCapture(event.pointerId);
    
    isDragging = true;
    startY = event.clientY;
    startValue = value;
  }

  function handlePointerMove(event: PointerEvent) {
    if (!isDragging) return;

    const deltaY = startY - event.clientY; // Inverted: up = increase
    const sensitivity = event.shiftKey ? 0.2 : 1.0; // Shift = fine adjustment

    let newValue: number;
    if (mode === 'frequency') {
      // Frequency: logarithmic adjustment
      // Use multiplicative factor based on pixel movement
      const factor = Math.pow(1.01, deltaY * sensitivity);
      newValue = startValue * factor;
    } else {
      // Q: linear adjustment
      const step = event.shiftKey ? 0.01 : 0.05;
      newValue = startValue + (deltaY * step);
    }

    dispatch('change', { value: newValue });
  }

  function handlePointerUp(event: PointerEvent) {
    if (!isDragging) return;
    
    const target = event.currentTarget as SVGElement;
    target.releasePointerCapture(event.pointerId);
    isDragging = false;
  }
</script>

<svg 
  class="knob-dial" 
  class:dragging={isDragging}
  viewBox="0 0 {viewBoxSize} {viewBoxSize}" 
  width={viewBoxSize} 
  height={viewBoxSize}
  on:pointerdown={handlePointerDown}
  on:pointermove={handlePointerMove}
  on:pointerup={handlePointerUp}
>
  <!-- Knob body (neutral) -->
  <circle
    cx={size / 2 + 6}
    cy={size / 2 + 6}
    r={size / 2}
    class="knob-body"
  />
  
  <!-- Value arc (band-tinted) -->
  <path
    d={arcPath}
    class="knob-arc"
    stroke-width="4.5"
  />
</svg>

<style>
  .knob-dial {
    display: block;
    cursor: pointer;
    touch-action: none;
    user-select: none;
  }

  .knob-dial.dragging {
    cursor: ns-resize;
  }

  :global(.knob-body) {
    fill: var(--ui-panel-2);
    stroke: none;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
  }

  :global(.knob-arc) {
    stroke: var(--band-ink);
    stroke-linecap: butt;
    fill: none;
    opacity: 0.95;
    transition: opacity 0.15s ease;
  }

  .knob-dial:hover :global(.knob-arc) {
    opacity: 1;
  }

  :global(.band[data-enabled='false'] .knob-arc) {
    opacity: 0.45;
  }
</style>
