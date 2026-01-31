<script lang="ts">
  import type { MixerBlockVm } from '../../lib/pipelineViewModel';

  export let block: MixerBlockVm;
</script>

<div class="pipeline-block mixer-block" data-bypassed={block.bypassed}>
  <div class="block-header">
    <span class="block-type">Mixer</span>
    <span class="mixer-name">{block.name}</span>
    {#if block.bypassed}
      <span class="bypass-pill">Bypassed</span>
    {/if}
  </div>

  <div class="block-body">
    {#if !block.exists}
      <div class="warning-message">
        <span class="warning-icon">⚠</span>
        Mixer "{block.name}" not found in config
      </div>
    {:else if block.channelsInOut}
      <div class="channel-summary">
        {block.channelsInOut.in} → {block.channelsInOut.out}
      </div>
    {:else}
      <div class="empty-message">No channel info</div>
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

  .mixer-block {
    border-left: 3px solid color-mix(in oklab, #4aff9e 50%, var(--ui-border) 50%);
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

  .mixer-name {
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

  .warning-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: rgba(255, 120, 120, 0.1);
    border: 1px solid rgba(255, 120, 120, 0.3);
    border-radius: 4px;
    font-size: 0.875rem;
    color: rgb(255, 120, 120);
  }

  .warning-icon {
    font-size: 1rem;
  }

  .channel-summary {
    font-size: 1rem;
    font-weight: 600;
    color: var(--ui-text);
    text-align: center;
    padding: 0.5rem;
    background: rgba(74, 255, 158, 0.05);
    border: 1px solid rgba(74, 255, 158, 0.2);
    border-radius: 4px;
  }

  .empty-message {
    font-size: 0.875rem;
    color: var(--ui-text-dim);
    font-style: italic;
  }
</style>
