<script lang="ts">
  import { onMount } from 'svelte';
  import { getDspInstance, dspConfig, updateConfig } from '../state/dspStore';
  import { pipelineConfigToCamillaDSP, camillaDSPToPipelineConfig, type PipelineConfig } from '../lib/pipelineConfigMapping';
  import { initializeFromConfig } from '../state/eqStore';
  import { listConfigs, getConfig, putConfig, type ConfigMetadata } from '../lib/api';

  let configs: ConfigMetadata[] = [];
  let loading = false;
  let error: string | null = null;
  let selectedConfigId: string | null = null;
  let showSaveDialog = false;
  let newConfigName = '';
  let saveError: string | null = null;
  let searchQuery = '';
  let searchInputElement: HTMLInputElement;
  let highlightedIndex = 0;

  // Filter configs by search query
  $: filteredConfigs = configs.filter((config) =>
    config.configName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Reset highlight when filtered list changes
  $: if (filteredConfigs.length > 0) {
    highlightedIndex = Math.min(highlightedIndex, filteredConfigs.length - 1);
  }

  // Load configs list on mount
  onMount(() => {
    loadConfigsList();
    
    // Global keyboard handler for '/' to focus search
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputElement) {
        e.preventDefault();
        searchInputElement?.focus();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });


  async function loadConfigsList() {
    loading = true;
    error = null;
    try {
      configs = await listConfigs();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load configs';
      console.error('Error loading configs:', err);
    } finally {
      loading = false;
    }
  }

  async function loadConfig(id: string) {
    loading = true;
    error = null;
    try {
      // Fetch pipeline-config from server using API module
      const pipelineConfig: PipelineConfig = await getConfig(id) as any;

      // Get DSP instance
      const dsp = getDspInstance();
      if (!dsp || !dsp.connected) {
        throw new Error('Not connected to CamillaDSP');
      }

      // Convert pipeline-config to CamillaDSP config (full replacement)
      const camillaConfig = pipelineConfigToCamillaDSP(pipelineConfig, dsp.config || undefined);

      // Upload to CamillaDSP
      dsp.config = camillaConfig;
      const success = await dsp.uploadConfig();

      if (!success) {
        throw new Error('Failed to upload config to CamillaDSP');
      }

      // Update global dspStore so EqPage can initialize from the new config
      updateConfig(camillaConfig);
      
      // Initialize EqStore immediately (even if EqPage isn't mounted)
      initializeFromConfig(camillaConfig);

      selectedConfigId = id;
      console.log(`Loaded config: ${pipelineConfig.configName}`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load config';
      console.error('Error loading config:', err);
    } finally {
      loading = false;
    }
  }

  function openSaveDialog() {
    showSaveDialog = true;
    newConfigName = '';
    saveError = null;
  }

  function closeSaveDialog() {
    showSaveDialog = false;
    newConfigName = '';
    saveError = null;
  }

  async function saveCurrentConfig() {
    if (!newConfigName.trim()) {
      saveError = 'Please enter a config name';
      return;
    }

    saveError = null;
    loading = true;

    try {
      // Get DSP instance
      const dsp = getDspInstance();
      if (!dsp || !dsp.connected) {
        throw new Error('Not connected to CamillaDSP');
      }

      // Download current config from CamillaDSP
      await dsp.downloadConfig();
      if (!dsp.config) {
        throw new Error('Failed to get current config from CamillaDSP');
      }

      // Convert to pipeline-config format
      const pipelineConfig = camillaDSPToPipelineConfig(dsp.config, newConfigName.trim());

      // Generate ID from name
      const id = newConfigName.toLowerCase().trim().replace(/\s+/g, '-');

      // Save to server using API module
      await putConfig(id, pipelineConfig as any);

      // Reload configs list
      await loadConfigsList();

      // Close dialog
      closeSaveDialog();

      console.log(`Saved config: ${newConfigName}`);
    } catch (err) {
      saveError = err instanceof Error ? err.message : 'Failed to save config';
      console.error('Error saving config:', err);
    } finally {
      loading = false;
    }
  }

  function formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Highlight matched substring in name
  function highlightMatch(name: string, query: string): string {
    if (!query) return name;
    
    const index = name.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return name;
    
    const before = name.slice(0, index);
    const match = name.slice(index, index + query.length);
    const after = name.slice(index + query.length);
    
    return `${before}<mark>${match}</mark>${after}`;
  }
</script>

<div class="presets-page">
  <!-- Sticky toolbar -->
  <div class="toolbar">
    <div class="toolbar-left">
      <h1>Presets</h1>
      <div class="search-box">
        <input
          type="text"
          bind:value={searchQuery}
          bind:this={searchInputElement}
          placeholder="Search presets... (press / to focus)"
          on:keydown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              highlightedIndex = Math.min(highlightedIndex + 1, filteredConfigs.length - 1);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              highlightedIndex = Math.max(highlightedIndex - 1, 0);
            } else if (e.key === 'Enter' && filteredConfigs[highlightedIndex]) {
              e.preventDefault();
              loadConfig(filteredConfigs[highlightedIndex].id);
            }
          }}
        />
        {#if searchQuery}
          <span class="search-count">{filteredConfigs.length} of {configs.length}</span>
        {/if}
      </div>
    </div>
    <button class="btn-primary" on:click={openSaveDialog} disabled={loading}>
      Save Current
    </button>
  </div>

  {#if error}
    <div class="error-banner">
      <span class="error-icon">⚠</span>
      <span>{error}</span>
      <button class="btn-text" on:click={() => (error = null)}>Dismiss</button>
    </div>
  {/if}

  {#if loading && configs.length === 0}
    <div class="loading">Loading presets...</div>
  {:else if configs.length === 0}
    <div class="empty-state">
      <p>No saved presets found.</p>
      <p class="empty-hint">Save your current EQ settings to get started.</p>
    </div>
  {:else if filteredConfigs.length === 0}
    <div class="empty-state">
      <p>No presets match "{searchQuery}"</p>
    </div>
  {:else}
    <div class="configs-list">
      {#each filteredConfigs as config, i}
        {@const isHighlighted = i === highlightedIndex}
        {@const isSelected = selectedConfigId === config.id}
        <div
          class="config-row"
          role="button"
          tabindex="0"
          class:highlighted={isHighlighted}
          class:selected={isSelected}
          on:click={() => loadConfig(config.id)}
          on:mouseenter={() => (highlightedIndex = i)}
          on:focus={() => (highlightedIndex = i)}
          on:keydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              loadConfig(config.id);
            }
          }}
        >
          <span class="config-name">{@html highlightMatch(config.configName, searchQuery)}</span>
          <button
            class="btn-load"
            on:click|stopPropagation={() => loadConfig(config.id)}
            disabled={loading}
          >
            Load
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showSaveDialog}
  <div 
    class="dialog-backdrop"
    role="button"
    tabindex="0"
    aria-label="Close dialog"
    on:click={closeSaveDialog}
    on:keydown={(e) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        closeSaveDialog();
      }
    }}
  >
    <div 
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <h2 id="dialog-title">Save Current Configuration</h2>
      <p class="dialog-help">
        This will save your current CamillaDSP configuration (pipeline + filters) to the library.
      </p>

      {#if saveError}
        <div class="dialog-error">
          {saveError}
        </div>
      {/if}

      <div class="form-group">
        <label for="config-name">Configuration Name</label>
        <input
          id="config-name"
          type="text"
          bind:value={newConfigName}
          placeholder="e.g., My Custom EQ"
          disabled={loading}
          on:keydown={(e) => e.key === 'Enter' && saveCurrentConfig()}
        />
      </div>

      <div class="dialog-buttons">
        <button class="btn-secondary" on:click={closeSaveDialog} disabled={loading}>
          Cancel
        </button>
        <button class="btn-primary" on:click={saveCurrentConfig} disabled={loading}>
          {loading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .presets-page {
    max-width: 900px;
    margin: 2rem auto;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    height: calc(100vh - 4rem);
  }

  /* Sticky toolbar */
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    gap: 1rem;
    flex-shrink: 0;
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    flex: 1;
    min-width: 0;
  }

  h1 {
    font-size: 1.5rem;
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
    margin: 0;
    white-space: nowrap;
  }

  .search-box {
    position: relative;
    flex: 1;
    max-width: 400px;
  }

  .search-box input {
    width: 100%;
    padding: 0.625rem 1rem;
    padding-right: 4.5rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.15));
    border-radius: 6px;
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
    font-size: 0.9375rem;
  }

  .search-box input:focus {
    outline: none;
    border-color: rgba(120, 160, 255, 0.5);
    background: rgba(255, 255, 255, 0.08);
  }

  .search-box input::placeholder {
    color: var(--ui-text-dim, rgba(255, 255, 255, 0.38));
  }

  .search-count {
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.8125rem;
    color: var(--ui-text-muted, rgba(255, 255, 255, 0.52));
    pointer-events: none;
  }

  .btn-primary {
    padding: 0.75rem 1.5rem;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 6px;
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
    font-size: 0.9375rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-primary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    margin-bottom: 2rem;
    background: rgba(255, 120, 120, 0.1);
    border: 1px solid rgba(255, 120, 120, 0.3);
    border-radius: 6px;
    color: rgb(255, 120, 120);
  }

  .error-icon {
    font-size: 1.25rem;
  }

  .btn-text {
    margin-left: auto;
    padding: 0.25rem 0.75rem;
    background: transparent;
    border: 1px solid rgba(255, 120, 120, 0.3);
    border-radius: 4px;
    color: rgb(255, 120, 120);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-text:hover {
    background: rgba(255, 120, 120, 0.1);
  }

  .loading {
    text-align: center;
    padding: 3rem;
    color: var(--ui-text-muted, rgba(255, 255, 255, 0.62));
  }

  .empty-state {
    text-align: center;
    padding: 3rem;
  }

  .empty-state p {
    color: var(--ui-text-muted, rgba(255, 255, 255, 0.62));
    margin: 0.5rem 0;
  }

  .empty-hint {
    font-size: 0.875rem;
    color: var(--ui-text-dim, rgba(255, 255, 255, 0.38));
  }

  /* Compact list */
  .configs-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .config-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    background: var(--ui-panel, #10141a);
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.1s ease;
  }

  .config-row:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.12);
  }

  .config-row.highlighted {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .config-row.selected {
    border-color: rgba(120, 160, 255, 0.4);
    background: rgba(120, 160, 255, 0.08);
  }

  .config-name {
    flex: 1;
    font-size: 0.9375rem;
    font-weight: 500;
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .config-name :global(mark) {
    background: rgba(255, 220, 100, 0.3);
    color: rgb(255, 220, 100);
    padding: 0.125rem 0.25rem;
    border-radius: 3px;
  }

  .btn-load {
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.1s ease;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .btn-load:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.14);
    border-color: rgba(255, 255, 255, 0.25);
  }

  .btn-load:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Dialog */
  .dialog-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .dialog {
    width: 90%;
    max-width: 500px;
    background: var(--ui-panel, #10141a);
    border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.15));
    border-radius: 12px;
    padding: 2rem;
  }

  .dialog h2 {
    font-size: 1.5rem;
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
    margin: 0 0 0.5rem 0;
  }

  .dialog-help {
    color: var(--ui-text-muted, rgba(255, 255, 255, 0.62));
    font-size: 0.9375rem;
    margin: 0 0 1.5rem 0;
  }

  .dialog-error {
    padding: 0.75rem 1rem;
    margin-bottom: 1rem;
    background: rgba(255, 120, 120, 0.1);
    border: 1px solid rgba(255, 120, 120, 0.3);
    border-radius: 6px;
    color: rgb(255, 120, 120);
    font-size: 0.875rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
    font-size: 0.875rem;
    font-weight: 500;
  }

  input {
    width: 100%;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.15));
    border-radius: 6px;
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
    font-size: 1rem;
  }

  input:focus {
    outline: none;
    border-color: rgba(120, 160, 255, 0.5);
    background: rgba(255, 255, 255, 0.08);
  }

  input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .dialog-buttons {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
  }

  .btn-secondary {
    padding: 0.75rem 1.5rem;
    background: transparent;
    border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.15));
    border-radius: 6px;
    color: var(--ui-text-muted, rgba(255, 255, 255, 0.62));
    font-size: 0.9375rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.25);
  }

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
