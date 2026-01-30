<script lang="ts">
  import { router, type Route } from '../lib/router';
  import { connectionState } from '../state/dspStore';
  import { uploadStatus } from '../state/eqStore';
  import { appVersion } from '../state/appVersionStore';

  const navItems: { route: Route; label: string; icon: string }[] = [
    { route: '/connect', label: 'Connection', icon: '🔌' },
    { route: '/presets', label: 'Presets', icon: '📁' },
    { route: '/eq', label: 'Parametric EQ', icon: '🎚️' },
    { route: '/pipeline', label: 'Pipeline Editor', icon: '🔗' },
  ];

  let currentRoute: Route;
  router.subscribe((r) => (currentRoute = r));

  function navigate(route: Route) {
    router.navigate(route);
  }

  // Derive status color from connection and upload states
  // Green = connected or upload success
  // Blue = connecting or upload pending
  // Red = error
  // Default = muted
  $: statusColor = (() => {
    // Upload state takes priority when active
    if ($uploadStatus.state === 'pending') {
      return 'blue';
    }
    if ($uploadStatus.state === 'success') {
      return 'green';
    }
    if ($uploadStatus.state === 'error') {
      return 'red';
    }

    // Otherwise use connection state
    if ($connectionState === 'connected') {
      return 'green';
    }
    if ($connectionState === 'connecting') {
      return 'blue';
    }
    if ($connectionState === 'error') {
      return 'red';
    }

    return 'default';
  })();
</script>

<nav class="nav-rail">
  {#each navItems as item}
    <button
      class="nav-button"
      class:active={currentRoute === item.route}
      class:status-green={item.route === '/connect' && statusColor === 'green'}
      class:status-blue={item.route === '/connect' && statusColor === 'blue'}
      class:status-red={item.route === '/connect' && statusColor === 'red'}
      on:click={() => navigate(item.route)}
      title={item.label}
      aria-label={item.label}
    >
      <span class="nav-icon">{item.icon}</span>
    </button>
  {/each}
  
  <div class="nav-spacer"></div>
  
  {#if $appVersion}
    <div class="nav-footer" title="CamillaEQ v{$appVersion.version} ({$appVersion.buildHash || 'dev'})">
      v{$appVersion.version}
    </div>
  {/if}
</nav>

<style>
  .nav-rail {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem 0.5rem;
    background: var(--ui-panel, #10141a);
    border-right: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
    min-width: 60px;
    height: 100vh;
  }

  .nav-spacer {
    flex: 1;
  }

  .nav-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 0;
    font-size: 0.6875rem;
    color: var(--ui-text-muted, rgba(255, 255, 255, 0.38));
    text-align: center;
    line-height: 1.2;
    user-select: none;
  }

  .nav-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    background: transparent;
    border: 1px solid var(--ui-border, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s ease;
    color: var(--ui-text-muted, rgba(255, 255, 255, 0.62));
  }

  .nav-button:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.15);
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
  }

  .nav-button.active {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.22);
    color: var(--ui-text, rgba(255, 255, 255, 0.88));
  }

  .nav-icon {
    font-size: 1.5rem;
    line-height: 1;
  }

  /* Status color states (for connection icon) */
  .nav-button.status-green {
    border-color: rgba(120, 255, 190, 0.5);
    box-shadow: 0 0 8px rgba(120, 255, 190, 0.2);
  }

  .nav-button.status-green:not(.active) {
    background: rgba(120, 255, 190, 0.05);
  }

  .nav-button.status-blue {
    border-color: rgba(120, 160, 255, 0.5);
    box-shadow: 0 0 8px rgba(120, 160, 255, 0.2);
  }

  .nav-button.status-blue:not(.active) {
    background: rgba(120, 160, 255, 0.05);
  }

  .nav-button.status-red {
    border-color: rgba(255, 120, 120, 0.5);
    box-shadow: 0 0 8px rgba(255, 120, 120, 0.2);
  }

  .nav-button.status-red:not(.active) {
    background: rgba(255, 120, 120, 0.05);
  }
</style>
