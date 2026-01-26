# System Architecture

## Runtime Topology (On-Device)

The system consists of three cooperating processes:

**Process A: CamillaDSP WebSocket Service**
- Provides real-time spectrum frames at ~10Hz
- Exposes control WebSocket for DSP config/state/volume commands
- May be running on the same device or a different device on LAN
- Browser connects to this DIRECTLY (not through web server)

**Process B: Web UI Server (This Project)**
- **Development:** Vite dev server proxies `/api` and `/health` to Fastify (port 3000)
- **Production (planned):** Serve static frontend assets from `client/dist` via Fastify
- Provides minimal REST API:
  - `/health` - liveness check
  - `/api/version` - build info
  - `/api/config` - GET/PUT DSP config file
  - `/api/state/latest` - GET/PUT last applied DSP state (write-through cache)
  - `/api/configs` - GET list of saved presets
  - `/api/configs/:id` - GET/PUT specific preset
  - `/api/alsa/devices` - **planned** (not yet implemented)
  - `/api/system/services` - **planned** (not yet implemented)
- Does NOT proxy WebSocket traffic
- Stateless, low overhead

**Browser Client**
- Fetches UI assets from Process B
- Establishes TWO direct connections to Process A:
  1. Control WebSocket (config/state/volume)
  2. Spectrum WebSocket (metrics frames)
- Manages DSP config domain state in-browser
- Renders spectrum via Canvas, EQ curves via SVG

---

## Data Flow Patterns

### On Connect
1. Browser loads UI from Process B (Vite in dev, Fastify in production)
2. User enters CamillaDSP service address in Connect page (stored in localStorage)
3. Browser calls `connect(server, controlPort, spectrumPort)` in `dspStore.ts`
4. Two WebSocket connections established to Process A:
   - Control socket (port 1234 default)
   - Spectrum socket (port 1235 default)
5. Browser downloads current config via `GetConfigJson` on control socket
6. **If config empty (0 filters/pipeline):**
   - Fetch `GET /api/state/latest` from backend
   - Upload to CamillaDSP via `SetConfigJson` + `Reload`
7. **If config not empty:** use downloaded config
8. `eqStore` extracts EQ bands via `camillaEqMapping.ts`
9. UI renders initial state (curves, tokens, controls)

### During Streaming (High-Frequency Path)
- **Polling implementation:** `EqPage.svelte` starts 100ms interval (10Hz)
- Each tick sends `GetPlaybackSignalPeak` on spectrum socket
- Response arrives with 256-bin array (parsed by `spectrumParser.ts`)
- `SpectrumCanvasRenderer` renders via `SpectrumAreaLayer`:
  - Filled area curve with outline stroke
  - Optional smoothing: Catmull-Rom spline + moving average filter
  - No DOM mutations, canvas context reused
- SVG layer unaffected (curves rendered separately)
- **Stale detection:** If no frames received for >500ms, fade out canvas

### During User Interaction (Interactive Path)
- User drags token / adjusts fader / changes Q knob
- `eqStore` updates local state (optimistic)
- **Debounced upload** (200ms) triggers:
  - `camillaEqMapping.ts` converts `bands[]` → full CamillaDSP config
  - Upload via `SetConfigJson` + `Reload` on control socket
  - **Write-through:** `PUT /api/state/latest` (non-fatal if fails)
- SVG curves update immediately via reactive Svelte bindings:
  - `EqSvgRenderer.generateCurvePath()` recalculates paths
  - DOM elements update via Svelte reactivity (no tree rebuild)
- **No UI revert on failure:** Optimistic persistence, user sees error state
- CamillaDSP service applies changes, audio processing updates

### Preset Load/Save (Config Path)
**Load Preset:**
1. User navigates to Presets page, selects config from list
2. Browser calls `GET /api/configs/:id` → returns pipeline-config format
3. `pipelineConfigMapping.ts` converts → full CamillaDSP config
4. Upload to CamillaDSP via `SetConfigJson` + `Reload`
5. Update `dspStore.dspConfig` + `eqStore` with new config
6. UI re-renders curves, tokens, controls

**Save Preset:**
1. User clicks "Save Current" button
2. Download current config from CamillaDSP via `GetConfigJson`
3. `pipelineConfigMapping.ts` converts → pipeline-config format
4. Browser calls `PUT /api/configs/:id` with JSON body
5. Backend saves to `server/data/configs/{id}.json` (atomic write)
6. Refresh preset list

**Infrequent Queries (Planned):**
- User navigates to setup page or presses refresh
- Browser calls Process B REST endpoints (`/api/alsa/devices`, `/api/system/services`)
- Backend executes shell commands with timeout/whitelist via `shellExec`
- Backend returns structured JSON
- UI displays results
- **Status:** Shell-out infrastructure exists, routes not yet implemented

---

## Separation of Concerns

**Real-time stream (fast path):**
- Browser ↔ CamillaDSP WebSocket service (direct)
- No backend involvement
- Optimized for low latency, high frequency

**Device control/inspection:**
- Browser ↔ Web UI Server REST endpoints
- Lightweight, infrequent
- Backend handles file I/O and OS queries

**Audio processing:**
- CamillaDSP service (external to this project)
- Receives config updates via WebSocket
- Returns state/metrics

---

## State Management

**Source of Truth:**
- CamillaDSP service owns active DSP state (intended authoritative source when it has state)
- Browser maintains working copy of config
- Backend stores persistent config files AND latest applied state
- Backend provides durable fallback when CamillaDSP returns empty config

**Latest State Persistence:**
- Every successful upload to CamillaDSP → write-through to `server/data/latest_dsp_state.json`
- On startup/reconnect: if CamillaDSP returns empty config → restore from `/api/state/latest`
- Non-fatal write-through: continues if server unavailable
- Page reload shows most recent edited state (not last loaded preset)

**State Transitions:**
- Browser requests → CamillaDSP applies → Browser reflects
- No optimistic updates; UI waits for confirmation
- Explicit error handling for rejected changes

**Domain Models (Actual Implementation):**
- `camillaDSP.ts` module: WebSocket protocol, config schema, connection management
- `dspStore.ts` module: Global connection state, auto-reconnect, singleton DSP instance
- `eqStore.ts` module: EQ band state, derived curve paths, debounced upload
- `camillaEqMapping.ts` module: Bidirectional EqBand ↔ CamillaDSP config conversion
- `pipelineConfigMapping.ts` module: Pipeline-config ↔ CamillaDSP config conversion
- `filterResponse.ts` module: RBJ biquad math for 7 filter types

---

## Component Relationships

```
┌─────────────────────────────────────────────────────────┐
│ Browser Client                                          │
│  ┌────────────────┐  ┌──────────────────────────────┐  │
│  │ UI Components  │  │ Rendering Layers             │  │
│  │ (Svelte)       │  │  - Canvas (spectrum)         │  │
│  │                │  │  - SVG (curves/tokens)       │  │
│  └────────────────┘  └──────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Domain Layer                                    │   │
│  │  - camillaDSP (WS client, config manager)      │   │
│  │  - filters (filter models, schema)              │   │
│  │  - stateStore (reactive state)                  │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
         │                                    │
         │ REST (config/OS)                   │ WebSocket (control + spectrum)
         ▼                                    ▼
┌──────────────────────┐         ┌──────────────────────────┐
│ Process B            │         │ Process A                │
│ Web UI Server        │         │ CamillaDSP WS Service    │
│ (Node.js + Fastify)  │         │ (External)               │
│                      │         │                          │
│ - Serve static files │         │ - Control WebSocket      │
│ - Config GET/PUT     │         │ - Spectrum WebSocket     │
│ - ALSA queries       │         │ - DSP processing         │
│ - System queries     │         │                          │
└──────────────────────┘         └──────────────────────────┘
```

---

## Failure and Recovery Patterns

**WebSocket Disconnection:**
- Automatic reconnect with exponential backoff + jitter
- UI displays "stream disconnected" state clearly
- Spectrum freezes gracefully (fade out or hold last frame with indicator)
- Config operations queued or rejected during disconnect

**Config Load Failure:**
- Return default config + error warning (if policy allows)
- OR fail hard and require user intervention
- Policy defined in config specification

**Shell-out Failure:**
- Return partial results + diagnostic error code
- Log failure with correlation ID
- Never crash server process

**CamillaDSP Service Unavailable:**
- UI shows connection error
- User can retry or reconfigure service address
- No data loss (browser state preserved)

**Backend Crash:**
- Static assets already loaded (browser continues running)
- Config save operations fail gracefully
- User can reload page to restart

---

## Security Boundaries

Even though LAN-only, maintain security baseline:
- Bind servers to LAN interface only
- Validate payload sizes and input formats
- Shell-outs use `spawn` with whitelisted arguments
- Same-origin enforcement for REST API (if applicable)
- Optional "operator lock" (simple token/basic auth) for untrusted networks (future)

---

## UI Layout Patterns

**EQ Graph 4-Zone Grid (`.eq-graph`):**
- **Grid rows:** `34px 34px 1fr 34px` (octaves, regions, plot, freq scale)
- **Shared right-side column pattern:** All 4 zones use 2-column grid (`1fr 44px`)
  - Left column: main content (octave cells, region cells, SVG plot, freq labels)
  - Right column: 44px wide
    - Zones 1/2/4: `.eq-zone-spacer` (visual continuity with gain column background)
    - Zone 3: `.eq-gainscale` (actual gain axis labels: -18, -12, -6, 0, +6, +12, +18)
- **Alignment guarantee:** Left columns share exact width across all zones, ensuring octave/region/frequency labels align perfectly with SVG grid
- **Internal content heights:**
  - Octave/region cells: 22px tall (centered in 34px row via `align-items: center`)
  - Vertical spacing at zone boundaries is sum of half-gaps (can appear wider than individual gaps)

## Deployment Architecture

**Process Management (Current State):**
- **Development:**
  - Fastify server: `npm run dev:server` (port 3000)
  - Vite dev server: `npm run dev:client` (port 5173)
  - Combined: `npm run dev` (starts both via npm-run-all)
- **Production (Planned):**
  - systemd service for web-ui-server (Fastify + static assets)
  - systemd service for CamillaDSP WebSocket service (existing, external)
  - Services can run on same or different devices

**Configuration:**
- `.env.example` provided (copy to `.env`)
- Default ports: server 3000, client 5173, CamillaDSP control 1234, spectrum 1235
- CamillaDSP connection params stored in browser localStorage
- Preset library: `server/data/configs/` (git-tracked)
- Latest state cache: `server/data/latest_dsp_state.json`
- No hardcoded addresses

**Asset Serving:**
- **Development:** Vite proxies API calls to Fastify
- **Production (planned):** Fastify serves `client/dist` directly via `@fastify/static`
- Alternative: Caddy/nginx reverse proxy (not required)

**Testing:**
- `npm test` - Runs all tests (server + client)
- `npm run test:server` - Server tests only (Jest)
- `npm run test:client` - Client tests only (Vitest)
