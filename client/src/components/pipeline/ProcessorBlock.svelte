<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { ProcessorBlockVm } from '../../lib/pipelineViewModel';
  import KnobDial from '../KnobDial.svelte';

  export let block: ProcessorBlockVm;
  export let expanded: boolean = false;
  
  const dispatch = createEventDispatcher<{
    updateProcessorParam: { processorName: string; param: string; value: number };
    setProcessorBypassed: { blockId: string; bypassed: boolean };
  }>();
  
  // Helper to format parameter value
  function formatParam(value: any): string {
    if (typeof value === 'number') {
      return value.toFixed(2);
    }
    return String(value);
  }
  
  // Get key parameters for supported processors
  function getKeyParams(def: any, type: string): Array<{label: string; value: string}> {
    if (!def || !def.parameters) return [];
    
    const params = def.parameters;
    
    if (type === 'Compressor') {
      return [
        { label: 'Channels', value: String(params.channels || '?') },
        { label: 'Threshold', value: `${formatParam(params.threshold)} dB` },
        { label: 'Factor', value: formatParam(params.factor) },
        { label: 'Attack', value: `${formatParam(params.attack)} s` },
        { label: 'Release', value: `${formatParam(params.release)} s` },
      ];
    } else if (type === 'NoiseGate') {
      return [
        { label: 'Channels', value: String(params.channels || '?') },
        { label: 'Threshold', value: `${formatParam(params.threshold)} dB` },
        { label: 'Attenuation', value: `${formatParam(params.attenuation)} dB` },
        { label: 'Attack', value: `${formatParam(params.attack)} s` },
        { label: 'Release', value: `${formatParam(params.release)} s` },
      ];
    }
    
    return [];
  }
  
  $: keyParams = block.supported && block.processorType ? getKeyParams(block.definition, block.processorType) : [];
  $: jsonText = block.definition ? JSON.stringify(block.definition, null, 2) : 
                 block.rawStep ? JSON.stringify(block.rawStep, null, 2) : 
                 '{}';
  
  // Edit mode helpers
  function handleParamChange(param: string, value: number) {
    if (!block.name) return;
    dispatch('updateProcessorParam', { processorName: block.name, param, value });
  }
  
  function handleBypassToggle() {
    dispatch('setProcessorBypassed', { blockId: block.blockId, bypassed: !block.bypassed });
  }
  
  // Get editable parameters for processor type
  function getEditableParams(def: any, type: string) {
    if (!def || !def.parameters) return [];
    const params = def.parameters;
    
    if (type === 'Compressor') {
      return [
        { key: 'threshold', label: 'Threshold', value: Number(params.threshold || -20), unit: 'dB', min: -80, max: 0 },
        { key: 'attack', label: 'Attack', value: Number(params.attack || 0.01), unit: 's', min: 0, max: 0.5 },
        { key: 'release', label: 'Release', value: Number(params.release || 0.1), unit: 's', min: 0, max: 2.0 },
        { key: 'factor', label: 'Factor', value: Number(params.factor || 2), unit: '', min: 1, max: 20 },
        ...(params.makeup_gain !== undefined ? 
          [{ key: 'makeup_gain', label: 'Makeup Gain', value: Number(params.makeup_gain), unit: 'dB', min: -24, max: 24 }] : 
          []
        ),
      ];
    } else if (type === 'NoiseGate') {
      return [
        { key: 'threshold', label: 'Threshold', value: Number(params.threshold || -60), unit: 'dB', min: -100, max: 0 },
        { key: 'attenuation', label: 'Attenuation', value: Number(params.attenuation || -60), unit: 'dB', min: -120, max: 0 },
        { key: 'attack', label: 'Attack', value: Number(params.attack || 0.01), unit: 's', min: 0, max: 0.5 },
        { key: 'release', label: 'Release', value: Number(params.release || 0.1), unit: 's', min: 0, max: 2.0 },
      ];
    }
    
    return [];
  }
  
  $: editableParams = block.supported && block.processorType && expanded ? getEditableParams(block.definition, block.processorType) : [];
  $: channelsValue = block.definition?.parameters?.channels;
</script>

<div class="pipeline-block processor-block" data-bypassed={block.bypassed} data-supported={block.supported}>
  <div class="block-header">
    <span class="block-type">{block.typeLabel}</span>
    {#if block.name}
      <span class="processor-name">{block.name}</span>
    {/if}
    {#if block.bypassed}
      <span class="bypass-pill">Bypassed</span>
    {/if}
    {#if !block.exists}
      <span class="warning-badge">Missing</span>
    {/if}
  </div>

  <div class="block-body">
    {#if !block.exists}
      <div class="warning-message">
        <span class="warning-icon">⚠</span>
        Processor "{block.name}" not found in config
      </div>
    {:else if block.supported}
      <!-- Known processor (Compressor/NoiseGate): Show parameter summary -->
      {#if !expanded}
        <div class="param-summary">
          {#each keyParams.slice(0, 3) as param}
            <div class="param-item">
              <span class="param-label">{param.label}:</span>
              <span class="param-value">{param.value}</span>
            </div>
          {/each}
        </div>
      {:else}
        <!-- Expanded: show edit controls -->
        <div class="edit-controls">
          <!-- Bypass toggle -->
          <div class="control-row bypass-control">
            <label class="control-label">
              <input 
                type="checkbox" 
                checked={block.bypassed} 
                on:change={handleBypassToggle}
              />
              <span>Bypass</span>
            </label>
          </div>
          
          <!-- Parameter controls with KnobDials -->
          {#each editableParams as param}
            <div class="control-row">
              <span class="control-label">{param.label}</span>
              <div class="control-input">
                <KnobDial
                  value={param.value}
                  min={param.min}
                  max={param.max}
                  scale="linear"
                  size={28}
                  on:change={(e) => handleParamChange(param.key, e.detail.value)}
                />
                <span class="control-value">
                  {param.value.toFixed(2)}{param.unit}
                </span>
              </div>
            </div>
          {/each}
          
          <!-- Channels (numeric input) -->
          {#if channelsValue !== undefined}
            <div class="control-row">
              <label class="control-label" for="proc-channels-{block.blockId}">
                Channels
              </label>
              <input
                id="proc-channels-{block.blockId}"
                type="number"
                min="1"
                step="1"
                value={channelsValue}
                on:input={(e) => handleParamChange('channels', Number(e.currentTarget.value))}
                class="numeric-input"
              />
            </div>
          {/if}
        </div>
        
        <details class="json-details">
          <summary>Raw Definition (JSON)</summary>
          <pre class="json-display">{jsonText}</pre>
        </details>
      {/if}
    {:else}
      <!-- Unknown/unsupported processor: Show info + JSON -->
      <div class="info-message">
        <span class="info-icon">ℹ</span>
        {#if block.definition}
          Unsupported processor type: {block.processorType || 'unknown'}
        {:else}
          Unknown pipeline step type
        {/if}
      </div>
      
      {#if expanded}
        <div class="json-container">
          <div class="json-label">Definition:</div>
          <pre class="json-display">{jsonText}</pre>
        </div>
      {/if}
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

  .processor-block {
    border-left: 3px solid color-mix(in oklab, #aaaaaa 50%, var(--ui-border) 50%);
  }
  
  .processor-block[data-supported='true'] {
    border-left-color: color-mix(in oklab, #d4a4ff 50%, var(--ui-border) 50%);
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
  
  .warning-badge {
    padding: 0.125rem 0.5rem;
    background: rgba(255, 120, 120, 0.2);
    border: 1px solid rgba(255, 120, 120, 0.4);
    border-radius: 3px;
    font-size: 0.75rem;
    color: rgb(255, 120, 120);
    font-weight: 600;
  }

  .block-body {
    padding-top: 0.5rem;
    border-top: 1px solid var(--ui-border);
  }

  .info-message, .warning-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: 4px;
    font-size: 0.875rem;
  }
  
  .info-message {
    background: rgba(170, 170, 170, 0.1);
    border: 1px solid rgba(170, 170, 170, 0.3);
    color: var(--ui-text-muted);
  }
  
  .warning-message {
    background: rgba(255, 120, 120, 0.1);
    border: 1px solid rgba(255, 120, 120, 0.3);
    color: rgb(255, 120, 120);
  }

  .info-icon, .warning-icon {
    font-size: 1rem;
  }
  
  /* Parameter display for supported processors */
  .param-summary {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding: 0.5rem;
    background: rgba(212, 164, 255, 0.05);
    border: 1px solid rgba(212, 164, 255, 0.2);
    border-radius: 4px;
  }
  
  .param-item {
    display: flex;
    gap: 0.5rem;
    font-size: 0.8125rem;
  }
  
  .param-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  
  .param-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--ui-border);
    border-radius: 4px;
  }
  
  .param-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--ui-text-muted);
  }
  
  .param-value {
    font-size: 0.8125rem;
    font-family: 'Courier New', monospace;
    color: var(--ui-text);
  }
  
  /* JSON display */
  .json-details {
    margin-top: 0.75rem;
  }
  
  .json-details summary {
    cursor: pointer;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--ui-text-muted);
    padding: 0.375rem;
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.02);
    transition: all 0.15s ease;
  }
  
  .json-details summary:hover {
    background: rgba(255, 255, 255, 0.04);
  }
  
  .json-container {
    margin-top: 0.75rem;
  }
  
  .json-label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ui-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.375rem;
  }
  
  .json-display {
    padding: 0.75rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 0.75rem;
    color: var(--ui-text-muted);
    overflow-x: auto;
    white-space: pre;
    margin: 0;
    max-height: 300px;
    overflow-y: auto;
  }
  
  /* Edit controls */
  .edit-controls {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1rem;
    padding: 0.75rem;
    background: rgba(212, 164, 255, 0.05);
    border: 1px solid rgba(212, 164, 255, 0.2);
    border-radius: 4px;
  }
  
  .control-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }
  
  .bypass-control {
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--ui-border);
  }
  
  .control-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--ui-text-muted);
    min-width: 100px;
  }
  
  .bypass-control .control-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }
  
  .bypass-control input[type="checkbox"] {
    cursor: pointer;
  }
  
  .control-input {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  
  .control-value {
    font-family: 'Courier New', monospace;
    font-size: 0.8125rem;
    color: var(--ui-text);
    min-width: 80px;
    text-align: right;
  }
  
  .numeric-input {
    width: 80px;
    padding: 0.375rem 0.5rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--ui-border);
    border-radius: 4px;
    color: var(--ui-text);
    font-family: 'Courier New', monospace;
    font-size: 0.8125rem;
  }
  
  .numeric-input:focus {
    outline: none;
    border-color: rgba(212, 164, 255, 0.5);
  }
</style>
