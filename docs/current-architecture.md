# Current Architecture (as-built)

**Last updated:** 2026-01-26  
**Status:** MVP-12 Complete

This document describes the actual implementation as it exists in the codebase.

---

## Runtime Topology

### Process A: CamillaDSP WebSocket Service
- External service (not part of this project)
- Provides two WebSocket endpoints:
  - **Control socket:** DSP config/state/volume commands
  - **Spectrum socket:** Spectrum data query endpoint
- Browser connects directly (not proxied through Process B)

### Process B: Web UI Server (This Project)
**Location:** `server/`

**Technology:**
- Node.js 18+ with Fastify
- Pino structured logging
- TypeScript

**Implemented REST API:**
- `GET /health` - Server health check
- `GET /api/version` - Build info (version, hash, timestamp)
- `GET /api/config` - Read DSP config file from disk
- `PUT /api/config` - Write DSP config file to disk
- `GET /api/state/latest` - Read last applied DSP state
- `PUT /api/state/latest` - Write last applied DSP state (write-through persistence)
- `GET /api/configs` - List saved configuration presets
- `GET /api/configs/:id` - Load specific preset
- `PUT /api/configs/:id` - Save preset

**Services:**
- `ConfigStore` - Atomic file writes for config persistence
- `ConfigsLibrary` - Manage preset library in `server/data/configs/`
- `shellExec` - Hardened shell command execution (not yet used by routes)
- `mockCamillaDSP` - Test WebSocket server for development

**Static Asset Serving:**
- **Development:** Vite dev server (port 5173) proxies `/api` and `/health` to Fastify (port 3000)
- **Production plan:** Serve `client/dist` from Fastify using `@fastify/static` (not yet implemented)

### Browser Client
**Location:** `client/`

**Technology:**
- Svelte 4 + Vite + TypeScript
- Hash-based routing (`client/src/lib/router.ts`)

**Pages:**
- `/connect` - Connection parameters
- `/eq` - Interactive EQ editor (main page)
- `/presets` - Configuration library
- `/pipeline` - Pipeline editor (placeholder, not implemented)

**Direct WebSocket Connections:**
- Opens two separate connections to CamillaDSP:
  1. Control socket (config upload, state queries)
  2. Spectrum socket (spectrum data polling at 10Hz)

---

## Data Flow Patterns (Actual Implementation)

### On Connect
1. User navigates to Connect page, enters server/ports
2. Browser calls `connect(server, controlPort, spectrumPort)` in `dspStore.ts`
3. Two WebSocket connections established to CamillaDSP
4. Control socket sends `GetConfigJson`
5. If config empty (0 filters):
   - Fetch `GET /api/state/latest` from backend
   - Upload to CamillaDSP via `SetConfigJson` + `Reload`
6. If config not empty: use downloaded config
7. `eqStore` extracts EQ bands via `camillaEqMapping.ts`
8. UI renders curves, tokens, faders

### During EQ Editing
1. User drags token / adjusts fader / changes parameter
2. `eqStore` updates local state (optimistic)
3. **Debounced upload** (200ms) triggers:
   - `camillaEqMapping.ts` converts bands → CamillaDSP config
   - Upload via `SetConfigJson` + `Reload`
   - **Write-through:** `PUT /api/state/latest` (non-fatal if fails)
4. SVG curves regenerate immediately (reactive)
5. No UI revert on upload failure (optimistic persistence)

### During Spectrum Rendering
1. `EqPage.svelte` starts polling interval (100ms = 10Hz)
2. Each tick calls `dsp.getSpectrumData()` → sends `GetPlaybackSignalPeak` on spectrum socket
3. Response arrives with 256-bin array
4. `SpectrumCanvasRenderer` renders via `SpectrumAreaLayer`
5. Filled area curve + outline stroke
6. Optional smoothing: Catmull-Rom spline + moving average filter

### Preset Load/Save
**Load:**
1. User clicks preset in list
2. Fetch `GET /api/configs/:id` (returns pipeline-config format)
3. `pipelineConfigMapping.ts` converts → full CamillaDSP config
4. Upload to CamillaDSP via `SetConfigJson` + `Reload`
5. Update `dspStore` + `eqStore` with new config

**Save:**
1. User clicks "Save Current"
2. Download current config from CamillaDSP via `GetConfigJson`
3. `pipelineConfigMapping.ts` converts → pipeline-config format
4. Send `PUT /api/configs/:id` with JSON body
5. Refresh preset list

---

## State Management

### Global DSP State (`dspStore.ts`)
- Singleton `CamillaDSP` instance shared across pages
- Connection state machine (disconnected/connecting/connected/error)
- Auto-reconnect with exponential backoff (max 10 attempts)
- Stores: `connectionState`, `dspConfig`, `dspVolume`

### EQ Band State (`eqStore.ts`)
- Derived from `dspStore.dspConfig` on connect
- Stores: `bands[]`, `selectedBandIndex`, `preampGain`
- Derived: `sumCurvePath`, `perBandCurvePaths`
- Actions: `setBandFreq()`, `setBandGain()`, `setBandQ()`, `toggleBandEnabled()`
- Upload: debounced 200ms, calls `applyEqBandsToConfig()` → `uploadConfig()`

### Persistence Strategy
- **Source of truth:** CamillaDSP when running, backend when not
- **Write-through cache:** Every upload → `PUT /api/state/latest`
- **Recovery:** Empty CamillaDSP config → restore from `/api/state/latest`
- **Preset library:** `server/data/configs/` (git-tracked)

---

## Module Structure

### Backend (`server/src/`)
```
index.ts              - Fastify bootstrap + routes
logger.ts             - Pino config (unused, integrated into index.ts)
types/errors.ts       - AppError + ErrorCode enums
services/
  configStore.ts      - Atomic config file writes
  configsLibrary.ts   - Preset management
  shellExec.ts        - Hardened spawn wrapper
  mockCamillaDSP.ts   - Development WebSocket server
```

### Frontend (`client/src/`)
```
pages/
  ConnectPage.svelte  - Connection parameters
  EqPage.svelte       - Interactive EQ editor
  PresetsPage.svelte  - Config library UI
  PipelinePage.svelte - Placeholder
lib/
  camillaDSP.ts       - WebSocket client + protocol
  camillaEqMapping.ts - EqBand ↔ CamillaDSP config conversion
  pipelineConfigMapping.ts - Pipeline-config ↔ CamillaDSP config
  router.ts           - Hash-based routing
  debounce.ts         - Cancelable debounce utility
state/
  dspStore.ts         - Global DSP connection + config
  eqStore.ts          - EQ band parameters + curves
dsp/
  filterResponse.ts   - RBJ biquad math (7 filter types)
  spectrumParser.ts   - Spectrum frame parsing
ui/rendering/
  EqSvgRenderer.ts    - Curve path generation
  SpectrumCanvasRenderer.ts - Canvas rendering orchestrator
  canvasLayers/
    CanvasVisualizationLayer.ts - Layer interface
    SpectrumAreaLayer.ts - Filled curve layer
ui/tokens/
  EqTokensLayer.svelte - Token rendering + interaction
  tokenUtils.ts       - Coordinate mapping + formatting
components/
  Nav.svelte          - Navigation rail
  FaderTooltip.svelte - Fader value tooltip
  KnobDial.svelte     - Rotary control
  icons/FilterIcons.svelte - Filter type glyphs
```

---

## Rendering Architecture

### Canvas Layer (High-frequency path)
- **Target:** 10Hz spectrum updates
- **Implementation:** `SpectrumCanvasRenderer` + pluggable layers
- **Current layer:** `SpectrumAreaLayer` (filled curve + outline)
- **Smoothing:** Optional Catmull-Rom spline + moving average
- **No DOM mutations:** Canvas context reused

### SVG Layer (Interactive path)
- **EQ curves:** `EqSvgRenderer.generateCurvePath()` with 256 sample points
- **Sum curve:** White, 2.25px stroke
- **Per-band curves:** Band-tinted, 1.25px stroke, optional
- **Tokens:** `EqTokensLayer.svelte` with compensated ellipses (remain circular)
- **Incremental updates:** Reactive Svelte bindings, no tree rebuilds

### Coordinate Systems
- **Frequency:** Log10 scale (20 Hz - 20 kHz)
- **Gain:** Linear scale (±24 dB)
- **Mapping functions:** `freqToX()`, `xToFreq()`, `gainToY()`, `yToGain()`

---

## Testing Strategy

### Backend Tests
- **Tool:** Jest with `@types/jest`
- **Approach:** Route testing via `fastify.inject()` (no real network)
- **Coverage:** All routes, ConfigStore, ConfigsLibrary, shellExec
- **Location:** `server/src/**/__tests__/`

### Frontend Tests
- **Tool:** Vitest
- **Coverage:**
  - Unit: `EqSvgRenderer`, `spectrumParser`, `tokenUtils`, `camillaEqMapping`
  - Component: `eqStore`, `EqPage`
  - Integration: `camillaDSP` (with mock WebSocket)
- **Location:** `client/src/**/*.test.ts` and `client/src/**/__tests__/`

### Test Status (as of 2026-01-26)
- **Client tests:** 112 passing (6 test suites)
- **Server tests:** 54 passing (6 test suites)
- **Total:** 166 passing tests

---

## Deployment (Current State)

### Development
```bash
npm install
npm run dev  # Starts both server (port 3000) + client (port 5173)
```

### Production (Planned)
- Build: `npm run build` → `client/dist/` + `server/dist/`
- Serve: Fastify serves static assets from `client/dist/` (not yet implemented)
- Process management: systemd services (not yet configured)

---

## Known Gaps vs. Design Spec

### Not Implemented
- Static asset serving from Fastify in production
- ALSA device enumeration endpoints (`/api/alsa/devices`)
- systemctl status endpoints (`/api/system/services`)
- Pipeline editor UI (page exists as placeholder)
- Filter type selection UI (currently static peaking filters only)
- Right-click context menu on tokens
- Volume control UI (CamillaDSP `SetVolume` implemented, no UI)

### Deviations from Spec
- **Spectrum:** Implemented as polling (10Hz via interval) not push streaming
- **Upload strategy:** Optimistic UI + debounced upload (no revert on failure)
- **Config normalization:** Minimal (only ensures required fields exist)
