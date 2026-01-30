<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from './lib/router';
  import { autoConnectFromLocalStorage } from './state/dspStore';
  import { loadAppVersion } from './state/appVersionStore';
  import Nav from './components/Nav.svelte';
  import ConnectPage from './pages/ConnectPage.svelte';
  import EqPage from './pages/EqPage.svelte';
  import PresetsPage from './pages/PresetsPage.svelte';
  import PipelinePage from './pages/PipelinePage.svelte';
  import './styles/theme.css';

  let currentRoute: string;
  router.subscribe((route) => (currentRoute = route));

  // Auto-connect on startup if enabled
  onMount(() => {
    autoConnectFromLocalStorage();
    loadAppVersion();
  });
</script>

<div class="app-shell">
  <Nav />
  <main class="main-content">
    {#if currentRoute === '/connect'}
      <ConnectPage />
    {:else if currentRoute === '/eq'}
      <EqPage />
    {:else if currentRoute === '/presets'}
      <PresetsPage />
    {:else if currentRoute === '/pipeline'}
      <PipelinePage />
    {/if}
  </main>
</div>

<style>
  .app-shell {
    display: flex;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }

  .main-content {
    flex: 1;
    overflow-y: auto;
    background: var(--ui-bg);
  }
</style>
