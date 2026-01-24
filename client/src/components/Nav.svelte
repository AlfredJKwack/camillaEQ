<script lang="ts">
  import { router, type Route } from '../lib/router';

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
</script>

<nav class="nav-rail">
  {#each navItems as item}
    <button
      class="nav-button"
      class:active={currentRoute === item.route}
      on:click={() => navigate(item.route)}
      title={item.label}
      aria-label={item.label}
    >
      <span class="nav-icon">{item.icon}</span>
    </button>
  {/each}
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
</style>
