import { FastifyInstance } from 'fastify';

/**
 * Settings response structure
 */
export interface SettingsResponse {
  camillaControlWsUrl: string | null;
  camillaSpectrumWsUrl: string | null;
}

/**
 * Parse WebSocket URL from env and return host + port
 * Returns null if invalid or missing
 */
function parseWsUrl(envValue: string | undefined): string | null {
  if (!envValue) return null;
  
  try {
    // Simple validation: should start with ws:// or wss://
    if (!envValue.startsWith('ws://') && !envValue.startsWith('wss://')) {
      return null;
    }
    
    return envValue;
  } catch {
    return null;
  }
}

export function registerSettingsRoutes(app: FastifyInstance): void {
  app.get('/api/settings', async (): Promise<SettingsResponse> => {
    return {
      camillaControlWsUrl: parseWsUrl(process.env.CAMILLA_CONTROL_WS_URL),
      camillaSpectrumWsUrl: parseWsUrl(process.env.CAMILLA_SPECTRUM_WS_URL),
    };
  });
}
