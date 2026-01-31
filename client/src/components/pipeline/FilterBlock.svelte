<script lang="ts">
  import FilterIcon from '../icons/FilterIcons.svelte';
  import type { FilterBlockVm } from '../../lib/pipelineViewModel';

  export let block: FilterBlockVm;
</script>

<div class="pipeline-block filter-block" data-bypassed={block.bypassed}>
  <div class="block-header">
    <span class="block-type">Filter</span>
    <div class="channel-badges">
      {#each block.channels as ch}
        <span class="channel-badge">CH {ch}</span>
      {/each}
    </div>
    {#if block.bypassed}
      <span class="bypass-pill">Bypassed</span>
    {/if}
  </div>

  <div class="block-body">
    {#if block.filters.length === 0}
      <div class="empty-message">No filters</div>
    {:else}
      <div class="filter-list">
        {#each block.filters as filter}
          <div class="filter-row" class:missing={!filter.exists} class:bypassed={filter.bypassed}>
            <div class="filter-icon">
              {#if filter.iconType}
                <FilterIcon type={filter.iconType} />
              {:else}
                <span class="no-icon">•</span>
              {/if}
            </div>
            <div class="filter-name">{filter.name}</div>
            {#if !filter.exists}
              <span class="warning-badge">Missing</span>
            {/if}
            {#if filter.bypassed}
              <span class="bypassed-badge">Off</span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .pipeline-block {
    padding: 1rem;
    background: var(--ui-panel);
    border: 1px solid var(--ui-border);
    border-radius: 8px;
    transition: all 0.15s ease;
  }

  .filter-block {
    border-left: 3px solid color-mix(in oklab, #4a9eff 50%, var(--ui-border) 50%);
  }

  .pipeline-block[data-bypassed='true'] {
    opacity: 0.6;
  }

  .block-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .block-type {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--ui-text);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .channel-badges {
    display: flex;
    gap: 0.25rem;
  }

  .channel-badge {
    padding: 0.125rem 0.5rem;
    background: rgba(74, 158, 255, 0.15);
    border: 1px solid rgba(74, 158, 255, 0.3);
    border-radius: 3px;
    font-size: 0.75rem;
    color: rgb(74, 158, 255);
    font-weight: 600;
  }

  .bypass-pill {
    padding: 0.125rem 0.5rem;
    background: rgba(255, 200, 80, 0.15);
    border: 1px solid rgba(255, 200, 80, 0.3);
    border-radius: 3px;
    font-size: 0.75rem;
    color: rgb(255, 200, 80);
    font-weight: 600;
  }

  .block-body {
    padding-top: 0.5rem;
    border-top: 1px solid var(--ui-border);
  }

  .empty-message {
    font-size: 0.875rem;
    color: var(--ui-text-dim);
    font-style: italic;
  }

  .filter-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .filter-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    transition: all 0.15s ease;
  }

  .filter-row:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .filter-row.missing {
    border-color: rgba(255, 120, 120, 0.3);
    background: rgba(255, 120, 120, 0.05);
  }

  .filter-row.bypassed {
    opacity: 0.5;
  }

  .filter-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .no-icon {
    font-size: 1.25rem;
    color: var(--ui-text-muted);
  }

  .filter-name {
    flex: 1;
    font-size: 0.875rem;
    font-family: 'Courier New', monospace;
    color: var(--ui-text);
  }

  .warning-badge {
    padding: 0.125rem 0.5rem;
    background: rgba(255, 120, 120, 0.2);
    border: 1px solid rgba(255, 120, 120, 0.4);
    border-radius: 3px;
    font-size: 0.75rem;
    color: rgb(255, 120, 120);
    font-weight: 600;
  }

  .bypassed-badge {
    padding: 0.125rem 0.5rem;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 3px;
    font-size: 0.75rem;
    color: var(--ui-text-muted);
    font-weight: 600;
  }
</style>
