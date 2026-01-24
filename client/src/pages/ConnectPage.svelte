<script lang="ts">
  import { router } from '../lib/router';

  let server = localStorage.getItem('camillaDSP.server') || 'localhost';
  let controlPort = localStorage.getItem('camillaDSP.controlPort') || '1234';
  let spectrumPort = localStorage.getItem('camillaDSP.spectrumPort') || '1235';

  function saveAndNavigate() {
    localStorage.setItem('camillaDSP.server', server);
    localStorage.setItem('camillaDSP.controlPort', controlPort);
    localStorage.setItem('camillaDSP.spectrumPort', spectrumPort);
    router.navigate('/eq');
  }
</script>

<div class="connect-page">
  <h1>Connection Parameters</h1>
  <p>Configure CamillaDSP WebSocket connection</p>

  <form on:submit|preventDefault={saveAndNavigate}>
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

    <button type="submit" class="btn-primary">Save & Go to EQ</button>
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

  .btn-primary:hover {
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(255, 255, 255, 0.3);
  }
</style>
