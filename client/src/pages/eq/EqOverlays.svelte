<script lang="ts">
  import FaderTooltip from '../../components/FaderTooltip.svelte';
  import FilterTypePicker from '../../components/FilterTypePicker.svelte';
  import HeatmapSettings from '../../components/HeatmapSettings.svelte';
  import { bands, setBandType } from '../../state/eqStore';
  import {
    heatmapMaskMode,
    heatmapHighPrecision,
    heatmapAlphaGamma,
    heatmapMagnitudeGain,
    heatmapGateThreshold,
    heatmapMaxAlpha,
  } from './vizOptions/vizOptionsStore';
  import {
    faderTooltipState,
    filterTypePickerState,
    heatmapSettingsState,
    closeFilterTypePicker,
    closeHeatmapSettings,
  } from '../../state/eqUiOverlayStore';
  import type { EqBand } from '../../dsp/filterResponse';
  import type { HeatmapMaskMode } from '../../ui/rendering/canvasLayers/SpectrumHeatmapLayer';

  // Handle filter type selection
  function handleTypeSelect(event: CustomEvent<{ type: EqBand['type'] }>) {
    if ($filterTypePickerState.bandIndex !== null) {
      setBandType($filterTypePickerState.bandIndex, event.detail.type);
    }
  }

  // Handle heatmap settings changes
  function handleHeatmapSettingsChange(event: CustomEvent<{
    maskMode?: HeatmapMaskMode;
    highPrecision?: boolean;
    alphaGamma?: number;
    magnitudeGain?: number;
    gateThreshold?: number;
    maxAlpha?: number;
  }>) {
    const changes = event.detail;
    
    if (changes.maskMode !== undefined) {
      heatmapMaskMode.set(changes.maskMode);
    }
    if (changes.highPrecision !== undefined) {
      heatmapHighPrecision.set(changes.highPrecision);
    }
    if (changes.alphaGamma !== undefined) {
      heatmapAlphaGamma.set(changes.alphaGamma);
    }
    if (changes.magnitudeGain !== undefined) {
      heatmapMagnitudeGain.set(changes.magnitudeGain);
    }
    if (changes.gateThreshold !== undefined) {
      heatmapGateThreshold.set(changes.gateThreshold);
    }
    if (changes.maxAlpha !== undefined) {
      heatmapMaxAlpha.set(changes.maxAlpha);
    }
  }

  // Compute tooltip stroke color based on band index
  $: tooltipStrokeColor = `color-mix(in oklab, ${
    $faderTooltipState.bandIndex === null
      ? 'hsl(0 0% 72%)'
      : `var(--band-${($faderTooltipState.bandIndex % 10) + 1})`
  } 55%, white 10%)`;
</script>

<!-- Global tooltip overlay (positioned via fixed coordinates) -->
<FaderTooltip
  value={$faderTooltipState.value}
  visible={$faderTooltipState.visible}
  fading={$faderTooltipState.fading}
  x={$faderTooltipState.x}
  y={$faderTooltipState.y}
  side={$faderTooltipState.side}
  strokeColor={tooltipStrokeColor}
/>

<!-- Filter type picker popover -->
{#if $filterTypePickerState.open && $filterTypePickerState.bandIndex !== null}
  <FilterTypePicker
    currentType={$bands[$filterTypePickerState.bandIndex].type}
    bandLeft={$filterTypePickerState.bandLeft}
    bandRight={$filterTypePickerState.bandRight}
    iconCenterY={$filterTypePickerState.iconCenterY}
    on:select={handleTypeSelect}
    on:close={closeFilterTypePicker}
  />
{/if}

<!-- Heatmap settings popover -->
{#if $heatmapSettingsState.open}
  <HeatmapSettings
    maskMode={$heatmapMaskMode}
    highPrecision={$heatmapHighPrecision}
    alphaGamma={$heatmapAlphaGamma}
    magnitudeGain={$heatmapMagnitudeGain}
    gateThreshold={$heatmapGateThreshold}
    maxAlpha={$heatmapMaxAlpha}
    anchorEl={null}
    buttonLeft={$heatmapSettingsState.buttonLeft}
    buttonRight={$heatmapSettingsState.buttonRight}
    buttonCenterY={$heatmapSettingsState.buttonCenterY}
    on:change={handleHeatmapSettingsChange}
    on:close={closeHeatmapSettings}
  />
{/if}
