import { join } from 'path';

/**
 * Centralized configuration directory resolution
 * Ensures consistent paths across all services
 */
export function getConfigDir(): string {
  return process.env.CONFIG_DIR || './data';
}

export function getConfigsDir(): string {
  return process.env.CONFIGS_DIR || join(getConfigDir(), 'configs');
}
