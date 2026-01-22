<script lang="ts">
  import { onMount } from 'svelte';

  let healthStatus = 'checking...';
  let versionInfo = { version: '...', buildHash: '...', buildTime: '...' };

  onMount(async () => {
    try {
      const healthRes = await fetch('/health');
      const health = await healthRes.json();
      healthStatus = health.status;

      const versionRes = await fetch('/api/version');
      const version = await versionRes.json();
      versionInfo = version;
    } catch (error) {
      healthStatus = 'error';
      console.error('Failed to fetch health/version:', error);
    }
  });
</script>

<main>
  <h1>CamillaEQ</h1>
  <p>CamillaDSP Graphical Equalizer Interface</p>
  
  <div class="status">
    <h2>System Status</h2>
    <p>Health: <strong>{healthStatus}</strong></p>
    <p>Version: <strong>{versionInfo.version}</strong></p>
    <p>Build: {versionInfo.buildHash}</p>
    <p>Build Time: {versionInfo.buildTime}</p>
  </div>
</main>

<style>
  main {
    padding: 2rem;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    max-width: 800px;
    margin: 0 auto;
  }

  h1 {
    color: #ff3e00;
    font-size: 3rem;
    margin-bottom: 0.5rem;
  }

  .status {
    margin-top: 2rem;
    padding: 1rem;
    background: #f5f5f5;
    border-radius: 8px;
  }

  .status h2 {
    margin-top: 0;
  }

  .status p {
    margin: 0.5rem 0;
  }
</style>
