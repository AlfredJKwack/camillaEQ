# Implementation Plan — Sequential MVP Milestones

This document defines the implementation roadmap for the CamillaDSP graphical user interface, following the authoritative **design-spec.md** and aligned with the memory bank context.

## Principles
- **Each milestone is independently testable** - Can be validated in isolation
- **Build on previous milestones** - No premature dependencies
- **Reduce technical risk early** - Validate critical integration points (WS topology, rendering architecture) before feature work
- **Explicitly defer complexity** - Keep scope narrow until stability proven

## Testing Philosophy (applies to all milestones)
- **Server:** Fastify route tests using `fastify.inject()` (no real network required)
- **Client:** Unit tests for pure functions (curve generation, scale transforms, parsing)
- **Integration/E2E:** Playwright against dev server
- **WS Integration:** Use **mock WebSocket service** first to de-risk protocol/UI before touching real CamillaDSP

---

## MVP-0 — Repo + Dev Environment Baseline (Scaffolding)

### Goal
Establish the monorepo structure and build/run loop.

### Deliverables
1. **Monorepo structure:**
   ```
   /server          (Node.js + Fastify + Pino)
   /client          (Vite + TypeScript + Svelte)
   /docs            (existing)
   /memory-bank     (existing)
   ```

2. **Server setup (`server/`):**
   - `package.json` with dependencies: `fastify`, `pino`, `dotenv`
   - `tsconfig.json` for Node.js/CommonJS or ESM
   - `src/index.ts` - Basic Fastify bootstrap
   - `src/logger.ts` - Pino configuration

3. **Client setup (`client/`):**
   - `package.json` with dependencies: `vite`, `svelte`, `typescript`
   - `vite.config.ts`
   - `tsconfig.json` for browser/ESM
   - `src/App.svelte` - Placeholder root component
   - `src/main.ts` - Entry point

4. **Root configuration:**
   - Root `package.json` with workspaces
   - Scripts: `dev`, `build`, `test`
   - `.env.example` with:
     ```
     SERVER_PORT=3000
     CAMILLA_CONTROL_WS_URL=ws://localhost:1234
     CAMILLA_SPECTRUM_WS_URL=ws://localhost:1235
     ```

### Test / Acceptance Criteria
- ✅ `npm test` runs (even if minimal placeholder)
- ✅ `npm run dev` starts both server and client
- ✅ Server serves `/health` endpoint (or placeholder)
- ✅ Client renders placeholder page with "CamillaEQ" text
- ✅ HMR works for client changes

### Risk Reduced Early
- Tooling compatibility validated
- Build boundaries established
- Development workflow proven

### Deferred Complexity
- No real endpoints beyond health/version
- No WebSocket integration yet
- No domain logic

---

## MVP-1 — Backend REST Foundation + Hardening Primitives

### Goal
Implement the "minimal backend" contract exactly as design-spec describes, with reliability/security primitives.

### Deliverables
1. **Core endpoints:**
   - `GET /health` - Returns `{ status: "ok" }`
   - `GET /api/version` - Returns `{ version: string, buildHash: string, buildTime: string }`

2. **Error response contract:**
   - Structured JSON format:
     ```json
     {
       "error": {
         "code": "ERR_CONFIG_NOT_FOUND",
         "message": "Config file not found",
         "statusCode": 404
       }
     }
     ```

3. **Logging infrastructure:**
   - Request logging with correlation/request ID
   - Log fields: `time`, `level`, `msg`, `service`, `requestId`, `route`, `method`, `statusCode`, `durationMs`
   - Log levels: `info`, `warn`, `error`

4. **Shell-out utility (`src/services/shellExec.ts`):**
   - Uses `child_process.spawn` (not `exec`)
   - Implements strict timeout
   - Enforces max output size limit
   - Argument whitelist framework
   - Returns structured result: `{ success: boolean, stdout: string, stderr: string, code: number }`

### Test / Acceptance Criteria
- ✅ Route tests via `fastify.inject()`:
  - `/health` returns 200 with expected shape
  - `/api/version` returns 200 with version info
  - Invalid route returns 404 with error shape
- ✅ Logs are written in JSON format with correlation IDs
- ✅ shellExec unit tests:
  - Times out long-running command
  - Respects output size limit
  - Rejects non-whitelisted commands

### Risk Reduced Early
- Reliability + logging + security baseline established before feature work
- Error handling patterns proven

### Deferred Complexity
- ALSA/systemctl endpoints (MVP-9+)
- Config persistence (MVP-2)

---

## MVP-2 — Config Persistence API (File I/O) Without CamillaDSP Dependency

### Goal
Make config load/save deterministic and testable without touching WebSocket.

### Deliverables
1. **Config storage service (`src/services/configStore.ts`):**
   - Reads/writes DSP config JSON from disk
   - Default config location: `./data/config.json`
   - Atomic write operations (write to temp, then rename)

2. **Endpoints:**
   - `GET /api/config` - Returns current config file contents
   - `PUT /api/config` - Validates and persists config
     - Validates: payload size limit (e.g., 1MB)
     - Validates: JSON parse succeeds
     - Validates: basic shape checks (not full DSP validation yet)

3. **Error codes:**
   - `ERR_CONFIG_NOT_FOUND` - Config file missing (return default or 404)
   - `ERR_CONFIG_INVALID_JSON` - Malformed JSON
   - `ERR_CONFIG_TOO_LARGE` - Exceeds size limit
   - `ERR_CONFIG_WRITE_FAILED` - Disk write failure

### Test / Acceptance Criteria
- ✅ Unit/integration tests using temp directory:
  - GET returns stored config
  - PUT stores config and subsequent GET returns same
  - Invalid JSON rejected with `ERR_CONFIG_INVALID_JSON`
  - Missing file returns appropriate error or default
- ✅ Atomic write behavior: interrupted write doesn't corrupt existing config

### Risk Reduced Early
- File I/O patterns and error handling proven
- Deterministic persistence without external dependencies

### Deferred Complexity
- Full CamillaDSP schema validation (use contract later in MVP-8)
- Preset library / multiple configs
- Config versioning/migration

---

## MVP-3 — Mock WS Service + Client WS Plumbing (Control + Spectrum)

### Goal
De-risk the **direct browser ↔ WebSocket** topology and reconnection logic early.

### Implementation Note
**Actual file locations** (completed 2026-01-23):
- Mock WebSocket service: `server/src/services/mockCamillaDSP.ts`
- Client CamillaDSP module: `client/src/lib/camillaDSP.ts`
- Integration tests: `client/src/lib/__tests__/camillaDSP.integration.test.ts`

### Deliverables
1. **Mock WebSocket service (dev tool, `tools/mock-camilla-ws/`):**
   - Two WebSocket servers:
     - **Control WS** (port 1234): responds to `GetConfigJson`, accepts `SetConfig*` messages
     - **Spectrum WS** (port 1235): streams synthetic frames at ~10Hz
   - Implements minimal protocol per `docs/api-contract-camillaDSP.md`
   - Accepts graceful shutdown for testing reconnection

2. **Client CamillaDSP module (`client/src/dsp/CamillaDSPClient.ts`):**
   - Connection management:
     - `connect(controlUrl, spectrumUrl)`
     - `disconnect()`
     - Connection state: `disconnected | connecting | connected | error`
   - Reconnection logic:
     - Exponential backoff with jitter
     - Max retry count or infinite (configurable)
   - Message handling:
     - Parse control messages (protocol per API contract)
     - Parse spectrum frames
   - Event emitter or reactive store for connection state

3. **Connection UI component (`client/src/components/ConnectionStatus.svelte`):**
   - Displays current connection state
   - Shows reconnection attempts
   - Manual connect/disconnect buttons (for testing)

### Test / Acceptance Criteria
- ✅ Client unit tests:
  - Message parsing (mock WebSocket data)
  - Reconnect backoff timing (with fake timers)
- ✅ Playwright E2E:
  - App shows "connected" when mock service is running
  - App shows "disconnected" and attempts reconnection when mock service stops
  - App recovers when mock service restarts

### Risk Reduced Early
- Validates most critical integration: **no WS proxy** architecture
- Proves reliable reconnection before depending on real CamillaDSP
- Enables parallel frontend/backend development

### Deferred Complexity
- Real CamillaDSP protocol quirks (iterate in MVP-8)
- Full message catalog (start with minimal set)

---

## MVP-4 — EQ Editor Layout (Static) + Band Theming Contract

### Goal
Implement the **layout and CSS contracts** from design-spec without interaction yet.

### Status
✅ **COMPLETED** (2026-01-24)

### Deliverables
1. **Page structure (`client/src/pages/EqPage.svelte`):**
   - **EQ Graph Panel** (4-zone grid structure per design-spec 4.1):
     - Zone 1: Octave indicators (C1-C9) with pre/post spacers aligned to musical C frequencies
     - Zone 2: Frequency region labels (SUB, BASS, LOW MID, MID, HIGH MID, PRS, TREBLE) aligned to explicit frequencies
     - Zone 3: Main graph area (2-column: plot + gain axis labels)
       - SVG plot with log10 frequency mapping
       - Decade-based grid (majors at 20/50/100/200/500/1k/2k/5k/10k, minors conditionally)
       - Gain axis labels (-18, -12, -6, 0, +6, +12, +18) in right-side column
       - Band tokens rendered as compensated ellipses (remain circular when plot stretches)
     - Zone 4: Frequency scale labels (bottom) with first label pinned, last hidden
   - **Visualization Options Bar:**
     - Spectrum mode toggles (Off, Pre-EQ, Post-EQ)
     - Show per-band curves checkbox
   - **Right panel:**
     - N band columns (implemented with 5, supports up to 20)
     - Each column: filter type icon, slope icon, gain fader, mute button, frequency/Q dials

2. **CSS implementation (`client/src/styles/theme.css` + component styles):**
   - Global theme variables (backgrounds, text, grid, curves)
   - Band color palette (10 hues: `--band-1` through `--band-10`)
   - Band theming contract:
     ```css
     .band {
       --band-color: var(--band-1); /* set per band */
       --band-ink: color-mix(in oklab, var(--band-color) 70%, white 30%);
       --band-dim: color-mix(in oklab, var(--band-color) 35%, transparent 65%);
       --band-muted: color-mix(in oklab, var(--band-color) 18%, transparent 82%);
       --band-outline: color-mix(in oklab, var(--band-color) 55%, white 10%);
     }
     ```
   - State modifiers: `[data-enabled]`, `[data-selected]`

3. **Filter icons (`client/src/components/icons/`):**
   - SVG components for each filter type (LPF, HPF, Peaking, Shelf, etc.)
   - Stroke-only, using `currentColor`
   - Exactly as specified in design-spec

### Test / Acceptance Criteria
- ✅ Component structure:
  - All 4 zones present with correct class names
  - Gain axis labels rendered in right column
  - Octave/region alignment wrappers maintain grid consistency
  - Band tokens rendered with compensated ellipses
- ✅ Band theming:
  - Each `.band` element sets `--band-color` and derived variables propagate
  - Icons use `currentColor` (inherit from parent)
- ✅ Grid alignment:
  - All zones share same left column width via 2-column grid
  - Frequency labels align with vertical grid lines
  - Gain labels align with horizontal grid lines

### Implementation Notes
- **Alignment fix:** All 4 zones use 2-column grid (`1fr 44px`) to ensure octave/region/frequency labels stay aligned with the plot despite gain column
- **Token circularity:** Uses `<ellipse>` with compensated `rx`/`ry` based on `ResizeObserver` to counteract SVG `preserveAspectRatio="none"` stretching
- **Full-height plot:** `.eq-editor` uses `height: 100vh` and `.eq-graph` uses `flex: 1` to fill available vertical space

### Risk Reduced Early
- Locks down the UI's hardest-to-change contract (layout + theming + alignment)
- Proves CSS strategy and grid system before adding complexity

### Deferred Complexity
- Drag interaction (MVP-6)
- Curve rendering (MVP-5)
- Spectrum overlay (MVP-7)
- Functional controls (MVP-6)

---

## MVP-5 — SVG EQ Curve Rendering (Sum + Per-Band) Driven by In-Memory Config

### Goal
Prove the SVG rendering pipeline and scaling (log frequency axis, linear gain).

### Status
✅ **COMPLETED** (2026-01-24)

### Deliverables
1. **Curve rendering module (`client/src/ui/rendering/EqSvgRenderer.ts`):**
   - ✅ Functions implemented:
     - `generateCurvePath(bands, options): string` - Generates SVG path `d` attribute
     - `generateBandCurvePath(band, options): string` - Per-band curve path
     - `freqToX(freq, width): number` - Log10 scale mapping (20 Hz - 20 kHz)
     - `gainToY(gain, height): number` - Linear scale mapping (-24 to +24 dB)
   - ✅ Samples 256 log-spaced frequencies by default (configurable)
   - ✅ Automatic gain clamping to viewport bounds
   - ✅ Returns empty string for empty band arrays

2. **DSP math for response curves (`client/src/dsp/filterResponse.ts`):**
   - ✅ **Peaking filter** response using RBJ Audio EQ Cookbook biquad formulas
   - ✅ `peakingResponseDb(freq, band): number` - Complex magnitude calculation at given frequency
   - ✅ `sumResponseDb(freq, bands): number` - Combines all enabled bands
   - ✅ `generateLogFrequencies(fMin, fMax, numPoints): number[]` - Log-spaced sampling helper
   - ✅ **Note:** EQ graph shows filter bank response only (excludes preamp/output gain per spec)
   - 🔄 Low shelf, high shelf, low pass, high pass (deferred to when needed)

3. **Integration in EqPage (`client/src/pages/EqPage.svelte`):**
   - ✅ Replaced mock 5-band data with **Tangzu Waner** reference config (10 peaking filters)
   - ✅ Reactive curve path generation using `$:` reactive statements
   - ✅ **Sum curve**: White stroke (`--sum-curve`), 2.25px width, always visible
   - ✅ **Per-band curves**: Band-tinted, 1.25px stroke, 40% opacity, toggled via checkbox
   - ✅ Curves update automatically when band parameters change

### Test / Acceptance Criteria
- ✅ Unit tests (15 new tests in `EqSvgRenderer.test.ts`):
  - Frequency mapping edge cases (20 Hz → X=0, 20 kHz → X=width, decade positions)
  - Gain mapping (±24 dB → viewport top/bottom, 0 dB → middle)
  - Path generation (empty bands, stable output, clamping extreme values, disabled bands)
  - All 30 client tests passing (4 test files)
- ✅ Visual verification:
  - Sum curve renders with Tangzu Waner filter response
  - Per-band curve toggle works
  - Curves align with grid and tokens

### Implementation Notes
- Uses **48 kHz sample rate** (standard for audio DSP)
- RBJ biquad formulas provide accurate peaking filter response
- Curve paths are reactive and regenerate when bands change
- Per-band curves rendered conditionally based on `showPerBandCurves` state

### Risk Reduced Early
- ✅ Confirms SVG rendering performance is acceptable (256 points per curve)
- ✅ Validates log frequency / linear gain scaling approach
- ✅ Proves reactive curve updates work smoothly

### Deferred Complexity
- Exact DSP math for all filter types (shelf, pass filters)
- Advanced curve smoothing / interpolation
- Curve rendering optimization for >20 bands (if needed)

---

## MVP-6 — Interactive Tokens + Bidirectional Sync to Right Panel Controls

### Goal
Implement the primary interaction contract: drag tokens, adjust faders/dials; all stay in sync.

### Status
✅ **COMPLETED** (2026-01-24)

### Deliverables
1. **State management (`client/src/state/eqStore.ts`):**
   - ✅ Svelte stores for reactive band parameters (freq, gain, q, enabled, type)
   - ✅ Derived stores for token positions, curve paths, selected band
   - ✅ Action functions: `setBandFreq()`, `setBandGain()`, `setBandQ()`, `toggleBandEnabled()`, `selectBand()`
   - ✅ Automatic curve regeneration on parameter changes
   - ✅ 19 comprehensive unit tests in `eqStore.test.ts`

2. **Interactive tokens (integrated in `EqPage.svelte`):**
   - ✅ SVG ellipse elements with compensated rx/ry (remain circular when stretched)
   - ✅ Positioned based on frequency (X) and gain (Y) via `freqToX()` / `gainToY()`
   - ✅ Drag interaction with pointer capture:
     - Horizontal drag → adjust frequency (log scale)
     - Vertical drag → adjust gain (linear scale)
     - **Shift + drag** → adjust Q/bandwidth
   - ✅ Visual states: stroke width increases when selected or hovered
   - ✅ Constrained to graph bounds (20-20000 Hz, ±24 dB)
   - ✅ Mouse wheel on token → adjust Q

3. **Right panel controls (functional):**
   - ✅ **Gain fader:** Vertical slider with draggable thumb (only thumb interactive, not track)
   - ✅ **Mute button:** Toggles band enabled state (visual feedback with .muted class)
   - ✅ **Frequency dial:** KnobDial component (19px, frequency mode)
   - ✅ **Q/bandwidth dial:** KnobDial component (19px, q mode)
   - ✅ **Filter type icon:** Displays current filter type (clickable, selects band)
   - ✅ All controls read from and write to shared `eqStore`

4. **Bidirectional synchronization:**
   - ✅ Token drag → `eqStore` update → right panel values update
   - ✅ Right panel change → `eqStore` update → token moves + curve updates
   - ✅ Mute toggle → band excluded from sum curve (curve regenerates)
   - ✅ Band selection syncs between token clicks and panel interactions
   - ✅ **Any interaction in band column selects it** (using `on:pointerdown|capture`)

5. **Layout refinements:**
   - ✅ Viz options area uses 2-column grid (matches plot/freqscale alignment)
   - ✅ Band column selection styling fixed (transparent base border, colored when selected)
   - ✅ Consistent right-side gutter (32px) across all graph zones

### Test / Acceptance Criteria
- ✅ Unit tests (19 new tests in `eqStore.test.ts`):
  - Store initialization and derived values
  - Parameter updates and clamping (freq 20-20000 Hz, gain ±24 dB, Q 0.1-16)
  - Curve path regeneration on changes
  - Band enable/disable affects sum curve
  - Selection state management
  - All 49 client tests passing (5 test files)
- ✅ Visual verification:
  - Drag token → fader position and numeric values update
  - Adjust fader → token moves, curve updates
  - Change dial value → token moves, curve updates
  - Mute band → sum curve recalculates (band excluded)
  - Shift+drag token → Q value changes
  - Click anywhere in band column → selection updates

### Implementation Notes
- **Pointer capture:** Uses `setPointerCapture()` for smooth dragging outside element bounds
- **Fader interaction:** Only `.fader-thumb` is draggable (`.fader-track` is not interactive)
- **Selection UX:** Any interaction in `.band-column` triggers selection via capture phase handler
- **Coordinate mapping:** Bidirectional functions `freqToX()`/`xToFreq()`, `gainToY()`/`yToGain()`
- **Q adjustment:** Both Shift+drag and mouse wheel supported
- **ResizeObserver:** Tracks plot dimensions for accurate coordinate-to-parameter conversion

### Risk Reduced Early
- ✅ Validated hardest UI behavior (synchronization + constraints) before real WS upload
- ✅ Proved interaction model performs smoothly with curve recalculation
- ✅ Confirmed state management pattern works for complex reactive updates

### Deferred Complexity
- Context menu (right-click) for advanced band operations
- Advanced gestures (multi-touch, keyboard shortcuts beyond Shift)
- Undo/redo functionality
- Filter type selection UI (currently static icon)

---

## MVP-7 — Canvas Spectrum Renderer with Mode Toggles (Pre/Post/Off)

### Goal
Implement the high-frequency rendering path with zero DOM churn.

### Deliverables
1. **Canvas layer (`client/src/ui/rendering/SpectrumCanvasRenderer.ts`):**
   - Class with methods:
     - `init(canvas, width, height)` - Set up context
     - `render(spectrumData, mode)` - Draw bars
     - `clear()` - Clear canvas
   - Drawing logic:
     - Vertical bars for each frequency bin
     - Height based on magnitude
     - Color based on mode (pre/post)
   - Scheduling:
     - Updates at ~10Hz
     - Uses `requestAnimationFrame` for smooth rendering
     - Skips frames if data stale

2. **Spectrum data parsing (`client/src/dsp/spectrumParser.ts`):**
   - Parse WebSocket spectrum frames
   - Normalize to dB scale
   - Bin to frequency ranges matching graph

3. **Mode toggles (in visualization options bar):**
   - Off, Pre-EQ, Post-EQ
   - State stored in `eqStore`

4. **Integration:**
   - Canvas positioned behind SVG layer (z-index)
   - Receives spectrum data from mock WS service
   - Toggles change color/visibility

5. **Freeze/fade behavior:**
   - If no frames received for >500ms, fade out or show indicator
   - Dropped frame counter (debug mode)

### Test / Acceptance Criteria
- ✅ Unit tests:
  - Spectrum data normalization
  - Frequency bin mapping
- ✅ Playwright:
  - Canvas updates (verify by checking frame counter or pixel sampling)
  - Switching modes changes rendering
  - Spectrum stops updating when mock service paused, shows indicator

### Risk Reduced Early
- Confirms performance-critical path and scheduling
- Validates Canvas approach for high-frequency updates

### Deferred Complexity
- Binary frame format optimization (if needed)
- Advanced smoothing/interpolation

---

## MVP-8 — Real CamillaDSP Integration + "Commit/Debounce Upload" Policy

### Goal
Replace mock with real WebSocket service and implement upload semantics.

### Status
✅ **COMPLETED** (2026-01-25)

### Deliverables
1. **Full protocol implementation (`client/src/dsp/protocol.ts`):**
   - All message types per `docs/api-contract-camillaDSP.md`:
     - `GetConfigJson` / `GetConfigName`
     - `SetConfigJson` / `SetConfigName`
     - `Reload`
     - `GetState` / `GetVolume` / `SetVolume`
     - Spectrum messages
   - Config normalization (`getDefaultConfig()`)
   - Validation per API contract

2. **Config upload flow:**
   - On connect:
     1. `GetConfigJson`
     2. Normalize with `getDefaultConfig()`
     3. Render UI
   - On user edits:
     1. Update UI immediately (optimistic)
     2. **Upload on commit** (mouseup, drag end, input blur)
     3. Debounce: configurable 150-300ms
     4. Send `SetConfigJson` + `Reload`
     5. Handle response (success/error)

3. **Connection management UI updates:**
   - Show CamillaDSP service address in settings
   - Connection status with detailed error messages
   - Retry/reconnect controls

4. **Error handling:**
   - Config rejected by CamillaDSP → show error, revert UI or keep local state
   - Connection lost mid-edit → queue changes, apply on reconnect (or discard)

### Test / Acceptance Criteria
- ✅ Unit tests for all protocol message serialization/deserialization
- ✅ Integration test (optional, gated by env var):
  - Run against real CamillaDSP WebSocket service
  - Upload config, verify applied
- ✅ Playwright:
  - Works identically with mock and real service
  - Config changes propagate to CamillaDSP
  - Error states handled gracefully

### Risk Reduced Early
- Forces protocol correctness
- Validates topology on actual network

### Deferred Complexity
- Advanced retry strategies
- Conflict resolution (simultaneous edits from multiple clients)
- Multi-channel pipeline editor UI

---

## MVP-9 — Config Library + Persistence Roundtrip

### Goal
Load/save configs via backend and keep browser/WebSocket state consistent.

### Status
✅ **COMPLETED** (2026-01-25)

### Deliverables
1. **Config library service (`server/src/services/configsLibrary.ts`):**
   - ✅ Lists configs from `server/data/configs/` directory
   - ✅ Loads/saves pipeline-config JSON format
   - ✅ Atomic writes, validation, error handling
   - ✅ 20 comprehensive unit tests

2. **Backend endpoints:**
   - ✅ `GET /api/configs` - List all saved configurations with metadata (name, file, mtimeMs, size)
   - ✅ `GET /api/configs/:id` - Get specific configuration
   - ✅ `PUT /api/configs/:id` - Save configuration
   - ✅ Route tests with full coverage

3. **Pipeline-config mapping layer (`client/src/lib/pipelineConfigMapping.ts`):**
   - ✅ `pipelineConfigToCamillaDSP()` - Converts simplified format → full CamillaDSP config
     - Builds pipeline: one Filter step per channel with all filter names (matches extractEqBandsFromConfig expectations)
     - Handles preamp as mixer if non-zero
   - ✅ `camillaDSPToPipelineConfig()` - Extracts filters/preamp from CamillaDSP config
   - ✅ Full config replacement (pipeline + filters + devices)

4. **Presets page UI (`client/src/pages/PresetsPage.svelte`):**
   - ✅ Compact list layout (2-3× more presets visible than card grid)
   - ✅ **Search functionality:**
     - Case-insensitive substring matching
     - Real-time filtering with result counter ("X of Y")
     - Highlighted matched substrings (`<mark>` elements)
   - ✅ **Keyboard navigation:**
     - Press `/` anywhere to focus search (Vim-style)
     - Arrow Up/Down to navigate filtered results
     - Enter to load highlighted preset
     - Hover also highlights rows
   - ✅ **Load/Save operations:**
     - Load: Fetches config → `pipelineConfigToCamillaDSP()` → uploads to CamillaDSP → syncs `dspStore` + `eqStore`
     - Save: Downloads from CamillaDSP → `camillaDSPToPipelineConfig()` → saves to server
   - ✅ Error handling and loading states
   - ✅ Save dialog with config naming

5. **Flow:**
   - ✅ Load: Backend → Browser → CamillaDSP → EQ UI sync
   - ✅ Save: CamillaDSP → Browser → Backend
   - ✅ Global state updates: `updateConfig()` and `initializeFromConfig()` called after preset load

### Test / Acceptance Criteria
- ✅ Unit tests for config library service (20 tests)
- ✅ Route tests for all endpoints
- ✅ Full roundtrip verified:
  - Save config via UI
  - Load saved config
  - EQ bands correctly initialized
  - All 130 tests passing (76 client + 54 server)

### Implementation Notes
- **Config storage:** `server/data/configs/` (tracked in git)
- **Format:** pipeline-config JSON (`{ configName, accessKey?, filterArray }`)
- **Bug fixes during implementation:**
  - Fixed pipeline generation to use single Filter step per channel (not one per filter)
  - Added global state sync (`updateConfig()` + `initializeFromConfig()`) after preset load
  - Resolved "0 bands loaded" issue by ensuring pipeline structure matches extraction expectations

### Risk Reduced Early
- ✅ Validates real user workflows
- ✅ Proves persistence layer integration
- ✅ Confirms mapping layer robustness

### Deferred Complexity
- Preset tagging/categories
- Config versioning/migration
- Import/export to external files
- Advanced search (fuzzy matching)

---

## MVP-10 — Tooltip & Labels on Band Editor

### Goal
Visual enhancements for the band editor and EQ graph to improve feedback and precision.

### Status
✅ **COMPLETED** (2026-01-25)

### Deliverables

1. **Fader value tooltip with band-themed styling:**
   - ✅ Tooltip component created (`client/src/components/FaderTooltip.svelte`)
   - ✅ Show tooltip on fader `pointerdown` (positioned via fixed coordinates)
   - ✅ Tooltip displays formatted gain value (±X.X dB)
   - ✅ Fades out over 1.5 seconds after `pointerup`
   - ✅ SVG callout shape with band-colored stroke
   - ✅ **Collision-aware positioning:** Flips from left to right side if would clip off-screen
   - ✅ Uses `strokeColor` prop with computed band color:
     ```ts
     strokeColor={`color-mix(in oklab, ${
       bandIndex === null ? 'hsl(0 0% 72%)' : `var(--band-${bandIndex + 1})`
     } 55%, white 10%)`}
     ```
   - ✅ Single global tooltip instance (avoids DOM churn)
   - ✅ Position: fixed (escapes scroll container clipping)
   - ✅ Horizontal mirroring via `scaleX(-1)` when flipped to right

2. **Tickmarks on fader track:**
   - 🔄 **To Do:** Render faded tickmarks at **6 dB increments** (matching EQ plot gain grid)
   - Tickmarks use band color scheme with muted opacity
   - Thickness: 2-3px horizontal lines at fixed gain positions
   - Help users visually align fader position with plot grid

3. **Master-band zero-line coupling:**
   - 🔄 **To Do:** **Master-band fader** adjusts a **preamp/gain stage** (not CamillaDSP volume)
   - Range: **±24 dB** (same as filter bands, clamped to EQ plot limits)
   - Moving master-band fader **shifts the zero-line** on EQ plot up/down
   - Zero-line Y position = `gainToY(masterGainValue)`
   - When loading preset: apply master gain from config if present
   - **Note:** If CamillaDSP config has no gain/volume stage in pipeline, master-band has no audio effect (visual only)

4. **Fader-thumb appearance update:**
   - 🔄 **To Do:** Shape: **vertical rectangle** 14px wide × 28px high
   - Rounded corners (border-radius: 4px)
   - Fill: neutral dark color (`var(--ui-panel-2)`)
   - Outline: slightly darker than fill (`color-mix(in oklab, var(--ui-panel-2) 85%, black)`)
   - Stroke width: 1px
   - Band-selected state: add subtle colored outline using `--band-outline`

5. **Selected band brightening:**
   - 🔄 **To Do:** When `band-column[data-selected="true"]`:
     - Filter type icon → brighter
     - Slope icon → brighter
     - Fader-thumb → brighter (add colored accent)
     - Mute button → brighter
     - Knob wrapper (arc) → brighter
   - Implementation: Increase opacity or lightness of `--band-ink` for selected state

### Test / Acceptance Criteria
- ✅ Component tests:
  - FaderTooltip appears on fader thumb mousedown
  - Tooltip displays correct gain value formatted to 1 decimal place
  - Tooltip fades out over 1.5s after mouseup
  - Tooltip uses band color variables correctly
- ✅ Visual tests:
  - Fader tickmarks render at -18, -12, -6, 0, +6, +12, +18 dB positions
  - Master-band fader moves zero-line on EQ plot
  - Fader-thumb has correct dimensions and rounded corners
  - Selected band elements are brighter than unselected
- ✅ Integration tests:
  - Master gain value persists in config save/load
  - Zero-line position updates reactively when master gain changes

### Risk Reduced Early
- Validates tooltip rendering performance (fade animation must be smooth)
- Proves zero-line coupling doesn't break curve rendering

### Deferred Complexity
- Multi-touch tooltip display (show multiple tooltips if dragging multiple faders)
- Tooltip position adjustment if near top/bottom of fader track
- Advanced tooltip content (show filter name, band number)

---

## MVP-11 — EQ Page Layout Refinement

### Goal
Vertically align EQ plot and fader track to create visual continuity and improve precision.

### Status
✅ **COMPLETED** (2026-01-25)

### Deliverables

1. **New layout structure:**
   - **Full-height layout:** Navigation rail (left) + Main content area (stretches to fill viewport)
   - **Main content area split into 3 rows:**
     ```
     Row 1 (auto height): Top controls/labels
       Col 1: eq-octaves-area + eq-regions-area
       Col 2 (for each band): filter-type-icon + slope-icon
     
     Row 2 (flex: 1): Main interactive area
       Col 1: eq-plot-area (with zones 1-4 from current spec)
       Col 2 (for each band): fader-track
     
     Row 3 (auto height): Bottom controls
       Col 1: eq-freqscale-area + viz-options-area
       Col 2 (for each band): fader-value + mute-btn + knob-wrapper×2 + knob-label×2
       (Master-band column shows these controls)
     ```

2. **Alignment constraints:**
   - Row 1 height = `max(Col1 height, Col2 height)` with bottom-aligned content
   - Row 2 height = remaining viewport space (eq-plot and faders stretch together)
   - Row 3 height = `max(Col1 height, Col2 height)` with top-aligned content
   - **EQ plot top** aligns with **fader-track top**
   - **EQ plot bottom** aligns with **fader-track bottom**

3. **Maintain existing functionality:**
   - `band-column[data-selected="true"]` highlighting logic preserved
   - All existing visual states (enabled/disabled, selected/unselected) unchanged
   - No regressions in token dragging, curve rendering, or control synchronization

4. **CSS precision requirements:**
   - No vertical gaps between elements within columns
   - Borders and corners managed carefully (avoid double borders at row boundaries)
   - Consistent border styling across all band columns
   - `.band-column` wrapper spans all 3 rows for that band (maintains selection/theme context)

### Test / Acceptance Criteria
- ✅ Visual inspection:
  - Top of EQ plot octaves row aligns with top of filter-type icons
  - Bottom of EQ plot freq-scale row aligns with bottom of knob controls
  - EQ plot and fader tracks are same height and stretch together
  - No visual gaps or misalignments
- ✅ Component tests:
  - Layout responds to viewport height changes (ResizeObserver)
  - Band column selection still works (click anywhere in column)
  - All controls remain functional (faders, knobs, mute buttons)
- ✅ Regression tests:
  - Token dragging still works
  - Curves still render correctly
  - Bidirectional sync between plot and controls preserved

### Risk Reduced Early
- Locks down final layout contract before additional UI complexity
- Validates CSS grid approach for complex multi-row alignment

### Deferred Complexity
- Responsive breakpoints for smaller screens
- Collapsible sections (hide octaves/regions when space constrained)
- Horizontal scrolling for >10 bands

---

## MVP-12 — Informative EQ Plot Tokens

### Goal
Improve token visual feedback with labels, order numbers, and Q/BW arc indicators.

### Status
✅ **COMPLETED** (2026-01-26)

### Deliverables

1. **Token center index number:**
   - ✅ Displays filter's position in pipeline (1-based index: 1, 2, 3...)
   - ✅ Rendered at token center in neutral bright color (`var(--ui-text)`)
   - ✅ Font: 12px, bold, sans-serif
   - ✅ Always visible, layered above token fill

2. **Selection halo effect:**
   - ✅ Outer glow ring appears when `token[data-selected="true"]`
   - ✅ Radius: ~1.8× token radius (20% bigger)
   - ✅ Color: `color-mix(in oklab, var(--band-color) 30%, transparent)`
   - ✅ Uses SVG `<filter>` with Gaussian blur (stdDeviation=2)

3. **Q/BW arc indicator:**
   - ✅ Arc rendered around token perimeter (radius = token + gap + stroke/2)
   - ✅ Stroke: 6px width, butt caps
   - ✅ Sweep range: 30° (Q=0.1) to 270° (Q=10)
   - ✅ Centered at top (0° = 12 o'clock), grows symmetrically
   - ✅ Color: band color at 85% opacity
   - ✅ **Arc path split into 2 segments for sweeps >180°** to prevent jitter at boundary

4. **Frequency label (below token):**
   - ✅ Format: `"1.2k Hz"` or `"150 Hz"` (smart unit formatting via `formatTokenFrequency()`)
   - ✅ Numeric value in band accent color (`var(--band-color)`)
   - ✅ Unit "Hz" in muted band color (70% opacity mix)
   - ✅ Font: 14px, semi-bold
   - ✅ Positioned 10px below token baseline

5. **Q label (below frequency label):**
   - ✅ Format: `"Q 2.5"` (1 decimal place via `formatTokenQ()`)
   - ✅ Color: muted band color (same as Hz unit)
   - ✅ Font: 14px, medium weight
   - ✅ Positioned 5px below frequency label

6. **Boundary-aware label placement:**
   - ✅ Labels smoothly transition from "below" to "side orbit" when token approaches bottom
   - ✅ Uses `labelShiftFactor()` with smoothstep interpolation
   - ✅ Chooses left/right side based on token X position (< 500 → right, > 500 → left)
   - ✅ Smooth CSS transition (120ms ease-out)
   - ✅ No abrupt jumps when dragging near boundaries

7. **Shift-mode cursor feedback:**
   - ✅ Cursor changes to `ns-resize` when Shift key held (Q adjustment mode)
   - ✅ Global shift key tracking via window keyboard event listeners
   - ✅ Cursor feedback for both hover and active (dragging) states

8. **Token circularity maintained:**
   - ✅ Compensated ellipse approach with single group transform
   - ✅ Each token has `transform="translate(cx, cy) scale(1/sx, 1/sy)"`
   - ✅ All child elements (circles, paths, text) use unscaled coordinates
   - ✅ Remains perfectly circular when plot stretches

### Test / Acceptance Criteria
- ✅ Component tests:
  - Frequency formatting (20-999 Hz → "Hz", 1k-20k → "k" suffix)
  - Label position switches when token near bottom
  - Token number displays correct filter index
  - Arc sweep angle correctly mapped to Q value
- ✅ Visual tests:
  - Labels render with correct colors and positioning
  - Token remains circular when plot resized
  - Selection halo appears and has correct color
  - Q/BW arc renders at correct position and size
  - Arc grows symmetrically from top center
- ✅ Interaction tests:
  - Labels follow token during drag
  - Boundary detection works smoothly
  - Arc updates when Q changed via dial or Shift+drag

### Risk Reduced Early
- Validates SVG text rendering performance
- Proves arc rendering doesn't impact drag performance

### Deferred Complexity
- Customizable label formats (user preference for Hz vs kHz threshold)
- Label collision detection (prevent overlap when tokens close together)
- Animated arc transitions (smooth sweep changes)
- Alternative arc visualizations (filled wedge, dotted arc)

---

## MVP-13 - Usability improvements

### Goal: 

### Status
To Do.

### Deliverables:

1. **double click sets to zero**
	- double-clicking fader-thumb resets is to zero value (and updates data accordingly)
	- double click on knobs resets is to zero value (and updates data accordingly)
3. **filter-type-icon hover shows name**
    - hovering will show the name of the currently selected filter type
3. **click-drag on filter-type-icon**
    - click drag changes the filter type
    - the icon is updated accordingly
    - the global state of the filter is updated
    - ...

⸻


## MVP-14 — Informative EQ Plot Tokens

### Goal
Improve curve editing visual feedback with appropriate shading effects.

### Status
**To Do**

### Deliverables:

1) Deselection behavior
	•	Click target: Any click/tap on the EQ plot background that is not on a token (and not on token handles) will clear selection. This also clear the band selection state
	•	Result: All tokens become unselected and the plot returns to the default (unfocused) state (normal token opacity, normal spectrum contrast, normal curve visibility per default mode).

⸻

2) Token selection focus mode

When a token is selected:

Curves
	•	Show only:
		•	Selected band curve
		•	Total EQ curve
	•	Hide:
		•	All other individual band curves

Selected band curve styling
	•	Stroke: bright + thicker than total curve
	•	Draw order: above total curve and spectrum

Total curve styling
	•	Stroke: thinner + lower contrast than selected band curve
	•	Remains visible for context at all times during selection

Tokens
	•	Selected token: full opacity; keep its value labels visible (Hz, Q, and gain if you show it).
	•	Other tokens: dimmed; hide Hz and Q labels (and any other per-token labels, unless required for accessibility).

Area shading
	•	Draw the selected band’s area-of-effect visualization (see section 5) using fill/tint/halo rules per filter type.
	•	Shading must not fully obscure spectrum (opacity is configurable; see section 5).

⸻

3) Bandwidth emphasis (-3 dB half-power markers)

Feature
	•	For the selected band only, compute and render half-power (-3 dB) frequency points and show as tiny ticks on the x-axis.

Rendering
	•	Two ticks for bell/peak and notch where applicable (left/right of center frequency).
	•	For shelves and HP/LP: if -3 dB points are not meaningful/defined in your filter model, do not render ticks (or render a single knee marker if you prefer, but only if consistent with your DSP definition).

Toggle
	•	Add a visualization option: Show bandwidth markers (default: ON or OFF per product decision).
	•	When OFF: do not compute or draw the ticks.

⸻

4) Spectrum + EQ curve integration (ducking)

Trigger
	•	Spectrum ducking applies when a band is being edited (e.g., token drag, Q adjustment, slope adjustment, type change gesture).

Behavior
	•	Reduce spectrum visual prominence so it does not compete with the selected band:
	•	Decrease spectrum opacity and/or brightness/contrast (implementation choice).
	•	Ducking begins on edit start and returns to normal on edit end.
	•	If a token is merely selected (but not actively edited), spectrum may remain normal or partially ducked; recommended:
	•	Partial duck on selection
	•	Stronger duck while actively editing

⸻

5) Area-of-effect visualization by filter type

Global rules
	•	Area-of-effect is drawn only for the selected band.
	•	The fill/tint/halo uses the band specific color scheme.
	•	Fill must preserve spectrum legibility behind it.

Bell/Peak
	•	Render: fill under the selected band curve to the baseline (0 dB reference line).
	•	Fill follows the curve shape precisely.

Shelf (High/Low shelf)
	•	Render: half-plane tint indicating the affected side of the spectrum:
	•	Low shelf: tint the region below the shelf knee (frequency side depends on implementation, but should visually communicate “below knee” region).
	•	High shelf: tint the region above the shelf knee.
	•	Also render the shelf curve line (selected band curve styling).

HP/LP (High-pass / Low-pass)
	•	Render: emphasize the cutoff region:
	•	A localized tint/gradient centered around cutoff frequency (not a full under-curve fill).
	•	Show slope clearly:
	•	Stroke styling remains “selected band bright + thick”
	•	Optionally annotate slope (e.g., 12/24/48 dB/oct) near the token or on hover (optional).

Notch
	•	Render: thicker selected curve + stronger local halo around the notch region to keep thin changes visible.
	•	Halo should be localized near the notch and respect Band fill opacity.

Layering order (recommended)
	1.	Spectrum (ducked as applicable)
	2.	Area-of-effect fill/tint/halo (uses Band fill opacity)
	3.	Total EQ curve (thin / lower contrast)
	4.	Selected band curve (bright / thicker)
	5.	Tokens + labels (selected on top)

⸻

Visualization options (minimum set)
	•	Show bandwidth markers (bool)
	•	Band fill opacity (0–100%)
	•	(Optional) Spectrum ducking strength (0–100%) if you want user control; otherwise keep internal constants.


⸻

## MVP-15 - Implement pipeline editor

### Goal: Implement an easy to use, multi-channel pipeline editor.

### Status
To Do.

### Deliverables:

1. **todo**

⸻

## MVP-16 - Update to latest CamillaDSP

### Goal: Update the ws definition and app to CamillaDSP v3

### Status
To Do.

### Deliverables:

1. **Update the WebService layer**
2. **Update the internal data representation**
3. **Update usage of volume controls to incorporate limits**
4. **Leverage websocket command for reading all faders in a single call**

--

## Explicitly Deferred Complexity

The following are intentionally kept out of MVP track until core stability is proven:

### High-Impact Deferred Items
- **Multi-channel pipeline editor UI** - Large surface area, schedule after EQ editor is stable
- **ALSA device enumeration UI** - Can use backend endpoint from MVP-1 when needed
- **systemctl service management UI** - Backend endpoint ready, UI can wait
- **Advanced accessibility** (ARIA, keyboard nav beyond basics) - Polish after core interactions stable
- **Mobile/touch optimization** - Defer until desktop interaction model proven
- **Operator lock / basic auth** - Only if device will be on untrusted networks

### Lower-Priority Deferred Items
- **Client-side log forwarding to backend** - Nice-to-have observability feature
- **Full DSP math parity for all filter types** - Iterate incrementally
- **Advanced preset management** (tagging, search, cloud sync) - Far future
- **Performance profiling tools** - Add if needed based on real performance data
- **Undo/redo** - UX enhancement, not critical for MVP

---

## Testing Strategy Summary

### Unit Tests
- **Backend:** Route handlers, config store, shell-out utility, parsers
- **Frontend:** Pure functions (scale transforms, curve generation, parsing, protocol)
- **Tools:** Jest (backend), Vitest (frontend)

### Integration Tests
- **Backend:** Full Fastify server with routes, using `fastify.inject()`
- **Frontend:** Component integration with Svelte Testing Library
- **Mock dependencies:** File system, WebSocket, shell commands

### E2E Tests
- **Tool:** Playwright
- **Scenarios:**
  - Happy path: connect, load config, adjust band, save
  - Error paths: connection lost, invalid config, save failure
  - Visual regression: screenshots of key states
- **Mock CamillaDSP service** for most tests; optional real service integration

### Performance Tests
- **Canvas rendering:** Frame rate under high-frequency updates
- **SVG updates:** Latency for incremental changes
- **Backend:** Response time for config operations
- **Target:** Run on Pi Zero-class hardware, measure resource usage

---

## Next Steps

1. **Begin MVP-0** - Scaffold the monorepo structure
2. **Set up CI/CD** (optional but recommended) - Run tests on every commit
3. **Document development workflow** - How to run, test, debug
4. **Create issue/task tracking** - Break down each MVP into discrete tasks

---

## References
- `docs/design-spec.md` - Authoritative implementation specification
- `docs/api-contract-camillaDSP.md` - CamillaDSP protocol contract
- `memory-bank/` - Project context and architectural decisions
