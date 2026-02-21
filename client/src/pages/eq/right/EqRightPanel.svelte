<script lang="ts">
  import type { EqBand } from '../../../dsp/filterResponse';
  import MasterBandColumn from './MasterBandColumn.svelte';
  import EqBandColumn from './EqBandColumn.svelte';
  
  export let bands: EqBand[];
  export let filterNames: string[];
  export let bandOrderNumbers: (number | null)[];
  export let selectedBandIndex: number | null;
  export let preampGain: number;
</script>

<div class="eq-right">
  <div class="band-grid">
    <!-- Master/Preamp Band Column -->
    <MasterBandColumn {preampGain} />

    <!-- Band columns -->
    {#each bands as band, i}
      <EqBandColumn
        {band}
        bandIndex={i}
        orderNumber={bandOrderNumbers[i] ?? (i + 1)}
        filterName={filterNames[i]}
        selected={selectedBandIndex === i}
      />
    {/each}
  </div>
</div>

<style>
  /* Right side: participates in parent's 3 rows via subgrid */
  .eq-right {
    display: grid;
    grid-template-rows: subgrid;
    grid-row: 1 / span 3;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .band-grid {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: subgrid;
    grid-row: 1 / span 3;
    gap: 0.375rem;
    height: 100%;
    width: 100%;
    min-height: 0;
    overflow-x: auto;
    overflow-y: hidden;
  }
</style>
