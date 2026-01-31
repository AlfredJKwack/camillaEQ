<script lang="ts">
  import type { ProcessorBlockVm } from '../../lib/pipelineViewModel';

  export let block: ProcessorBlockVm;
</script>

<div class="pipeline-block processor-block" data-bypassed={block.bypassed}>
  <div class="block-header">
    <span class="block-type">{block.typeLabel}</span>
    {#if block.name}
      <span class="processor-name">{block.name}</span>
    {/if}
    {#if block.bypassed}
      <span class="bypass-pill">Bypassed</span>
    {/if}
  </div>

  <div class="block-body">
    <div class="info-message">
      <span class="info-icon">ℹ</span>
      External configuration required
    </div>
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

  .processor-block {
    border-left: 3px solid color-mix(in oklab, #aaaaaa 50%, var(--ui-border) 50%);
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

  .processor-name {
    font-size: 0.875rem;
    font-family: 'Courier New', monospace;
    color: var(--ui-text-muted);
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

  .info-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: rgba(170, 170, 170, 0.1);
    border: 1px solid rgba(170, 170, 170, 0.3);
    border-radius: 4px;
    font-size: 0.875rem;
    color: var(--ui-text-muted);
  }

  .info-icon {
    font-size: 1rem;
  }
</style>
