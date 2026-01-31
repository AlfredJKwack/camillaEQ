<script lang="ts">
  import { connectionState, dspConfig } from '../state/dspStore';
  import { buildPipelineViewModel, type PipelineBlockVm } from '../lib/pipelineViewModel';
  import FilterBlock from '../components/pipeline/FilterBlock.svelte';
  import MixerBlock from '../components/pipeline/MixerBlock.svelte';
  import ProcessorBlock from '../components/pipeline/ProcessorBlock.svelte';

  // Reactive pipeline blocks
  $: blocks = $dspConfig ? buildPipelineViewModel($dspConfig) : [];
  $: isConnected = $connectionState === 'connected' || $connectionState === 'degraded';
</script>

<div class="pipeline-page">
  <div class="page-header">
    <h1>Pipeline Editor</h1>
    <p>Visual representation of the CamillaDSP audio processing pipeline</p>
  </div>

  {#if !isConnected}
    <div class="empty-state">
      <div class="empty-icon">🔌</div>
      <h2>Not Connected</h2>
      <p>Connect to CamillaDSP to view the pipeline configuration</p>
    </div>
  {:else if !$dspConfig}
    <div class="empty-state">
      <div class="empty-icon">⏳</div>
      <h2>Loading Configuration</h2>
      <p>Fetching pipeline data from CamillaDSP...</p>
    </div>
  {:else if blocks.length === 0}
    <div class="empty-state">
      <div class="empty-icon">📋</div>
      <h2>Empty Pipeline</h2>
      <p>No processing steps configured</p>
    </div>
  {:else}
    <div class="pipeline-container">
      <!-- Input indicator -->
      <div class="flow-indicator input-indicator">
        <span class="flow-label">INPUT</span>
        <div class="flow-arrow">↓</div>
      </div>

      <!-- Pipeline blocks -->
      <div class="pipeline-blocks">
        {#each blocks as block, i (block.stepIndex)}
          {#if block.kind === 'filter'}
            <FilterBlock {block} />
          {:else if block.kind === 'mixer'}
            <MixerBlock {block} />
          {:else if block.kind === 'processor'}
            <ProcessorBlock {block} />
          {/if}

          <!-- Connector arrow between blocks -->
          {#if i < blocks.length - 1}
            <div class="flow-connector">
              <div class="flow-line"></div>
              <div class="flow-arrow">↓</div>
            </div>
          {/if}
        {/each}
      </div>

      <!-- Output indicator -->
      <div class="flow-indicator output-indicator">
        <div class="flow-arrow">↓</div>
        <span class="flow-label">OUTPUT</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .pipeline-page {
    max-width: 720px;
    margin: 1rem auto;
    padding: 0 1rem;
  }

  .page-header {
    margin-bottom: 2rem;
  }

  h1 {
    font-size: 1.75rem;
    margin-bottom: 0.5rem;
    color: var(--ui-text);
  }

  p {
    color: var(--ui-text-muted);
    margin: 0;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 4rem 2rem;
    text-align: center;
  }

  .empty-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .empty-state h2 {
    font-size: 1.25rem;
    color: var(--ui-text);
    margin-bottom: 0.5rem;
  }

  .empty-state p {
    font-size: 0.9375rem;
    color: var(--ui-text-muted);
  }

  .pipeline-container {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .flow-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1rem 0;
  }

  .flow-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--ui-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .flow-arrow {
    font-size: 1.5rem;
    color: var(--ui-text-dim);
    line-height: 1;
  }

  .input-indicator {
    padding-top: 0;
  }

  .output-indicator {
    padding-bottom: 0;
  }

  .pipeline-blocks {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .flow-connector {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.5rem 0;
  }

  .flow-line {
    width: 2px;
    height: 1rem;
    background: var(--ui-border);
  }

  .flow-connector .flow-arrow {
    font-size: 1.25rem;
    color: var(--ui-text-dim);
    line-height: 1;
  }
</style>
