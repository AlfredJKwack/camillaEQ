# Technology Stack

## Backend (Web UI Server - Process B)

**Location:** `server/`

**Runtime & Framework:**
- **Node.js 18+** + **Fastify**
  - Lightweight, high-performance HTTP server
  - Minimal CPU/memory overhead suitable for Pi Zero-class devices
  - Built-in support for structured logging via Pino
  - Monorepo workspace with TypeScript

**Logging:**
- **Pino** (JSON structured logs integrated directly in `server/src/index.ts`)
  - Fields: `time`, `level`, `msg`, `service`, `requestId`, `route`, `method`, `statusCode`, `durationMs`
  - Log levels: `info` (requests, config saves), `warn` (timeouts, partial failures), `error` (unexpected failures)
  - Request/response hooks with correlation IDs
  - Structured error handler with `AppError` class

**Services Implemented:**
- `ConfigStore` - Atomic file writes for config persistence (`server/src/services/configStore.ts`)
- `ConfigsLibrary` - Preset library management in `server/data/configs/` (`server/src/services/configsLibrary.ts`)
- `shellExec` - Hardened `child_process.spawn` wrapper (`server/src/services/shellExec.ts`)
  - Strict timeouts and max output size limits
  - Argument whitelisting (never accept raw command strings)
  - **Status:** Implemented but not yet used by routes
- `mockCamillaDSP` - Development WebSocket server (`server/src/services/mockCamillaDSP.ts`)

**Implemented REST API:**
- `GET /health` - Server health check
- `GET /api/version` - Build info (version, hash, timestamp)
- `GET /api/config` - Read DSP config file from disk
- `PUT /api/config` - Write DSP config file to disk
- `GET /api/state/latest` - Read last applied DSP state (write-through cache)
- `PUT /api/state/latest` - Write last applied DSP state
- `GET /api/configs` - List saved configuration presets
- `GET /api/configs/:id` - Load specific preset
- `PUT /api/configs/:id` - Save preset

**Planned REST API:**
- `GET /api/alsa/devices` - List ALSA audio devices (not yet implemented)
- `GET /api/system/services` - systemctl status queries (not yet implemented)

**Static Asset Serving:**
- **Development:** Vite dev server (port 5173) proxies API calls to Fastify (port 3000)
- **Production:** Planned to serve `client/dist` from Fastify using `@fastify/static` (not yet implemented)

**Non-responsibilities:**
- Does NOT proxy WebSocket spectrum data (browser connects directly to CamillaDSP)

---

## Frontend (Browser App)

**Build Tools:**
- **Vite** - Fast dev server, optimized production bundling
- **TypeScript** - Preferred for type safety and maintainability

**UI Framework:**
- **Svelte** (recommended)
  - Lightweight reactive runtime
  - Compiles to minimal JavaScript
  - No virtual DOM overhead
- Fallback: Vanilla TypeScript if needed

**Rendering Architecture (Critical):**
- **Canvas layer:** Spectrum analyzer
  - 10Hz redraw rate
  - No DOM mutations
  - Reused canvas context
- **SVG/DOM layer:** EQ curves, filter tokens, controls
  - Interactive, stylable elements
  - Incremental updates (modify existing elements, don't rebuild)
  - CSS custom properties for band theming

**Frontend Modules (Actual Implementation):**
- **State Management:**
  - `dspStore.ts` - Global DSP connection + config state (singleton `CamillaDSP` instance)
  - `eqStore.ts` - EQ band parameters + derived curve paths
- **CamillaDSP Integration:**
  - `camillaDSP.ts` - WebSocket client, protocol implementation, config manager
  - `camillaEqMapping.ts` - Bidirectional EqBand ↔ CamillaDSP config conversion
  - `pipelineConfigMapping.ts` - Pipeline-config ↔ CamillaDSP config conversion
- **DSP & Rendering:**
  - `filterResponse.ts` - RBJ biquad filter math (7 filter types: Peaking, LowShelf, HighShelf, LowPass, HighPass, BandPass, AllPass)
  - `spectrumParser.ts` - Spectrum frame parsing (256-bin format)
  - `EqSvgRenderer.ts` - EQ curve path generation (256 sample points)
  - `SpectrumCanvasRenderer.ts` - Canvas rendering orchestrator with pluggable layer architecture
  - `SpectrumAreaLayer.ts` - Filled curve layer with Catmull-Rom spline + moving average smoothing
- **UI Components:**
  - `EqTokensLayer.svelte` - Token rendering + drag interaction + compensated ellipses
  - `tokenUtils.ts` - Coordinate mapping (`freqToX`, `gainToY`, etc.) + formatting
  - `Nav.svelte` - Navigation rail with connection state indicators
  - `FaderTooltip.svelte` - SVG fader value tooltip with collision detection
  - `KnobDial.svelte` - Rotary control with band-tinted arc
  - `FilterIcons.svelte` - Filter type glyphs (stroke-only SVGs)
- **Pages:**
  - `ConnectPage.svelte` - Connection parameters + auto-reconnect toggle
  - `EqPage.svelte` - Interactive EQ editor (main page, 3-row grid layout)
  - `PresetsPage.svelte` - Config library UI with search + keyboard navigation
  - `PipelinePage.svelte` - Placeholder (not implemented)
- **Utilities:**
  - `router.ts` - Hash-based routing with localStorage-based default
  - `debounce.ts` - Cancelable debounce (used for 200ms upload debounce)

---

## WebSocket Topology (Process A - CamillaDSP Service)

**Critical:** Browser connects **directly** to CamillaDSP WebSocket service for:
- **Control socket:** DSP config upload (`SetConfigJson` + `Reload`), state/volume queries
- **Spectrum socket:** Spectrum data polling at 10Hz (`GetPlaybackSignalPeak`)

**Implementation Details:**
- Two separate WebSocket connections opened by `CamillaDSP` class (`client/src/lib/camillaDSP.ts`)
- Spectrum is **polled** (not pushed): 100ms interval in `EqPage.svelte`
- Auto-reconnect with exponential backoff (max 10 attempts) via `dspStore.ts`
- Connection state tracked globally across all pages

This keeps the web UI server (Process B) minimal and avoids proxying overhead.

---

## GUI Specification

**Main View (Parametric EQ):**
- Interactive frequency response graph (log freq / linear dB)
- Draggable EQ tokens (up to 20 bands)
- Spectrum analyzer overlay (pre/post/off modes)
- Right panel: vertical faders + precise controls per band
- Filter type/slope icons (mini frequency-response curves)
- Band color persistence via CSS custom properties

**Additional Views (Implemented):**
- Connection parameters page (`ConnectPage.svelte`)
- Configuration library page with search/keyboard nav (`PresetsPage.svelte`)
- Pipeline editor page (placeholder only, `PipelinePage.svelte`)

---

## Style Guide (Web / CSS)

**Theme:**
- Dark UI with near-black neutral backgrounds
- Low-contrast grid (never competes with curves)
- High-contrast text and controls
- Consistent spacing and typography

**Band Color System:**
- 10 persistent hues (never change per band)
- CSS custom properties: `--band-color`, `--band-ink`, `--band-dim`, `--band-muted`
- Filter type shown via icon shape, NOT color
- Disabled state = same hue at reduced opacity

**Interaction States:**
- Default / Hover / Selected / Disabled
- Focus rings, subtle glows, stroke width changes
- No color hue changes for state (opacity/brightness only)

---

## Technical Constraints

**Network:**
- LAN-only operation
- No external services or cloud dependencies
- No user authentication (by default)

**Performance:**
- Low-latency audio path
- Spectrum rendering: no DOM churn, Canvas-only with pluggable layers
- SVG updates: incremental via reactive Svelte bindings, no tree rebuilds
- Backend: non-blocking, low overhead
- Upload debouncing: 200ms to reduce WebSocket chatter

**Resource Usage:**
- Optimized for Pi Zero-class devices
- Predictable CPU/memory consumption
- Browser handles compute-intensive rendering (spectrum + curve math)

**Testing:**
- Backend: Jest with `fastify.inject()` (54 tests passing)
- Frontend: Vitest (112 tests passing)
- Total: 166 tests passing

---

## Error Handling and Logging

**Backend:**
- Structured JSON logs with correlation IDs
- Timeout enforcement for shell-outs
- Errors return structured JSON with error codes
- Clear separation between recoverable and fatal errors

**Frontend:**
- WebSocket reconnect with exponential backoff
- UI shows "stream disconnected" state clearly
- Dropped frames counter (debug mode)
- Optional client log forwarding to backend (future)

**Reliability:**
- Config load failures return error or empty config (backend provides latest state fallback)
- Shell-out failures return partial results + diagnostic codes (not yet used by routes)
- Spectrum stall detection: fade out after 500ms no frames
- WebSocket auto-reconnect: exponential backoff + jitter (max 10 attempts)
- Optimistic UI updates: no revert on upload failure (user-visible error state)
- Write-through persistence: every CamillaDSP upload → `PUT /api/state/latest`
