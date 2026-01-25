<script lang="ts">
  import { router } from '../lib/router';
  import { connectionState, lastError, connect, disconnect } from '../state/dspStore';

  let server = localStorage.getItem('camillaDSP.server') || 'localhost';
  let controlPort = localStorage.getItem('camillaDSP.controlPort') || '1234';
  let spectrumPort = localStorage.getItem('camillaDSP.spectrumPort') || '1235';
  let autoReconnect = localStorage.getItem('camillaDSP.autoReconnect') === 'true';
  let isConnecting = false;

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
      case 'connecting':
        return { text: 'Connecting...', color: 'blue', icon: '◌' };
      case 'error':
        return { text: 'Connection Error', color: 'red', icon: '✕' };
      case 'disconnected':
      default:
        return { text: 'Not Connected', color: 'default', icon: '○' };
    }
  })();

  $: isConnected = $connectionState === 'connected';
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
</div>

<style>
  .connect-page {
    max-width: 500px;
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

  .upload-status {
    margin-top: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    font-size: 0.875rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
  }

  .upload-status[data-status='green'] {
    background: rgba(120, 255, 190, 0.1);
    border-color: rgba(120, 255, 190, 0.3);
    color: rgb(120, 255, 190);
  }

  .upload-status[data-status='blue'] {
    background: rgba(120, 160, 255, 0.1);
    border-color: rgba(120, 160, 255, 0.3);
    color: rgb(120, 160, 255);
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
</style>
