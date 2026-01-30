/**
 * Lightweight client logger with debug gating
 * 
 * Usage:
 *   import { log } from './lib/log';
 *   log.debug('Only visible in dev mode');
 *   log.info('Important info message');
 *   log.warn('Warning message');
 *   log.error('Error message', errorObject);
 * 
 * Debug messages can also be enabled in production via localStorage:
 *   localStorage.setItem('debug', 'true');
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  enabled: boolean;
  debugEnabled: boolean;
}

/**
 * Check if debug logging is enabled
 * - Always enabled in development (import.meta.env.DEV)
 * - Can be enabled in production via localStorage.getItem('debug') === 'true'
 */
function isDebugEnabled(): boolean {
  if (import.meta.env.DEV) {
    return true;
  }
  
  try {
    return localStorage.getItem('debug') === 'true';
  } catch {
    return false;
  }
}

/**
 * Format log message with timestamp and level prefix
 */
function formatMessage(level: LogLevel, ...args: any[]): any[] {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 12); // HH:MM:SS.mmm
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  return [prefix, ...args];
}

/**
 * Log a debug message (only visible when debug is enabled)
 */
function debug(...args: any[]): void {
  if (!isDebugEnabled()) {
    return;
  }
  console.log(...formatMessage('debug', ...args));
}

/**
 * Log an info message
 */
function info(...args: any[]): void {
  console.info(...formatMessage('info', ...args));
}

/**
 * Log a warning message
 */
function warn(...args: any[]): void {
  console.warn(...formatMessage('warn', ...args));
}

/**
 * Log an error message
 */
function error(...args: any[]): void {
  console.error(...formatMessage('error', ...args));
}

export const log = {
  debug,
  info,
  warn,
  error,
};
