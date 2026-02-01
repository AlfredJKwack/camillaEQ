# Current Architecture (as-built)

**Last updated:** 2026-02-01  
**Status:** MVP-21 Follow-up Complete (Unified Enablement Semantics)

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
- `/connect` - Connection parameters + DSP diagnostics
- `/eq` - Interactive EQ editor (main page)
- `/presets` - Configuration library
- `/pipeline` - Pipeline viewer (read-only, MVP-19)

**Direct WebSocket Connections:**
- Opens two separate connections to CamillaDSP:
  1. Control socket (config upload, state queries)
  2. Spectrum socket (spectrum data polling at 10Hz)
- **Request serialization:** All commands are queued and processed serially per socket (one in-flight at a time)
- **Timeout protection:** Configurable timeouts per socket (default: 5s control, 2s spectrum)
- **Cancellation safety:** Disconnect or socket closure immediately cancels all pending/in-flight requests

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

### During Spectrum Rendering (MVP-16: Analyzer Pipeline)
1. `EqPage.svelte` reactive polling logic:
   - Polls only when `overlayEnabled` is true (derived from `showSTA || showLTA || showPeak`)
   - **Stops when connection lost** (even if overlay enabled)
   - Interval: 100ms (10Hz)
   - Stops polling and clears canvas when overlay disabled or connection lost
2. Each tick calls `dsp.getSpectrumData()` → sends `GetPlaybackSignalPeak` on spectrum socket
3. Response arrives with N-bin dB array (N depends on spectrum pipeline configuration, typically 128-256)
4. **Fractional-octave smoothing** applied via `smoothDbBins()`:
   - Options: Off / 1/12 / 1/6 (default) / 1/3 octave
   - Operates on log-frequency spacing
5. **Analyzer state update** via `SpectrumAnalyzer`:
   - STA (Short-Term Average): EMA with τ=0.8s
   - LTA (Long-Term Average): EMA with τ=8s
   - Peak Hold: tracks maximum per-bin, decays at 12 dB/s after 2s hold
   - All averaging in dB domain, uses actual dt between frames
6. **Normalize to [0..1]** via `dbArrayToNormalized()`:
   - Maps -120 to 0 dBFS → 0 to 1 (rendering range)
7. **Canvas rendering** via `SpectrumCanvasRenderer` + `SpectrumAnalyzerLayer`:
   - Renders up to 3 series: STA (default ON), LTA (OFF), Peak (OFF)
   - Distinct colors per series, layered rendering
   - Spectrum ducking when band selected (70%) or actively editing (40%)

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

### Pipeline Editor (MVP-19, MVP-20, MVP-21)
**Interactive pipeline editor** with filter editing and reordering:

1. User navigates to `/pipeline` page
2. `PipelinePage.svelte` reads `dspStore.config.pipeline` (reactive)
3. `pipelineViewModel.ts` converts config → block view models:
   - Filter blocks: extract filter names, types, channel indicators
   - Mixer blocks: extract name, in/out channel counts
   - Processor blocks: extract name, type
   - Detects missing references (orphaned filter/mixer names)
4. Renders vertical stack: `[ Input ] → blocks → [ Output ]`
5. Empty states: not connected / loading / no pipeline
6. Reactive updates when config changes (e.g., after preset load or EQ edit)

**Components:**
- `FilterBlock.svelte` - displays channel badges, filter list with type icons, inline filter editor (MVP-21)
- `MixerBlock.svelte` - displays mixer name, channel routing summary
- `ProcessorBlock.svelte` - displays processor name, bypass state

**Filter editing capabilities (MVP-21):**
- Per-filter expand/collapse with parameter controls (frequency, Q, gain)
- Enable/disable filters (power button, removes from pipeline, stores in overlay)
- Remove filters (× button, cleans up orphaned definitions)
- Collapsed rows show compact parameter values (Hz, Q, dB)
- Reserved slot prevents layout shift when expand button appears

**Disabled filters overlay (MVP-21, updated MVP-21 Follow-up):**
- Browser localStorage stores disabled filter metadata with schema v2
- Schema v2: `Record<string, DisabledFilterLocation[]>` - array of locations per filter (multi-step aware)
- Each location: `{ stepKey, filterName, index }`
- `stepKey` format: `"Filter:ch0,1:idx2"` (type:channels:stepIndex)
- Enable restores filter to original position in pipeline
- **Step-scoped enable:** `markFilterEnabledForStep()` removes only specified step's overlay entry (per-block behavior)
- Overlay remaps when pipeline steps reordered (disabled filters "follow" their step)
- Implementation: `client/src/lib/disabledFiltersOverlay.ts`

**Unified enablement semantics (MVP-21 Follow-up):**
- **Enabled computation:** A filter is enabled if present in **at least one** relevant Filter step
- **Relevant Filter steps:** All `step.type === 'Filter'` steps containing EQ biquad filter set
- **Global vs per-block behavior:**
  - **EQ editor mute:** Global operation (removes/restores filter across all Filter steps)
  - **Pipeline editor enable/disable:** Per-block operation (affects only selected Filter step)
- **EQ enabled determination:** Changed from overlay check to pipeline membership scan
  - `extractEqBandsFromConfig()` checks if filter present in any Filter step
  - Band shows as enabled if present in at least one step (not bypassed)
- **Implementation files:**
  - `client/src/lib/filterEnablement.ts` - Global enable/disable helpers (for EQ mute)
  - `client/src/lib/pipelineFilterEdit.ts` - Per-block enable uses `markFilterEnabledForStep()`
  - `client/src/lib/camillaEqMapping.ts` - Pipeline membership scan for enabled computation

**Row reordering (MVP-20):**
- Drag-and-drop filter reordering within Filter blocks
- Landing zone visualization, pointer-based DnD with 6px threshold
- Direction-aware index adjustment for correct insertion
- Validation + snapshot/revert on errors

**PipelineConfig Extension (Post-MVP-9):**
The on-disk preset format now supports **optional advanced fields**:

**Legacy format (EQ-only):**
```json
{
  "configName": "My EQ",
  "filterArray": [
    { "Filter01": { "type": "Peaking", "freq": 1000, "gain": 6, "q": 1.0 } },
    { "Preamp": { "gain": -3.0 } }
  ]
}
```

**Extended format (full pipeline):**
```json
{
  "configName": "My Pipeline",
  "filterArray": [],
  "filters": { ... },
  "mixers": { ... },
  "processors": { ... },
  "pipeline": [ ... ],
  "title": "Optional title",
  "description": "Optional description"
}
```

**Loading behavior** (`pipelineConfigToCamillaDSP()`):
- If `pipeline` array is present and non-empty → uses advanced fields directly
- If `pipeline` is absent → converts legacy `filterArray` to filters/pipeline
- **Devices never stored** - always from templateConfig or defaults

---

## State Management

### Global DSP State (`dspStore.ts`)
- Singleton `CamillaDSP` instance shared across pages
- **Connection state machine:** `disconnected` / `connecting` / `connected` / `degraded` / `error`
  - **Per-socket tracking:** `controlConnected` (boolean), `spectrumConnected` (boolean)
  - **State derivation:**
    - `error` when control socket closed
    - `degraded` when control open but spectrum closed
    - `connected` when both sockets open
- Auto-reconnect with exponential backoff (max 10 attempts, 1s → 30s delays)
- **Lifecycle monitoring:**
  - `CamillaDSP.onSocketLifecycleEvent(event)` - fires on open/close/error for both sockets
  - Event-driven state transitions based on socket open/close events
  - Transport failures logged even when requests never reach DSP
- **Diagnostics export:** `exportDiagnostics()` returns connection state, version, failures (last 50), config summary
- Stores: `connectionState`, `controlConnected`, `spectrumConnected`, `dspConfig`, `dspVolume`, `failures[]`

### EQ Band State (`eqStore.ts`)
- Derived from `dspStore.dspConfig` on connect
- Stores: `bands[]`, `selectedBandIndex`, `preampGain`
- Derived: `sumCurvePath`, `perBandCurvePaths`
- Actions: `setBandFreq()`, `setBandGain()`, `setBandQ()`, `toggleBandEnabled()`
- Upload: debounced 200ms, calls `applyEqBandsToConfig()` → `uploadConfig()`

### WebSocket Lifecycle Monitoring

The client uses event-driven monitoring to track the health of both WebSocket connections:

**Lifecycle Events:**
- `CamillaDSP.onSocketLifecycleEvent(event)` callback fires for:
  - `type: 'open'` - Socket connected successfully
  - `type: 'close'` - Socket closed (graceful or unexpected)
  - `type: 'error'` - Socket error occurred
- Each event includes: `socket` ('control' | 'spectrum'), `type`, `message`, `timestampMs`

**Failure Logging:**
- All DSP command responses tracked via `onDspSuccess()` and `onDspFailure()` callbacks
- Failures include: socket identifier, command, request, response, timestamp
- **Transport failures** logged even when request never reaches DSP:
  - `"spectrum WebSocket not connected"` when calling `getSpectrumData()` on closed socket
  - Request timeouts (5s control, 2s spectrum defaults)
  - Request aborts due to socket closure
- **Bounded retention:** Last 50 failures kept in `dspState.failures[]`
- Failures NOT cleared on success (persistent for diagnostics)

**Degraded State Semantics:**
- **Control socket open + spectrum closed** = `degraded` state
- **EQ editing continues to work** (config upload via control socket)
- **Spectrum overlay unavailable** (`getSpectrumData()` returns `null`)
- **UI feedback:**
  - Nav icon shows yellow/amber color
  - Spectrum canvas clears or shows "unavailable" state
  - Connection page shows which socket is down

**Automatic Recovery:**
- Control socket failure → full reconnect attempt (both sockets)
- Spectrum socket failure → app remains in degraded state
- TODO: Implement spectrum-only reconnect for faster recovery from degraded

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
  ConnectPage.svelte  - Connection parameters + DSP diagnostics
  EqPage.svelte       - Interactive EQ editor
  PresetsPage.svelte  - Config library UI
  PipelinePage.svelte - Pipeline viewer (read-only)
lib/
  camillaDSP.ts       - WebSocket client + protocol
  camillaEqMapping.ts - EqBand ↔ CamillaDSP config conversion
  pipelineConfigMapping.ts - Pipeline-config ↔ CamillaDSP config (extended format support)
  pipelineViewModel.ts - Converts CamillaDSP config to render-friendly view models
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

## CamillaDSP Spectrum Generation Dependencies

### Overview
The spectrum analyzer in CamillaEQ displays data from CamillaDSP's filterbank-based spectrum generator (not a true FFT analyzer). The Q parameter of CamillaDSP's bandpass filters directly impacts the readability and character of the displayed spectrum.

### The Filterbank Architecture
- **Method:** CamillaDSP generates spectrum using a bank of bandpass filters (typically 256 bins)
- **Each bin:** One Biquad bandpass filter at a specific center frequency
- **Q parameter:** Controls the bandwidth of each filter
- **Output:** Peak level per filter over the most recent chunk (2048 samples @ 48 kHz ≈ 42.7 ms)

### Q Value Trade-offs

**Narrower Q (e.g., Q=18 - current tool default):**
- ✅ **Pros:** Shows narrow resonances more clearly, better frequency resolution
- ❌ **Cons:** 
  - Looks "comb-y" with many small peaks/valleys
  - More jittery, especially with peak hold meters
  - Requires more UI smoothing (fractional-octave + STA) to look sane
  - Can distract from broad tonal balance decisions

**Wider Q (e.g., Q=12 or Q=16):**
- ✅ **Pros:**
  - Smoother, more "tonal balance" oriented display
  - Easier to read behind EQ curves
  - Less visual noise, more stable
  - Better for room EQ and broad tone shaping decisions
- ❌ **Cons:** 
  - Less ability to spot razor-thin resonances
  - Lower frequency resolution

### Practical Recommendations

**For the stated goal** ("broad tone shaping / room EQ decisions, stable, low distraction"):

**Recommended Q values:**
1. **Q = 12** - Best for 256 bins if readability is priority
2. **Q = 16** - Good compromise between detail and smoothness
3. **Q = 18** - Acceptable if using 1/6 octave smoothing + STA ON (MVP-16 defaults), but on the "busy" side

### Current Implementation Status
- **Tool:** `tools/build-camillaDSP-spectrum-yml.js` generates CamillaDSP spectrum config
  - Supports CLI arguments: `--bins <int>`, `--q <number>`, `--out <filename>`
  - Defaults: 256 bins, Q=18
- **Client:** Auto-detects bin count on connection, accepts any value ≥3
- **UI:** Displays detected bin count on Connect page when connected
- **UI smoothing:** Fractional-octave (default 1/6) + STA (default ON) compensates for narrow Q
- **User control:** Smoothing selector in viz options (Off / 1/12 / 1/6 / 1/3 octave)

### Tuning Guidance
Users deploying CamillaEQ should:
1. Generate CamillaDSP spectrum config using the provided tool:
   ```bash
   # Example: 128 bins with Q=12 for smoother display
   node tools/build-camillaDSP-spectrum-yml.js --bins 128 --q 12
   ```
2. Edit the `devices:` section to match your audio setup
3. Load config on CamillaDSP's spectrum port
4. Client will auto-detect bin count and display it on Connect page
5. Adjust CamillaEQ's fractional-octave smoothing setting to taste
6. Use STA (default ON) for stable display suitable for EQ adjustment decisions

**Note:** This is a **display-only** consideration. The Q parameter in CamillaDSP's spectrum generation does not affect audio processing.

---

## Known Gaps vs. Design Spec

### Not Implemented
- Static asset serving from Fastify in production
- ALSA device enumeration endpoints (`/api/alsa/devices`)
- systemctl status endpoints (`/api/system/services`)
- Pipeline editor UI (MVP-20+: block reordering, parameter editing, add/remove)
- Right-click context menu on tokens
- Volume control UI (CamillaDSP `SetVolume` implemented, no UI)

### Deviations from Spec
- **Spectrum:** Implemented as polling (10Hz via interval) not push streaming
- **Upload strategy:** Optimistic UI + debounced upload (no revert on failure)
- **Config normalization:** Minimal (only ensures required fields exist)
