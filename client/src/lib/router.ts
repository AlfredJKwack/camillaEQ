/**
 * Lightweight hash-based router
 * Minimal overhead for LAN device deployment
 */

import { writable, derived } from 'svelte/store';

export type Route = '/connect' | '/eq' | '/presets' | '/pipeline';

function createRouter() {
  const { subscribe, set } = writable<Route>(getCurrentRoute());

  // Listen for hash changes
  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', () => {
      set(getCurrentRoute());
    });
  }

  return {
    subscribe,
    navigate: (route: Route) => {
      window.location.hash = route;
    },
  };
}

function getCurrentRoute(): Route {
  const hash = window.location.hash.slice(1);
  
  // Default routing logic:
  // - If no hash, check localStorage for CamillaDSP server
  // - If localStorage empty → /connect
  // - If localStorage has server → /eq
  if (!hash || hash === '' || hash === '/') {
    const server = localStorage.getItem('camillaDSP.server');
    return server ? '/eq' : '/connect';
  }

  // Validate route
  const validRoutes: Route[] = ['/connect', '/eq', '/presets', '/pipeline'];
  if (validRoutes.includes(hash as Route)) {
    return hash as Route;
  }

  // Fallback to default
  const server = localStorage.getItem('camillaDSP.server');
  return server ? '/eq' : '/connect';
}

export const router = createRouter();

// Derived store for active page check
export const isActive = (route: Route) => 
  derived(router, $router => $router === route);
