/**
 * Vitest setup file
 * Provides Node.js polyfills for browser APIs needed in tests
 */

import { WebSocket } from 'ws';

// Provide WebSocket global for Node test environment
// This allows tests to use real WebSocket connections without jsdom
(globalThis as any).WebSocket = WebSocket;

// Provide localStorage mock for tests
class LocalStorageMock {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

(globalThis as any).localStorage = new LocalStorageMock();
