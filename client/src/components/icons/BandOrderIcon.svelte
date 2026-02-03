<script lang="ts">
  import svgRaw from '../../assets/band-order-icons.svg?raw';

  // Position to display (1-20)
  export let position: number = 1;
  
  // Optional title (defaults to "Band N" if not provided)
  export let title: string = '';

  // Clamp position to valid range
  $: clampedPosition = Math.max(1, Math.min(20, position));
  
  // Generate SVG with the selected position made visible
  $: svgWithDisplay = (() => {
    const targetId = `pos${String(clampedPosition).padStart(2, '0')}`;
    
    // Find and replace the display attribute for the selected position
    // All groups have display="none" by default, we change the selected one to display="inline"
    const regex = new RegExp(`(<g id="${targetId}"[^>]*display=")none(")`, 'g');
    return svgRaw.replace(regex, '$1inline$2');
  })();

  // Use provided title or default to "Band N"
  $: displayTitle = title || `Band ${clampedPosition}`;
</script>

<div class="band-order-icon" title="{displayTitle}">
  {@html svgWithDisplay}
</div>

<style>
  .band-order-icon {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .band-order-icon :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
