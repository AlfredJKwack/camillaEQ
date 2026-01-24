# System Architecture

## Runtime Topology (On-Device)

The system consists of three cooperating processes:

**Process A: CamillaDSP WebSocket Service**
- Provides real-time spectrum frames at ~10Hz
- Exposes control WebSocket for DSP config/state/volume commands
- May be running on the same device or a different device on LAN
- Browser connects to this DIRECTLY (not through web server)

**Process B: Web UI Server (This Project)**
- Serves static frontend assets (HTML/CSS/JS bundles)
- Provides minimal REST API:
  - `/health` - liveness check
  - `/api/version` - build info
  - `/api/config` - GET/PUT DSP config file
  - `/api/alsa/devices` - list ALSA devices
  - `/api/system/services` - systemctl status queries
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
1. Browser loads UI from Process B
2. Browser reads CamillaDSP service address (from localStorage or config endpoint)
3. Browser establishes WebSocket connections to Process A
4. Browser downloads current config via `GetConfigJson`
5. Browser normalizes config via `getDefaultConfig()`
6. UI renders initial state (curves, tokens, controls)

### During Streaming (High-Frequency Path)
- Spectrum frames arrive via WebSocket at ~10Hz
- `SpectrumCanvasRenderer` updates Canvas (no DOM mutations)
- SVG layer unaffected unless user chooses to overlay additional data

### During User Interaction (Interactive Path)
- User drags token / adjusts fader / changes filter type
- UI updates `FilterModel` parameters
- UI calls `DSP.loadToDSP()` to upload config
- Upload strategy: on commit (mouseup/drag-end) with 150-300ms debounce (configurable)
- SVG curves update immediately (incremental element updates)
- CamillaDSP service applies changes, audio processing updates

### Infrequent Queries (Config/OS Path)
- User navigates to setup page or presses refresh
- Browser calls Process B REST endpoints
- Backend executes shell commands with timeout/whitelist
- Backend returns structured JSON
- UI displays results

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
- CamillaDSP service owns active DSP state
- Browser maintains working copy of config
- Backend stores persistent config files
- Backend is NOT authoritative (just a file store)

**State Transitions:**
- Browser requests → CamillaDSP applies → Browser reflects
- No optimistic updates; UI waits for confirmation
- Explicit error handling for rejected changes

**Domain Models:**
- `camillaDSP` module: protocol, config schema, validation
- `filters` module: filter parameter operations, type coercion
- `stateStore` module: reactive UI state, derived values

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

**Process Management:**
- systemd service for web-ui-server (Fastify)
- systemd service for CamillaDSP WebSocket service (existing)
- Services can run on same or different devices

**Configuration:**
- `.env` file: ports, CamillaDSP service URL
- Config files: EQ parameters, presets
- No hardcoded addresses

**Asset Serving:**
- Fastify serves static assets directly
- OR use Caddy/nginx if reverse proxy desired (not required)
