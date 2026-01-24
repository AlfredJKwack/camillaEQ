<script lang="ts">
  export let value: number; // frequency (20-20000) or Q (0.1-10)
  export let mode: 'frequency' | 'q' = 'frequency';
  export let size: number = 32; // knob diameter in px

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
</script>

<svg class="knob-dial" viewBox="0 0 {viewBoxSize} {viewBoxSize}" width={viewBoxSize} height={viewBoxSize}>
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
  }

  :global(.band[data-enabled='false'] .knob-arc) {
    opacity: 0.45;
  }
</style>
