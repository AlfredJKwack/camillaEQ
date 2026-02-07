#!/usr/bin/env node
/**
 * Safe demo CamillaDSP mock for public deployment
 * 
 * Security features:
 * - Command allowlist (deny unknown commands)
 * - Per-session in-memory config (no shared global state)
 * - Bounded payload size (maxPayload on WS server)
 * - Config complexity validation (max filters/mixers/pipeline steps)
 * - Rate limiting (token bucket per connection)
 * - Idle timeout (auto-close stale connections)
 * - Max concurrent connections
 * - Origin allowlist (prevent drive-by abuse)
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { RateLimiter } from './rateLimit.js';
import {
  CONTROL_ALLOWLIST,
  SPECTRUM_ALLOWLIST,
  parseCommand,
  buildResponse,
  validateConfigComplexity,
  type ConfigLimits,
} from './protocol.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Configuration
// ============================================================================

const CONTROL_PORT = Number(process.env.DEMO_CONTROL_PORT) || 3146;
const SPECTRUM_PORT = Number(process.env.DEMO_SPECTRUM_PORT) || 6413;
const MAX_PAYLOAD = Number(process.env.DEMO_MAX_PAYLOAD) || 256 * 1024; // 256 KB
const IDLE_TIMEOUT_MS = Number(process.env.DEMO_IDLE_TIMEOUT_MS) || 10 * 60 * 1000; // 10 minutes
const MAX_CONNECTIONS_PER_SERVER = Number(process.env.DEMO_MAX_CONNECTIONS) || 200;

// Rate limiting (per connection)
const CONTROL_RATE_LIMIT = Number(process.env.DEMO_CONTROL_RATE_LIMIT) || 100; // msg/sec
const CONTROL_RATE_BURST = Number(process.env.DEMO_CONTROL_BURST) || 200;
const SPECTRUM_RATE_LIMIT = Number(process.env.DEMO_SPECTRUM_RATE_LIMIT) || 50; // msg/sec
const SPECTRUM_RATE_BURST = Number(process.env.DEMO_SPECTRUM_BURST) || 100;

// Origin allowlist (comma-separated, empty/unset = allow all)
const ALLOWED_ORIGINS = process.env.DEMO_ALLOWED_ORIGINS
  ?.split(',')
  .map((o) => o.trim())
  .filter(Boolean) || [];

// Config complexity limits
const CONFIG_LIMITS: ConfigLimits = {
  maxFilters: Number(process.env.DEMO_MAX_FILTERS) || 512,
  maxMixers: Number(process.env.DEMO_MAX_MIXERS) || 64,
  maxProcessors: Number(process.env.DEMO_MAX_PROCESSORS) || 64,
  maxPipelineSteps: Number(process.env.DEMO_MAX_PIPELINE_STEPS) || 128,
  maxNamesPerFilterStep: Number(process.env.DEMO_MAX_NAMES_PER_STEP) || 512,
  maxJsonSize: Number(process.env.DEMO_MAX_JSON_SIZE) || 200 * 1024, // 200 KB
};

// ============================================================================
// Load default config (Tangzu Waner preset)
// ============================================================================

const DEFAULT_CONFIG = JSON.parse(
  readFileSync(join(__dirname, '../default-config.json'), 'utf8')
);

console.log('Loaded default config:', {
  title: DEFAULT_CONFIG.title,
  filters: Object.keys(DEFAULT_CONFIG.filters || {}).length,
  pipeline: DEFAULT_CONFIG.pipeline?.length || 0,
});

// ============================================================================
// Session state
// ============================================================================

interface Session {
  config: any;
  rateLimiter: RateLimiter;
  lastActivity: number;
  idleTimer: NodeJS.Timeout;
}

const controlSessions = new WeakMap<WebSocket, Session>();
const spectrumSessions = new WeakMap<WebSocket, Session>();

/**
 * Create a new session for a WebSocket connection
 */
function createSession(ws: WebSocket, rateLimit: number, burst: number): Session {
  const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); // deep copy
  const rateLimiter = new RateLimiter(burst, rateLimit);
  const lastActivity = Date.now();

  const idleTimer = setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log('Closing idle connection');
      ws.close(1000, 'Idle timeout');
    }
  }, IDLE_TIMEOUT_MS);

  return { config, rateLimiter, lastActivity, idleTimer };
}

/**
 * Update session activity timestamp and reset idle timer
 */
function touchSession(session: Session, ws: WebSocket, socket: 'control' | 'spectrum'): void {
  session.lastActivity = Date.now();

  // Reset idle timer
  clearTimeout(session.idleTimer);
  session.idleTimer = setTimeout(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log(`Closing idle ${socket} connection`);
      ws.close(1000, 'Idle timeout');
    }
  }, IDLE_TIMEOUT_MS);
}

/**
 * Cleanup session on disconnect
 */
function cleanupSession(session: Session): void {
  clearTimeout(session.idleTimer);
}

// ============================================================================
// Control socket handlers
// ============================================================================

function handleControlMessage(ws: WebSocket, message: Buffer): void {
  const session = controlSessions.get(ws);
  if (!session) {
    console.error('No session found for control socket');
    return;
  }

  // Rate limit
  if (!session.rateLimiter.tryConsume()) {
    console.warn('Rate limit exceeded on control socket, closing');
    ws.close(1008, 'Rate limit exceeded');
    return;
  }

  touchSession(session, ws, 'control');

  const messageStr = message.toString('utf8');
  const command = parseCommand(messageStr);

  if (!command) {
    ws.send(buildResponse('Unknown', 'Error', 'Invalid command format'));
    return;
  }

  // Command allowlist
  if (!CONTROL_ALLOWLIST.has(command)) {
    ws.send(buildResponse(command, 'Error', 'Unknown command'));
    return;
  }

  // Handle commands
  try {
    switch (command) {
      case 'GetVersion':
        ws.send(buildResponse('GetVersion', 'Ok', '3.0.0-demo'));
        break;

      case 'GetConfigJson':
        ws.send(buildResponse('GetConfigJson', 'Ok', JSON.stringify(session.config)));
        break;

      case 'SetConfigJson': {
        const request = JSON.parse(messageStr);
        const configJsonStr = request.SetConfigJson;

        // Validate JSON size before parsing
        if (configJsonStr.length > CONFIG_LIMITS.maxJsonSize) {
          ws.send(
            buildResponse(
              'SetConfigJson',
              'Error',
              `Config size ${configJsonStr.length} exceeds limit ${CONFIG_LIMITS.maxJsonSize}`
            )
          );
          break;
        }

        const newConfig = JSON.parse(configJsonStr);

        // Validate complexity
        const validation = validateConfigComplexity(newConfig, CONFIG_LIMITS);
        if (!validation.valid) {
          ws.send(buildResponse('SetConfigJson', 'Error', validation.error!));
          break;
        }

        // Accept and store in session (not persisted)
        session.config = newConfig;
        ws.send(buildResponse('SetConfigJson', 'Ok', true));
        break;
      }

      case 'GetConfig':
        ws.send(buildResponse('GetConfig', 'Ok', 'Demo YAML config (not implemented)'));
        break;

      case 'GetConfigTitle':
        ws.send(buildResponse('GetConfigTitle', 'Ok', session.config.title || 'Demo Config'));
        break;

      case 'GetConfigDescription':
        ws.send(
          buildResponse('GetConfigDescription', 'Ok', session.config.description || 'CamillaEQ demo instance')
        );
        break;

      case 'GetAvailableCaptureDevices': {
        const mockDevices: [string, string | null][] = [
          ['hw:0,0', 'Demo Audio Input'],
          ['default', null],
        ];
        ws.send(buildResponse('GetAvailableCaptureDevices', 'Ok', mockDevices));
        break;
      }

      case 'GetAvailablePlaybackDevices': {
        const mockDevices: [string, string | null][] = [
          ['hw:0,0', 'Demo Audio Output'],
          ['default', null],
        ];
        ws.send(buildResponse('GetAvailablePlaybackDevices', 'Ok', mockDevices));
        break;
      }

      case 'GetState':
        ws.send(buildResponse('GetState', 'Ok', 'Running'));
        break;

      case 'GetVolume':
        ws.send(buildResponse('GetVolume', 'Ok', 0));
        break;

      case 'SetVolume':
        // Accept but ignore (demo mode)
        ws.send(buildResponse('SetVolume', 'Ok', true));
        break;

      default:
        ws.send(buildResponse(command, 'Error', 'Command not implemented in demo'));
    }
  } catch (error) {
    console.error('Error handling control message:', error);
    ws.send(
      buildResponse(command, 'Error', error instanceof Error ? error.message : 'Internal error')
    );
  }
}

// ============================================================================
// Spectrum socket handlers
// ============================================================================

/**
 * Generate mock spectrum data (256 bins, dBFS format)
 * Matches the implementation in server/src/services/mockCamillaDSP.ts
 */
function generateMockSpectrumData(): number[] {
  const numBins = 256;
  const bins: number[] = [];
  const time = Date.now() / 1000; // Use time for gentle animation

  const minDb = -100;
  const maxDb = -12;

  for (let i = 0; i < numBins; i++) {
    const freq = i / numBins; // Normalized frequency [0..1]

    // Create a multi-band spectrum curve (normalized 0..1)
    const lowBand = Math.exp(-freq * 3) * 0.6;
    const midBump = Math.exp(-Math.pow((freq - 0.4) * 4, 2)) * 0.4;
    const highBand = Math.exp(-Math.pow((freq - 0.7) * 2, 2)) * 0.3;

    let magnitude = lowBand + midBump + highBand;

    // Add gentle time-based variation
    const breathe = 0.8 + 0.2 * Math.sin(time * 0.5 + freq * Math.PI);
    magnitude *= breathe;

    // Add subtle noise
    const noise = (Math.random() - 0.5) * 0.05;
    magnitude += noise;

    // Clamp to [0..1] range
    magnitude = Math.max(0, Math.min(1, magnitude));

    // Convert to dBFS
    const db = minDb + magnitude * (maxDb - minDb);
    bins.push(db);
  }

  return bins;
}

function handleSpectrumMessage(ws: WebSocket, message: Buffer): void {
  const session = spectrumSessions.get(ws);
  if (!session) {
    console.error('No session found for spectrum socket');
    return;
  }

  // Rate limit
  if (!session.rateLimiter.tryConsume()) {
    console.warn('Rate limit exceeded on spectrum socket, closing');
    ws.close(1008, 'Rate limit exceeded');
    return;
  }

  touchSession(session, ws, 'spectrum');

  const messageStr = message.toString('utf8');
  const command = parseCommand(messageStr);

  if (!command) {
    ws.send(buildResponse('Unknown', 'Error', 'Invalid command format'));
    return;
  }

  // Command allowlist
  if (!SPECTRUM_ALLOWLIST.has(command)) {
    ws.send(buildResponse(command, 'Error', 'Unknown command'));
    return;
  }

  // Handle commands
  try {
    switch (command) {
      case 'GetPlaybackSignalPeak':
        ws.send(buildResponse('GetPlaybackSignalPeak', 'Ok', generateMockSpectrumData()));
        break;

      case 'GetConfig':
        ws.send(buildResponse('GetConfig', 'Ok', 'Demo spectrum YAML (not implemented)'));
        break;

      case 'GetConfigTitle':
        ws.send(buildResponse('GetConfigTitle', 'Ok', 'Demo Spectrum Analyzer'));
        break;

      case 'GetConfigDescription':
        ws.send(buildResponse('GetConfigDescription', 'Ok', '256-bin mock spectrum for demo'));
        break;

      default:
        ws.send(buildResponse(command, 'Error', 'Command not implemented in demo'));
    }
  } catch (error) {
    console.error('Error handling spectrum message:', error);
    ws.send(
      buildResponse(command, 'Error', error instanceof Error ? error.message : 'Internal error')
    );
  }
}

// ============================================================================
// Origin validation
// ============================================================================

function checkOrigin(origin: string | undefined): boolean {
  // If no allowlist configured, allow all
  if (ALLOWED_ORIGINS.length === 0) {
    return true;
  }

  if (!origin) {
    return false;
  }

  return ALLOWED_ORIGINS.includes(origin);
}

// ============================================================================
// Start servers
// ============================================================================

async function main() {
  // Control server
  const controlServer = new WebSocketServer({
    port: CONTROL_PORT,
    maxPayload: MAX_PAYLOAD,
    verifyClient: (info, callback) => {
      // Check origin
      if (!checkOrigin(info.origin)) {
        console.warn(`Rejected control connection from origin: ${info.origin}`);
        callback(false, 403, 'Origin not allowed');
        return;
      }

      // Check max connections
      if (controlServer.clients.size >= MAX_CONNECTIONS_PER_SERVER) {
        console.warn('Control server at max connections');
        callback(false, 503, 'Server at capacity');
        return;
      }

      callback(true);
    },
  });

  controlServer.on('connection', (ws) => {
    console.log('Control connection opened');

    // Create session
    const session = createSession(ws, CONTROL_RATE_LIMIT, CONTROL_RATE_BURST);
    controlSessions.set(ws, session);

    ws.on('message', (data) => {
      if (data instanceof Buffer) {
        handleControlMessage(ws, data);
      }
    });

    ws.on('close', () => {
      console.log('Control connection closed');
      cleanupSession(session);
    });

    ws.on('error', (error) => {
      console.error('Control socket error:', error);
      cleanupSession(session);
    });
  });

  controlServer.on('error', (error) => {
    console.error('Control server error:', error);
    process.exit(1);
  });

  // Spectrum server
  const spectrumServer = new WebSocketServer({
    port: SPECTRUM_PORT,
    maxPayload: MAX_PAYLOAD,
    verifyClient: (info, callback) => {
      // Check origin
      if (!checkOrigin(info.origin)) {
        console.warn(`Rejected spectrum connection from origin: ${info.origin}`);
        callback(false, 403, 'Origin not allowed');
        return;
      }

      // Check max connections
      if (spectrumServer.clients.size >= MAX_CONNECTIONS_PER_SERVER) {
        console.warn('Spectrum server at max connections');
        callback(false, 503, 'Server at capacity');
        return;
      }

      callback(true);
    },
  });

  spectrumServer.on('connection', (ws) => {
    console.log('Spectrum connection opened');

    // Create session
    const session = createSession(ws, SPECTRUM_RATE_LIMIT, SPECTRUM_RATE_BURST);
    spectrumSessions.set(ws, session);

    ws.on('message', (data) => {
      if (data instanceof Buffer) {
        handleSpectrumMessage(ws, data);
      }
    });

    ws.on('close', () => {
      console.log('Spectrum connection closed');
      cleanupSession(session);
    });

    ws.on('error', (error) => {
      console.error('Spectrum socket error:', error);
      cleanupSession(session);
    });
  });

  spectrumServer.on('error', (error) => {
    console.error('Spectrum server error:', error);
    process.exit(1);
  });

  console.log('==================================================');
  console.log('CamillaEQ Demo CamillaDSP Mock');
  console.log('==================================================');
  console.log(`Control socket:  ws://0.0.0.0:${CONTROL_PORT}`);
  console.log(`Spectrum socket: ws://0.0.0.0:${SPECTRUM_PORT}`);
  console.log('');
  console.log('Security features:');
  console.log(`- Max payload: ${MAX_PAYLOAD} bytes`);
  console.log(`- Idle timeout: ${IDLE_TIMEOUT_MS / 1000}s`);
  console.log(`- Max connections per server: ${MAX_CONNECTIONS_PER_SERVER}`);
  console.log(`- Control rate limit: ${CONTROL_RATE_LIMIT} msg/s (burst ${CONTROL_RATE_BURST})`);
  console.log(`- Spectrum rate limit: ${SPECTRUM_RATE_LIMIT} msg/s (burst ${SPECTRUM_RATE_BURST})`);
  console.log(`- Origin allowlist: ${ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS.join(', ') : 'disabled (allow all)'}`);
  console.log('');
  console.log('Complexity limits:');
  console.log(`- Max filters: ${CONFIG_LIMITS.maxFilters}`);
  console.log(`- Max mixers: ${CONFIG_LIMITS.maxMixers}`);
  console.log(`- Max processors: ${CONFIG_LIMITS.maxProcessors}`);
  console.log(`- Max pipeline steps: ${CONFIG_LIMITS.maxPipelineSteps}`);
  console.log(`- Max names per filter step: ${CONFIG_LIMITS.maxNamesPerFilterStep}`);
  console.log(`- Max JSON size: ${CONFIG_LIMITS.maxJsonSize} bytes`);
  console.log('==================================================');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
