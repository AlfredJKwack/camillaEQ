# Technology Stack

## Backend (Web UI Server - Process B)

**Runtime & Framework:**
- **Node.js** + **Fastify**
  - Lightweight, high-performance HTTP server
  - Minimal CPU/memory overhead suitable for Pi Zero-class devices
  - Built-in support for structured logging via Pino

**Logging:**
- **Pino** (JSON structured logs)
  - Fields: `time`, `level`, `msg`, `service`, `requestId`, `route`, `method`, `statusCode`, `durationMs`
  - Log levels: `info` (requests, config saves), `warn` (timeouts, partial failures), `error` (unexpected failures)

**Shell Operations:**
- `child_process.spawn` with:
  - Strict timeouts and max output size limits
  - Argument whitelisting (never accept raw command strings)
  - Predefined command templates only

**Responsibilities:**
- Serve static frontend assets
- Provide REST API for config/OS queries (NOT real-time data)
- Health/version endpoints

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

**Frontend Modules:**
- `camillaDSP`: WebSocket client, config manager, protocol implementation
- `filters`: Filter domain models, parameter schema, UI bindings
- `renderSpectrumCanvas`: High-frequency spectrum rendering pipeline
- `renderEqSvg`: EQ curve path generation (sum + per-band)
- `interaction`: Hit testing, drag handlers, keyboard support
- `apiClient`: REST calls to backend (config, OS/service queries)
- `stateStore`: Central state management, derived values

---

## WebSocket Topology (Process A - CamillaDSP Service)

**Critical:** Browser connects **directly** to CamillaDSP WebSocket service for:
- Real-time spectrum frames (~10Hz)
- DSP control messages (config, volume, etc.)

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

**Additional Views:**
- Connection parameters page
- Configuration load/save page

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
- Spectrum rendering: no DOM churn, Canvas-only
- SVG updates: incremental, avoid tree rebuilds
- Backend: non-blocking, low overhead

**Resource Usage:**
- Optimized for Pi Zero-class devices
- Predictable CPU/memory consumption
- Browser handles compute-intensive rendering

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
- Config load failures return default config + warning
- Shell-out failures return partial results + diagnostic codes
- Spectrum stall: freeze gracefully with indicator
