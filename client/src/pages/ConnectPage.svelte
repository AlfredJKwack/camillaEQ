<script lang="ts">
  import { router } from '../lib/router';
  import { 
    connectionState, 
    lastError, 
    connect, 
    disconnect, 
    dspVersion, 
    dspDevices, 
    dspConfigs, 
    dspFailures,
    dspConfig,
    exportDiagnostics 
  } from '../state/dspStore';

  let server = localStorage.getItem('camillaDSP.server') || 'localhost';
  let controlPort = localStorage.getItem('camillaDSP.controlPort') || '1234';
  let spectrumPort = localStorage.getItem('camillaDSP.spectrumPort') || '1235';
  let autoReconnect = localStorage.getItem('camillaDSP.autoReconnect') === 'true';
  let isConnecting = false;
  let copyFeedback = '';

  // Copy diagnostics to clipboard
  async function handleCopyDiagnostics() {
    try {
      const diagnostics = exportDiagnostics();
      const jsonString = JSON.stringify(diagnostics, null, 2);
      
      await navigator.clipboard.writeText(jsonString);
      
      copyFeedback = 'Copied to clipboard!';
      setTimeout(() => {
        copyFeedback = '';
      }, 2000);
    } catch (error) {
      console.error('Failed to copy diagnostics:', error);
      copyFeedback = 'Failed to copy';
      setTimeout(() => {
        copyFeedback = '';
      }, 2000);
    }
  }

  // Helper to format timestamp
  function formatTimestamp(ms: number): string {
    const date = new Date(ms);
    return date.toLocaleTimeString();
  }

  // Helper to check if device is in use
  function isDeviceInUse(deviceId: string, type: 'capture' | 'playback'): boolean {
    if (!$dspConfig) return false;
    const device = $dspConfig.devices[type]?.device;
    return device === deviceId;
  }

  // Save auto-reconnect preference when toggled
  $: {
    localStorage.setItem('camillaDSP.autoReconnect', String(autoReconnect));
  }

  async function handleConnect() {
    // Save to localStorage
    localStorage.setItem('camillaDSP.server', server);
    localStorage.setItem('camillaDSP.controlPort', controlPort);
    localStorage.setItem('camillaDSP.spectrumPort', spectrumPort);

    // Attempt connection
    isConnecting = true;
    try {
      await connect(server, Number(controlPort), Number(spectrumPort));
    } finally {
      isConnecting = false;
    }
  }

  function handleDisconnect() {
    disconnect();
  }

  function navigateToEq() {
    router.navigate('/eq');
  }

  // Derive display status
  $: statusDisplay = (() => {
    switch ($connectionState) {
      case 'connected':
        return { text: 'Connected', color: 'green', icon: '✓' };
      case 'degraded':
        return { text: 'Degraded (Spectrum Unavailable)', color: 'yellow', icon: '⚠' };
      case 'connecting':
        return { text: 'Connecting...', color: 'blue', icon: '◌' };
      case 'error':
        return { text: 'Connection Error', color: 'red', icon: '✕' };
      case 'disconnected':
      default:
        return { text: 'Not Connected', color: 'default', icon: '○' };
    }
  })();

  $: isConnected = $connectionState === 'connected' || $connectionState === 'degraded';
</script>

<div class="connect-page">
  <h1>Connection Parameters</h1>
  <p>Configure CamillaDSP WebSocket connection</p>

  <!-- Connection Status Display -->
  <div class="status-card" data-status={statusDisplay.color}>
    <div class="status-indicator" data-status={statusDisplay.color}>
      <span class="status-icon">{statusDisplay.icon}</span>
    </div>
    <div class="status-details">
      <div class="status-text">{statusDisplay.text}</div>
      {#if $connectionState === 'connected'}
        <div class="status-subtext">
          ws://{server}:{controlPort} (control) + :{spectrumPort} (spectrum)
        </div>
        {#if $dspVersion}
          <div class="status-subtext">
            CamillaDSP v{$dspVersion}
          </div>
        {/if}
      {/if}
      {#if $connectionState === 'error' && $lastError}
        <div class="error-message">
          {$lastError}
        </div>
      {/if}
    </div>
  </div>

  <form on:submit|preventDefault={handleConnect}>
    <div class="form-group">
      <label for="server">Server</label>
      <input
        id="server"
        type="text"
        bind:value={server}
        placeholder="localhost"
        required
      />
    </div>

    <div class="form-group">
      <label for="control-port">Control Port</label>
      <input
        id="control-port"
        type="number"
        bind:value={controlPort}
        placeholder="1234"
        required
      />
    </div>

    <div class="form-group">
      <label for="spectrum-port">Spectrum Port</label>
      <input
        id="spectrum-port"
        type="number"
        bind:value={spectrumPort}
        placeholder="1235"
        required
      />
    </div>

    <div class="form-group checkbox-group">
      <label class="checkbox-label">
        <input
          type="checkbox"
          bind:checked={autoReconnect}
        />
        <span>Auto-reconnect on page load</span>
      </label>
      <p class="checkbox-help">
        When enabled, the app will automatically reconnect using saved parameters when you reload the page or navigate back.
      </p>
    </div>

    <div class="button-group">
      {#if isConnected}
        <button type="button" class="btn-secondary" on:click={handleDisconnect}>
          Disconnect
        </button>
        <button type="button" class="btn-primary" on:click={navigateToEq}>
          Go to EQ Editor
        </button>
      {:else}
        <button type="submit" class="btn-primary" disabled={isConnecting}>
          {isConnecting ? 'Connecting...' : 'Connect'}
        </button>
      {/if}
    </div>
  </form>

  <!-- Available Audio Devices -->
  {#if $connectionState === 'connected' && $dspDevices}
    <div class="info-section">
      <h2>Available Audio Devices</h2>
      <p class="info-subtitle">Backend: {$dspDevices.backend}</p>

      <div class="device-lists">
        <div class="device-list">
          <h3>Capture Devices</h3>
          {#if $dspDevices.capture.length === 0}
            <p class="empty-message">No capture devices found</p>
          {:else}
            <ul class="device-entries">
              {#each $dspDevices.capture as [deviceId, deviceName]}
                <li class:in-use={isDeviceInUse(deviceId, 'capture')}>
                  <div class="device-id">{deviceId}</div>
                  {#if deviceName}
                    <div class="device-name">{deviceName}</div>
                  {/if}
                  {#if isDeviceInUse(deviceId, 'capture')}
                    <span class="in-use-badge">In Use</span>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <div class="device-list">
          <h3>Playback Devices</h3>
          {#if $dspDevices.playback.length === 0}
            <p class="empty-message">No playback devices found</p>
          {:else}
            <ul class="device-entries">
              {#each $dspDevices.playback as [deviceId, deviceName]}
                <li class:in-use={isDeviceInUse(deviceId, 'playback')}>
                  <div class="device-id">{deviceId}</div>
                  {#if deviceName}
                    <div class="device-name">{deviceName}</div>
                  {/if}
                  {#if isDeviceInUse(deviceId, 'playback')}
                    <span class="in-use-badge">In Use</span>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Current Configuration -->
  {#if $connectionState === 'connected' && $dspConfigs}
    <div class="info-section">
      <h2>Current Configuration</h2>

      <div class="config-panels">
        <!-- Control Port Config -->
        <div class="config-panel">
          <h3>Control Port</h3>
          {#if $dspConfigs.control.title}
            <div class="config-meta">
              <strong>Title:</strong> {$dspConfigs.control.title}
            </div>
          {/if}
          {#if $dspConfigs.control.description}
            <div class="config-meta">
              <strong>Description:</strong> {$dspConfigs.control.description}
            </div>
          {/if}
          {#if $dspConfigs.control.yaml}
            <pre class="config-yaml">{$dspConfigs.control.yaml}</pre>
          {:else}
            <p class="empty-message">No configuration available</p>
          {/if}
        </div>

        <!-- Spectrum Port Config -->
        <div class="config-panel">
          <h3>Spectrum Port</h3>
          {#if $dspConfigs.spectrum.title}
            <div class="config-meta">
              <strong>Title:</strong> {$dspConfigs.spectrum.title}
            </div>
          {/if}
          {#if $dspConfigs.spectrum.description}
            <div class="config-meta">
              <strong>Description:</strong> {$dspConfigs.spectrum.description}
            </div>
          {/if}
          {#if $dspConfigs.spectrum.yaml}
            <pre class="config-yaml">{$dspConfigs.spectrum.yaml}</pre>
          {:else}
            <p class="empty-message">No configuration available</p>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- DSP Failures -->
  {#if $dspFailures.length > 0}
    <div class="info-section failures-section">
      <div class="failures-header">
        <div>
          <h2>DSP Failure Messages</h2>
          <p class="info-subtitle">Last {$dspFailures.length} failures retained for diagnostics (max 50)</p>
        </div>
        <button class="btn-copy-diagnostics" on:click={handleCopyDiagnostics}>
          {copyFeedback || 'Copy Diagnostics'}
        </button>
      </div>
      
      <div class="failures-container">
        {#each $dspFailures as failure}
          <div class="failure-entry">
            <div class="failure-header">
              <span class="failure-timestamp">{formatTimestamp(failure.timestampMs)}</span>
              <span class="failure-socket">{failure.socket}</span>
              <span class="failure-command">{failure.command}</span>
            </div>
            <div class="failure-detail">
              <strong>Request:</strong>
              <pre class="failure-payload">{failure.request}</pre>
            </div>
            <div class="failure-detail">
              <strong>Response:</strong>
              <pre class="failure-payload">{JSON.stringify(failure.response, null, 2)}</pre>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .connect-page {
    max-width: 600px;
    margin: 2rem auto;
    padding: 2rem;
  }

  h1 {
    font-size: 1.75rem;
    margin-bottom: 0.5rem;
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
  }

  p {
    color: var(--ui-text-muted, rgba(255, 255, 255, 0.62));
    margin-bottom: 2rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  label {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
    font-size: 0.875rem;
  }

  input {
    width: 100%;
    padding: 0.75rem;
    background: var(--ui-panel, #10141a);
    border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
    border-radius: 4px;
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
    font-size: 1rem;
  }

  input:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.25);
  }

  .btn-primary {
    width: 100%;
    padding: 0.875rem;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 6px;
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
    font-size: 1rem;
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

  .btn-secondary {
    width: 100%;
    padding: 0.875rem;
    background: transparent;
    border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
    border-radius: 6px;
    color: var(--ui-text-muted, rgba(255, 255, 255, 0.62));
    font-size: 1rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-secondary:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .button-group {
    display: flex;
    gap: 1rem;
  }

  /* Status Card */
  .status-card {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    padding: 1rem;
    margin-bottom: 2rem;
    background: var(--ui-panel, #10141a);
    border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    transition: all 0.2s ease;
  }

  .status-card[data-status='green'] {
    border-color: rgba(120, 255, 190, 0.3);
    background: rgba(120, 255, 190, 0.03);
  }

  .status-card[data-status='yellow'] {
    border-color: rgba(255, 200, 80, 0.3);
    background: rgba(255, 200, 80, 0.03);
  }

  .status-card[data-status='blue'] {
    border-color: rgba(120, 160, 255, 0.3);
    background: rgba(120, 160, 255, 0.03);
  }

  .status-card[data-status='red'] {
    border-color: rgba(255, 120, 120, 0.3);
    background: rgba(255, 120, 120, 0.03);
  }

  .status-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    font-size: 1.25rem;
    flex-shrink: 0;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid var(--ui-border, rgba(255, 255, 255, 0.08));
  }

  .status-indicator[data-status='green'] {
    border-color: rgba(120, 255, 190, 0.5);
    background: rgba(120, 255, 190, 0.1);
    color: rgb(120, 255, 190);
  }

  .status-indicator[data-status='yellow'] {
    border-color: rgba(255, 200, 80, 0.5);
    background: rgba(255, 200, 80, 0.1);
    color: rgb(255, 200, 80);
  }

  .status-indicator[data-status='blue'] {
    border-color: rgba(120, 160, 255, 0.5);
    background: rgba(120, 160, 255, 0.1);
    color: rgb(120, 160, 255);
  }

  .status-indicator[data-status='red'] {
    border-color: rgba(255, 120, 120, 0.5);
    background: rgba(255, 120, 120, 0.1);
    color: rgb(255, 120, 120);
  }

  .status-icon {
    line-height: 1;
  }

  .status-details {
    flex: 1;
    min-width: 0;
  }

  .status-text {
    font-size: 1rem;
    font-weight: 600;
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
    margin-bottom: 0.25rem;
  }

  .status-subtext {
    font-size: 0.875rem;
    color: var(--ui-text-muted, rgba(255, 255, 255, 0.62));
    word-break: break-all;
  }

  .error-message {
    margin-top: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    font-size: 0.875rem;
    background: rgba(255, 120, 120, 0.1);
    border: 1px solid rgba(255, 120, 120, 0.3);
    color: rgb(255, 120, 120);
  }

  .checkbox-group {
    padding: 1rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
    border-radius: 6px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    margin-bottom: 0.5rem;
  }

  .checkbox-label input[type='checkbox'] {
    width: auto;
    cursor: pointer;
    accent-color: rgba(120, 160, 255, 0.8);
  }

  .checkbox-label span {
    font-size: 0.9375rem;
    font-weight: 500;
  }

  .checkbox-help {
    margin: 0;
    padding-left: 2rem;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--ui-text-muted, rgba(255, 255, 255, 0.52));
  }

  /* Info Sections */
  .info-section {
    margin-top: 3rem;
    padding: 1.5rem;
    background: var(--ui-panel, #10141a);
    border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
  }

  .info-section h2 {
    font-size: 1.25rem;
    margin-bottom: 0.5rem;
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
  }

  .info-subtitle {
    font-size: 0.875rem;
    color: var(--ui-text-muted, rgba(255, 255, 255, 0.62));
    margin-bottom: 1rem;
  }

  /* Device Lists */
  .device-lists {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
  }

  .device-list h3 {
    font-size: 1rem;
    margin-bottom: 0.75rem;
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
  }

  .device-entries {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .device-entries li {
    padding: 0.75rem;
    margin-bottom: 0.5rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
    border-radius: 4px;
    position: relative;
  }

  .device-entries li.in-use {
    border-color: rgba(120, 255, 190, 0.3);
    background: rgba(120, 255, 190, 0.05);
  }

  .device-id {
    font-size: 0.9rem;
    font-family: 'Courier New', monospace;
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
    margin-bottom: 0.25rem;
  }

  .device-name {
    font-size: 0.8rem;
    color: var(--ui-text-muted, rgba(255, 255, 255, 0.62));
  }

  .in-use-badge {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    background: rgba(120, 255, 190, 0.2);
    border: 1px solid rgba(120, 255, 190, 0.4);
    border-radius: 3px;
    color: rgb(120, 255, 190);
    font-weight: 600;
  }

  .empty-message {
    font-size: 0.875rem;
    color: var(--ui-text-muted, rgba(255, 255, 255, 0.52));
    font-style: italic;
  }

  /* Config Panels */
  .config-panels {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
  }

  .config-panel h3 {
    font-size: 1rem;
    margin-bottom: 0.75rem;
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
  }

  .config-meta {
    font-size: 0.875rem;
    margin-bottom: 0.5rem;
    color: var(--ui-text-muted, rgba(255, 255, 255, 0.72));
  }

  .config-meta strong {
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
  }

  .config-yaml {
    max-height: 400px;
    overflow-y: auto;
    padding: 0.75rem;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
    border-radius: 4px;
    font-size: 0.8rem;
    font-family: 'Courier New', monospace;
    color: var(--ui-text-muted, rgba(255, 255, 255, 0.72));
    white-space: pre-wrap;
    word-wrap: break-word;
    line-height: 1.4;
    margin-top: 0.75rem;
  }

  /* Failures Section */
  .failures-section {
    border-color: rgba(255, 120, 120, 0.3);
    background: rgba(255, 120, 120, 0.05);
  }

  .failures-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    gap: 1rem;
  }

  .btn-copy-diagnostics {
    padding: 0.5rem 1rem;
    background: rgba(120, 160, 255, 0.15);
    border: 1px solid rgba(120, 160, 255, 0.3);
    border-radius: 4px;
    color: rgb(120, 160, 255);
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .btn-copy-diagnostics:hover {
    background: rgba(120, 160, 255, 0.25);
    border-color: rgba(120, 160, 255, 0.4);
  }

  .failures-container {
    max-height: 400px;
    overflow-y: auto;
  }

  .failure-entry {
    padding: 1rem;
    margin-bottom: 1rem;
    background: rgba(255, 120, 120, 0.1);
    border: 1px solid rgba(255, 120, 120, 0.3);
    border-radius: 4px;
  }

  .failure-header {
    display: flex;
    gap: 1rem;
    margin-bottom: 0.75rem;
    font-size: 0.875rem;
  }

  .failure-timestamp {
    color: var(--ui-text-muted, rgba(255, 255, 255, 0.62));
  }

  .failure-socket {
    padding: 0.125rem 0.5rem;
    background: rgba(120, 160, 255, 0.2);
    border: 1px solid rgba(120, 160, 255, 0.4);
    border-radius: 3px;
    color: rgb(120, 160, 255);
    font-weight: 600;
    font-size: 0.75rem;
  }

  .failure-command {
    padding: 0.125rem 0.5rem;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    font-size: 0.75rem;
  }

  .failure-detail {
    margin-top: 0.75rem;
  }

  .failure-detail strong {
    font-size: 0.8rem;
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
    display: block;
    margin-bottom: 0.25rem;
  }

  .failure-payload {
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 120, 120, 0.2);
    border-radius: 3px;
    font-size: 0.75rem;
    font-family: 'Courier New', monospace;
    color: var(--ui-text-muted, rgba(255, 255, 255, 0.72));
    white-space: pre-wrap;
    word-wrap: break-word;
    line-height: 1.4;
    margin: 0;
    max-height: 200px;
    overflow-y: auto;
  }

  @media (max-width: 900px) {
    .device-lists,
    .config-panels {
      grid-template-columns: 1fr;
    }
  }
</style>
