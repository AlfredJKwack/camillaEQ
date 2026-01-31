/**
 * Vitest setup file
 * Provides Node.js polyfills for browser APIs needed in tests
 */

import { WebSocket } from 'ws';

// Provide WebSocket global for Node test environment
// This allows tests to use real WebSocket connections without jsdom
(globalThis as any).WebSocket = WebSocket;
