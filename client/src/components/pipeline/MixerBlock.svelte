<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { MixerBlockVm } from '../../lib/pipelineViewModel';
  import type { MixerDefinition } from '../../lib/camillaDSP';
  import type { MixerValidationResult } from '../../lib/mixerRoutingValidation';
  import KnobDial from '../KnobDial.svelte';

  export let block: MixerBlockVm;
  export let expanded: boolean = false;
  export let mixer: MixerDefinition | null = null;
  export let validation: MixerValidationResult | null = null;

  const dispatch = createEventDispatcher<{
    setGain: { destIndex: number; sourceIndex: number; gain: number };
    toggleSourceMute: { destIndex: number; sourceIndex: number };
    toggleSourceInvert: { destIndex: number; sourceIndex: number };
    setDestMute: { destIndex: number; mute: boolean };
    addSource: { destIndex: number; channel: number };
    removeSource: { destIndex: number; sourceIndex: number };
  }>();

  // Track which destinations have "add source" dropdown open
  let addSourceDropdowns: Set<number> = new Set();

  function handleGainChange(destIndex: number, sourceIndex: number, event: CustomEvent<{ value: number }>) {
    dispatch('setGain', { destIndex, sourceIndex, gain: event.detail.value });
  }

  function handleSourceMuteToggle(destIndex: number, sourceIndex: number) {
    dispatch('toggleSourceMute', { destIndex, sourceIndex });
  }

  function handleSourceInvertToggle(destIndex: number, sourceIndex: number) {
    dispatch('toggleSourceInvert', { destIndex, sourceIndex });
  }

  function handleDestMuteToggle(destIndex: number, event: Event) {
    const checkbox = event.target as HTMLInputElement;
    dispatch('setDestMute', { destIndex, mute: checkbox.checked });
  }

  function toggleAddSourceDropdown(destIndex: number) {
    if (addSourceDropdowns.has(destIndex)) {
      addSourceDropdowns.delete(destIndex);
    } else {
      addSourceDropdowns.add(destIndex);
    }
    addSourceDropdowns = addSourceDropdowns; // Trigger reactivity
  }

  function handleAddSource(destIndex: number, channel: number) {
    dispatch('addSource', { destIndex, channel });
    addSourceDropdowns.delete(destIndex);
    addSourceDropdowns = addSourceDropdowns;
  }

  function handleRemoveSource(destIndex: number, sourceIndex: number) {
    dispatch('removeSource', { destIndex, sourceIndex });
  }

  // Get available channels for adding (not already in this destination)
  function getAvailableChannels(destIndex: number): number[] {
    if (!mixer || !mixer.mapping || !mixer.mapping[destIndex]) return [];
    
    const usedChannels = new Set(mixer.mapping[destIndex].sources.map(s => s.channel));
    const available: number[] = [];
    for (let ch = 0; ch < mixer.channels.in; ch++) {
      if (!usedChannels.has(ch)) {
        available.push(ch);
      }
    }
    return available;
  }
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
    {:else if block.channelsInOut && !expanded}
      <div class="channel-summary">
        {block.channelsInOut.in} → {block.channelsInOut.out}
      </div>
    {:else if !mixer}
      <div class="empty-message">No channel info</div>
    {/if}

    {#if expanded && mixer}
      <div class="mixer-editor">
        {#each mixer.mapping as dest, destIndex}
          {@const destValidation = validation?.perDest.find(v => v.dest === dest.dest)}
          <div class="dest-section">
            <div class="dest-header">
              <span class="dest-label">Dest {dest.dest}</span>
              <label class="dest-mute-toggle">
                <input
                  type="checkbox"
                  checked={dest.mute || false}
                  on:change={(e) => handleDestMuteToggle(destIndex, e)}
                />
                <span>Mute</span>
              </label>
              {#if destValidation?.errors && destValidation.errors.length > 0}
                <span class="error-badge" title={destValidation.errors.join(', ')}>⚠ Error</span>
              {/if}
              {#if destValidation?.warnings && destValidation.warnings.length > 0}
                <span class="warning-badge" title={destValidation.warnings.join(', ')}>⚠ Warning</span>
              {/if}
            </div>

            {#if destValidation?.errors && destValidation.errors.length > 0}
              <div class="validation-messages errors">
                {#each destValidation.errors as error}
                  <div class="validation-msg">{error}</div>
                {/each}
              </div>
            {/if}

            {#if destValidation?.warnings && destValidation.warnings.length > 0}
              <div class="validation-messages warnings">
                {#each destValidation.warnings as warning}
                  <div class="validation-msg">{warning}</div>
                {/each}
              </div>
            {/if}

            <div class="sources-list">
              {#each dest.sources as source, sourceIndex}
                <div class="source-row">
                  <span class="source-label">Src {source.channel}</span>
                  
                  <div class="source-gain">
                    <KnobDial
                      value={source.gain}
                      min={-150}
                      max={50}
                      scale="linear"
                      size={24}
                      on:change={(e) => handleGainChange(destIndex, sourceIndex, e)}
                    />
                    <span class="gain-value">{source.gain.toFixed(1)} dB</span>
                  </div>

                  <label class="source-toggle">
                    <input
                      type="checkbox"
                      checked={source.inverted || false}
                      on:change={() => handleSourceInvertToggle(destIndex, sourceIndex)}
                    />
                    <span>Invert</span>
                  </label>

                  <label class="source-toggle">
                    <input
                      type="checkbox"
                      checked={source.mute || false}
                      on:change={() => handleSourceMuteToggle(destIndex, sourceIndex)}
                    />
                    <span>Mute</span>
                  </label>

                  <button
                    class="remove-btn"
                    on:click={() => handleRemoveSource(destIndex, sourceIndex)}
                    title="Remove source"
                  >×</button>
                </div>
              {/each}
            </div>

            <div class="add-source-section">
              {#if !addSourceDropdowns.has(destIndex)}
                <button
                  class="add-source-btn"
                  on:click={() => toggleAddSourceDropdown(destIndex)}
                >+ Add Source</button>
              {:else}
                {@const availableChannels = getAvailableChannels(destIndex)}
                {#if availableChannels.length > 0}
                  <div class="add-source-dropdown">
                    {#each availableChannels as ch}
                      <button
                        class="channel-option"
                        on:click={() => handleAddSource(destIndex, ch)}
                      >Channel {ch}</button>
                    {/each}
                    <button
                      class="channel-option cancel"
                      on:click={() => toggleAddSourceDropdown(destIndex)}
                    >Cancel</button>
                  </div>
                {:else}
                  <div class="add-source-dropdown">
                    <span class="no-channels">All channels in use</span>
                    <button
                      class="channel-option cancel"
                      on:click={() => toggleAddSourceDropdown(destIndex)}
                    >Close</button>
                  </div>
                {/if}
              {/if}
            </div>
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

  /* Mixer editor styles */
  .mixer-editor {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding-top: 0.5rem;
  }

  .dest-section {
    background: rgba(255, 255, 255, 0.02);
    border: 1px solid var(--ui-border);
    border-radius: 6px;
    padding: 0.75rem;
  }

  .dest-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .dest-label {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--ui-text);
  }

  .dest-mute-toggle {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8125rem;
    color: var(--ui-text-muted);
    cursor: pointer;
  }

  .dest-mute-toggle input[type="checkbox"] {
    cursor: pointer;
  }

  .error-badge {
    padding: 0.125rem 0.5rem;
    background: rgba(255, 120, 120, 0.15);
    border: 1px solid rgba(255, 120, 120, 0.3);
    border-radius: 3px;
    font-size: 0.75rem;
    color: rgb(255, 120, 120);
    font-weight: 600;
  }

  .warning-badge {
    padding: 0.125rem 0.5rem;
    background: rgba(255, 200, 80, 0.15);
    border: 1px solid rgba(255, 200, 80, 0.3);
    border-radius: 3px;
    font-size: 0.75rem;
    color: rgb(255, 200, 80);
    font-weight: 600;
  }

  .validation-messages {
    margin-bottom: 0.75rem;
    padding: 0.5rem;
    border-radius: 4px;
    font-size: 0.8125rem;
  }

  .validation-messages.errors {
    background: rgba(255, 120, 120, 0.1);
    border: 1px solid rgba(255, 120, 120, 0.3);
    color: rgb(255, 120, 120);
  }

  .validation-messages.warnings {
    background: rgba(255, 200, 80, 0.1);
    border: 1px solid rgba(255, 200, 80, 0.3);
    color: rgb(255, 200, 80);
  }

  .validation-msg {
    margin-bottom: 0.25rem;
  }

  .validation-msg:last-child {
    margin-bottom: 0;
  }

  .sources-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .source-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--ui-border);
    border-radius: 4px;
  }

  .source-label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--ui-text);
    min-width: 3rem;
  }

  .source-gain {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .gain-value {
    font-size: 0.8125rem;
    font-family: 'Courier New', monospace;
    color: var(--ui-text-muted);
    min-width: 4rem;
  }

  .source-toggle {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.8125rem;
    color: var(--ui-text-muted);
    cursor: pointer;
    user-select: none;
  }

  .source-toggle input[type="checkbox"] {
    cursor: pointer;
  }

  .remove-btn {
    margin-left: auto;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 120, 120, 0.1);
    border: 1px solid rgba(255, 120, 120, 0.3);
    border-radius: 3px;
    color: rgb(255, 120, 120);
    font-size: 1.25rem;
    font-weight: 600;
    line-height: 1;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .remove-btn:hover {
    background: rgba(255, 120, 120, 0.2);
    border-color: rgba(255, 120, 120, 0.5);
  }

  .add-source-section {
    margin-top: 0.5rem;
  }

  .add-source-btn {
    padding: 0.375rem 0.75rem;
    background: rgba(74, 255, 158, 0.1);
    border: 1px solid rgba(74, 255, 158, 0.3);
    border-radius: 4px;
    color: rgb(74, 255, 158);
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .add-source-btn:hover {
    background: rgba(74, 255, 158, 0.15);
    border-color: rgba(74, 255, 158, 0.4);
  }

  .add-source-dropdown {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem;
    background: var(--ui-panel-2);
    border: 1px solid var(--ui-border);
    border-radius: 4px;
  }

  .channel-option {
    padding: 0.375rem 0.75rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--ui-border);
    border-radius: 3px;
    color: var(--ui-text);
    font-size: 0.8125rem;
    text-align: left;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .channel-option:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .channel-option.cancel {
    color: var(--ui-text-muted);
    border-style: dashed;
  }

  .no-channels {
    font-size: 0.8125rem;
    color: var(--ui-text-dim);
    font-style: italic;
    padding: 0.375rem 0.75rem;
  }
</style>
