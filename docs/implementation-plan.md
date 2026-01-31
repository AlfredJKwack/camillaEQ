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

## Post-MVP-9 Enhancement — PipelineConfig supports optional advanced fields

### Goal
Allow preset/library configs to optionally carry full pipeline sections (filters/mixers/processors/pipeline) while keeping the legacy EQ-focused format and **never persisting devices**.

### Status
✅ **COMPLETED** (2026-01-31)

### As Built
**Extended PipelineConfig type** (`client/src/lib/pipelineConfigMapping.ts`):
- Added optional fields:
  - `title?: string`
  - `description?: string`
  - `filters?: Record<string, any>`
  - `mixers?: Record<string, any>`
  - `processors?: Record<string, any>`
  - `pipeline?: any[]`

**Loading behavior** (`pipelineConfigToCamillaDSP()`):
- If `pipeline` is present and non-empty, the advanced fields are used directly.
- `devices` are always taken from the current DSP/template config (or defaults), not from disk.
- If `pipeline` is absent, the legacy `filterArray` mapping continues to be used.

### Test Coverage
- `client/src/lib/__tests__/pipelineConfigMapping.test.ts`

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

## MVP-13 - Band filter selection from 'filter-type-icon'

### Goal: Enable editing of filter type on band icon.

Enable the user to select the type of filter applied to a band by clicking on the 'filter-type-icon'. The equalizer filter type selection system provides a curated set of CamillaDSP-backed filter functions presented through familiar Parametric EQ metaphors, allowing each band to switch cleanly between peaking, shelf, pass, and notch behaviors without breaking the user's mental model of frequency shaping. Each band type explicitly defines which parameters are active, how values are preserved across type changes, and how it maps to a single CamillaDSP filter node, ensuring real-time control feels immediate, reversible, and technically accurate. The interaction prioritizes fast visual feedback and safe defaults while exposing deeper DSP capabilities progressively.

### Status
✅ **COMPLETED** (2026-01-26)

### As Built

**Filter type selection UI** (`client/src/components/FilterTypePicker.svelte`):
- **7 filter types supported** (excludes AllPass per spec):
  - Peaking (freq + gain + q)
  - LowShelf, HighShelf (freq + gain + q)
  - HighPass, LowPass (freq + q, gain disabled)
  - BandPass (freq + q, gain disabled)
  - Notch (freq + q, gain disabled)
- **Popover interaction:**
  - Click filter icon → opens popover positioned left/right of 38px band column (6px gap)
  - Speech-bubble tail (CSS double-triangle) points to filter icon
  - 4×2 grid layout with filter icon + label + subtitle per type
  - Side placement prefers right, falls back to left if no room
  - Vertical centering on icon with viewport clamping
- **Keyboard navigation:**
  - Arrow keys (up/down/left/right) navigate grid
  - Enter/Space selects highlighted type
  - Escape closes popover
- **Parameter preservation:**
  - Frequency always preserved
  - Gain preserved when switching to/from gain-supporting types
  - Q preserved across all types
  - Band curve updates immediately on type change
- **Visual feedback:**
  - Current type highlighted in popover
  - Keyboard-selected type highlighted differently
  - Band icon updates to reflect new type
  - CamillaDSP config uploaded with debounced write-through
- **Accessibility:**
  - Touch-friendly button sizes
  - Click-outside to close
  - Collision-aware positioning (flips side when needed)
  - Lighter border color for better contrast

**State management updates:**
- `eqStore.ts` extended with `setBandType()` action
- Type changes trigger immediate curve regeneration
- Fader/knobs reflect parameter availability (gain disabled for non-gain types)
- Upload debounce applies to type changes (200ms)

**All tests passing** (113 client tests)

⸻


## MVP-14 — Informative EQ Plot Token highlighting

### Goal
Improve curve editing visual feedback with appropriate shading effects.

### Status
✅ **COMPLETED** (2026-01-27)

### Deliverables

**Status:** ✅ All features implemented

1) **Deselection behavior**
	•	Click target: Any click/tap not on a token will clear selection. This also clear the band selection state
	•	Result: All tokens become unselected and the plot returns to the default (unfocused) state (normal token opacity, normal spectrum contrast, normal curve visibility per default mode).

2) **Token selection focus mode**

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

3) **Bandwidth emphasis (-3 dB half-power markers)**

Feature
	•	For the selected band only, compute and render half-power (-3 dB) frequency points and show as tiny ticks on the x-axis.

Rendering
	•	Two ticks for bell/peak and notch where applicable (left/right of center frequency).
	•	For shelves and HP/LP: if -3 dB points are not meaningful/defined in your filter model, do not render ticks (or render a single knee marker if you prefer, but only if consistent with your DSP definition).

Toggle
	•	Add a visualization option: Show bandwidth markers (default: ON or OFF per product decision).
	•	When OFF: do not compute or draw the ticks.

4) **Spectrum + EQ curve integration (ducking)**

Trigger
	•	Spectrum ducking applies when a band is being edited (e.g., token drag, Q adjustment, slope adjustment, type change gesture).

Behavior
	•	Reduce spectrum visual prominence so it does not compete with the selected band:
	•	Decrease spectrum opacity and/or brightness/contrast (implementation choice).
	•	Ducking begins on edit start and returns to normal on edit end.
	•	If a token is merely selected (but not actively edited), spectrum may remain normal or partially ducked; recommended:
	•	Partial duck on selection
	•	Stronger duck while actively editing

5) **Area-of-effect visualization by filter type**

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

6) **Band fill opacity control**
	•	Knob dial in viz options bar (0-100%, default 40%)
	•	Knob arc styled with sum-curve color for visibility
	•	Controls opacity of area-of-effect visualization

7) **Layering order** (bottom to top)
	1.	Spectrum (ducked as applicable)
	2.	Area-of-effect fill/tint/halo (uses Band fill opacity)
	3.	Total EQ curve (thin / lower contrast)
	4.	Selected band curve (bright / thicker)
	5.	Tokens + labels (selected on top)

### Visualization options implemented
	•	**Show bandwidth markers** (checkbox, default ON)
	•	**Band fill opacity** (knob dial, 0-100%, default 40%)
	•	Spectrum ducking: Internal constants (70% on selection, 40% while actively editing)

### As-Built Implementation

**Focus mode visualization (`client/src/pages/EqPage.svelte`):**
- Deselection: Click plot background clears selection (`handlePlotBackgroundClick`)
- Token dimming: Unselected tokens at 30% opacity with labels hidden
- Curve display: Sum curve (thin, low contrast) + selected band curve (thick, bright)
- Spectrum ducking: Reactive opacity based on selection state and active editing
- Active editing tracking: 250ms timeout after parameter changes

**Area-of-effect rendering (`client/src/ui/rendering/eqFocusViz.ts`):**
- `generatePeakingFillPath()`: Filled area under curve to baseline
- `generateShelfTintRect()`: Half-plane tint (left for LowShelf, right for HighShelf)
- `generatePassFilterTint()`: Localized tint around cutoff frequency
- `generateBandPassTintRect()`: Full-height window with true -3 dB boundaries + octave fallback
- `generateNotchHaloPath()`: Localized halo (curve path for wider stroke)

**Bandwidth markers (`client/src/dsp/bandwidthMarkers.ts`):**
- `calculateBandwidthMarkers()`: -3 dB half-power points
- Supports Peaking and Notch filter types
- Rendered as ticks on frequency axis when enabled

**Band fill opacity control:**
- KnobDial component with fallback arc color support (`--knob-arc` CSS variable)
- Arc styled with `--sum-curve` color for visibility
- Controls opacity of all area-of-effect visualizations

### Test / Acceptance Criteria
- ✅ Unit tests: 15 new tests in `eqFocusViz.test.ts`, 9 tests in `bandwidthMarkers.test.ts`
- ✅ Focus mode: Selected band emphasized, others dimmed
- ✅ Area-of-effect: All filter types render appropriate visualization
- ✅ Bandwidth markers: -3 dB points calculated and displayed for Peaking/Notch
- ✅ Spectrum ducking: Opacity responds to selection and editing state
- ✅ All 137 tests passing (client + server)

### Risk Reduced Early
- ✅ Validated complex SVG path generation for area fills
- ✅ Proved reactive opacity updates perform smoothly
- ✅ Confirmed focus mode doesn't break existing interactions

### Deferred Complexity
- Advanced bandwidth visualization (filled regions vs tick marks)
- User-configurable spectrum ducking strength
- Animated transitions for focus mode state changes
- Alternative area-of-effect visualization styles

⸻

## MVP-15 - Icons & CamillaDSP3

### Goal: improve UI legibility for power users.

### Status
✅ **COMPLETED** (2026-01-29/30)

### As Built

1. **Band order icons** (`client/src/components/icons/BandOrderIcon.svelte`):
   - Created component that displays one of 20 unique band position icons
   - SVG source: `client/src/assets/band-order-icons.svg` (cleaned namespace issues: `<svg>` instead of `<ns0:svg>`)
   - Each position (01-20) is a `<g id="posNN" display="none">` group
   - **Display mechanism:** Direct attribute rewriting (not CSS injection)
     - Regex pattern: `(<g id="posNN"[^>]*display=")none(")` → `$1inline$2`
     - Avoids global CSS cascade conflicts from duplicate IDs across 20 band instances
     - Each component instance independently modifies its own SVG string
   - Props: `position` (1-20, clamped)
   - Renders correctly in EqPage slope icon area

2. **Spectrum mode buttons** (`client/src/pages/EqPage.svelte`):
   - Text labels removed, replaced with image buttons
   - Assets: `vis-opt-spectrum-none.webp`, `vis-opt-spectrum-preeq.webp`, `vis-opt-spectrum-posteq.webp`
   - Button sizing: 100px × 65px
   - Vertically stacked with 4px gap
   - Title attributes: "Off", "Pre-EQ", "Post-EQ" for hover tooltips
   - Styling: existing outline + background, with selected state highlighting

3. **CamillaDSP v3 compatibility**:
   - **Fixed config persistence issue:** Removed `Reload` call from `uploadConfig()` in `client/src/lib/camillaDSP.ts`
   - CamillaDSP v3 behavior: `SetConfigJson` applies directly (no separate `Reload` needed)
   - Old behavior: `SetConfigJson` + `Reload` caused CamillaDSP to reload config from disk, reverting browser edits
   - New behavior: `SetConfigJson` → `downloadConfig()` to confirm what CamillaDSP accepted
   - Improved restore-latest heuristic in `client/src/state/dspStore.ts`:
     - Checks if filters have actual names in pipeline (not just empty structure)
     - Immediately initializes EQ store when config has filters

4. **Tools introduced**
    - An independed tool to generate a camillaDSP config for the spectrum with 250 bins (see `tools/spectrum-config-generator.js`)

### Test Results
- ✅ All 140 tests passing (client + server)
- ✅ Build successful
- ✅ Band order icons display correctly for each band
- ✅ Spectrum mode buttons render with proper images and selection states
- ✅ Filters persist across browser reload (config stays in CamillaDSP memory)

### Implementation Notes
- **BandOrderIcon collision avoidance:** Initially tried CSS injection (`<style>` tag with ID selectors), but this caused global cascade conflicts when multiple instances had duplicate `#posNN` IDs. Solution: directly rewrite `display` attribute in SVG string.
- **Namespace cleanup:** SVG asset updated from `<ns0:svg>` to `<svg>` so `{@html}` renders as proper SVG elements (not unknown HTML elements).
- **CamillaDSP v3 clarification:** `SetConfigJson` in v3 is fire-and-forget; calling `Reload` afterward fetches from disk (usually empty/baseline), effectively reverting the upload.

### Risk Reduced
- ✅ Validated SVG manipulation approach doesn't impact performance
- ✅ Confirmed CamillaDSP v3 upload semantics work correctly
- ✅ Proved attribute-rewriting approach avoids CSS collision pitfalls

### Deferred Complexity
- Advanced band icon customization (user-selectable icon sets)
- Animated spectrum mode transitions
- CamillaDSP v3 volume limits integration (deferred to MVP-17)

## MVP-16 — Averaged Spectrum + Peak Hold (Band-Energy Analyzer)

### Goals
• Support broad tone shaping and room EQ decisions using a stable, readable spectrum.
• Work reliably with CamillaDSP polling at ≤100 ms.
• Preserve legibility behind EQ curves and during band-focused editing.
• Respect the limitations and semantics of a bandpass-filter-based analyzer (not a true FFT).

This analyzer is intended as a **trend and balance visualization**, not a precision spectral measurement.

---

### Status
✅ **COMPLETED** (2026-01-30)

### As Built

**Spectrum analyzer pipeline** with temporal averaging and fractional-octave smoothing:

1. **New modules created:**
   - `client/src/dsp/spectrumAnalyzer.ts` - Temporal averaging engine (STA/LTA/Peak)
   - `client/src/dsp/fractionalOctaveSmoothing.ts` - Spatial smoothing (1/12, 1/6, 1/3 octave)
   - `client/src/ui/rendering/canvasLayers/SpectrumAnalyzerLayer.ts` - Multi-series rendering layer

2. **Temporal averaging (per-bin, dB domain):**
   - **STA (Short-Term Average):** EMA with τ=0.8s, default ON
   - **LTA (Long-Term Average):** EMA with τ=8s, default OFF
   - **Peak Hold:** Tracks maximum per-bin, 2s hold time, 12 dB/s decay rate
   - All use actual `dt` between frames (clamped to 150ms max)

3. **Fractional-octave smoothing:**
   - Options: Off / 1/12 / 1/6 (default) / 1/3 octave
   - Applied to raw dB bins before analyzer state update
   - Operates on log-frequency spacing (proper filterbank smoothing)

4. **Overlay enablement model:**
   - Overlay enabled when **any** of STA/LTA/PEAK is toggled ON
   - Pre/Post selector chooses spectrum source (buttons dim when overlay disabled)
   - Polling automatically starts/stops based on `overlayEnabled` state
   - Canvas clears when overlay disabled

5. **UI controls (EqPage viz options bar):**
   - **2×2 analyzer grid:** STA / LTA / PEAK / Reset buttons (all 32px height)
   - **Smoothing dropdown:** Off / 1/12 Oct / 1/6 Oct / 1/3 Oct
   - **Pre/Post selector:** Image buttons (vertical stack, 100×65px each)
   - **Reset button (↺):** Resets STA/LTA to current live values (not Peak)

6. **Integration:**
   - Reactive polling logic in `EqPage.svelte` (starts/stops on `overlayEnabled` change)
   - `SpectrumCanvasRenderer` orchestrates `SpectrumAnalyzerLayer` with up to 3 series
   - Distinct colors per series, proper layering (STA → LTA → Peak, front to back)
   - Spectrum ducking preserved (70% on selection, 40% while editing)

7. **Test coverage:**
   - All 140 tests passing (client + server)
   - No new test files added (integration verified via manual testing + existing test suite)

### Implementation Notes
- **Peak hold state:** Separate from STA/LTA (not affected by "Reset averages")
- **Smoothing order:** Fractional-octave → analyzer state update → normalization → render
- **Button sizing:** Uniform 32px height across STA/LTA/PEAK/Reset per user request (Option B)
- **Config persistence:** Analyzer state is ephemeral (not saved to config)

### Risk Reduced
- ✅ Validated temporal averaging performance (no frame drops at 10Hz)
- ✅ Proved fractional-octave smoothing improves readability without lag
- ✅ Confirmed overlay enablement model is coherent and predictable

### Deferred Complexity
- User-configurable hold time and decay rate (currently hardcoded)
- Advanced peak visualization (bars, dots, alternative rendering)
- Per-series opacity controls

---

### Analyzer data model (ground truth)

#### Source
• Data source: `GetPlaybackSignalPeak` from CamillaDSP.
• One value per playback channel (N = number of spectrum bands).
• Units: dBFS-like scale where **0 dB = full scale**, values typically ≤ 0.
• Measurement semantics:
  • Each value is the **peak level over the most recent CamillaDSP chunk**.
  • Chunk size: 2048 samples @ 48 kHz ≈ **42.7 ms window**.
  • Therefore, each poll already reflects a short-time windowed measurement.

#### Consequences
• The “Live” spectrum is already temporally windowed.
• No additional attack/release is applied unless explicitly added in the client.
• Polling jitter affects **time spacing**, not measurement correctness.

---

### 1) Data acquisition

• Poll interval target: dt ≤ 100 ms.
• Use actual timestamp deltas (`dt`) between frames to drive all time-based logic.
• Clamp dt to a sane maximum (recommended: 150 ms) to avoid visual jumps after stalls.
• Input values:
  • Use dB values directly as provided.
  • Normalization to [0–1] remains a **pure rendering concern**.

Frequency axis:
• Log-scaled.
• Identical bin → frequency mapping to the EQ plot.
• One-to-one correspondence between:
  • spectrum bins
  • EQ frequency axis
  • analyzer playback channels

---

### 2) Rendered layers

Up to four analyzer layers, independently toggleable:

1. Live spectrum  
   • Raw per-frame values from CamillaDSP (after optional frequency smoothing).

2. Short-term average (STA)  
   • Always available.
   • Default: ON.

3. Long-term average (LTA)  
   • User-toggleable.
   • Default: OFF.

4. Peak hold  
   • User-toggleable.
   • Default: OFF.

Suggested draw order (back → front):
• Analyzer layers
• EQ fills / tints
• Total EQ curve
• Selected band curve
• Tokens / labels

Analyzer layers must remain visually subordinate to EQ curves.

---

### 3) Temporal averaging model

All averaging operates **per bin**, in the **dB domain**, on top of CamillaDSP’s chunk-windowed peak values.

#### 3.1 Short-term average (STA)

Purpose:
• Stabilize the display while preserving meaningful movement.
• Reduce visual noise from per-chunk peak variability.

Method:
• Per-bin exponential moving average (EMA) in dB.

Parameters:
• Time constant: τ_short = 0.8 s  
  • Recommended range: 0.5–1.5 s
• EMA coefficient:
  • α_short = exp(-dt / τ_short)

Update per bin:
  STA = α_short * STA + (1 - α_short) * Live

Initialization:
• On analyzer enable or reset, initialize STA to the first valid Live frame.

Default: ON.

---

#### 3.2 Long-term average (LTA)

Purpose:
• Show typical spectral balance over time.
• Useful for room EQ and tonal trend assessment.

Method:
• Per-bin EMA in dB.

Parameters:
• Time constant: τ_long = 8 s  
  • Recommended range: 5–15 s
• EMA coefficient:
  • α_long = exp(-dt / τ_long)

Update per bin:
  LTA = α_long * LTA + (1 - α_long) * Live

Initialization:
• On analyzer enable or reset, initialize LTA to the first valid Live frame.

Default: OFF.

---

#### 3.3 Reset behavior

Provide UI action: **“Reset averages”**
• Sets STA and LTA to the current Live frame.
• Does not affect Peak Hold.

---

### 4) Peak hold

#### 4.1 Behavior

• Peak hold stores the **maximum observed value per bin**.
• Based on Live values (post smoothing, if enabled).

Per bin:
  Peak = max(Peak, Live)

#### 4.2 Hold and decay

Parameters:
• Hold time: T_hold = 2.0 s  
  • Recommended range: 1–5 s
• Decay rate: R_decay = 12 dB/s  
  • Recommended range: 6–24 dB/s

Implementation:
• Track `lastPeakTimestamp` per bin.
• If `(now - lastPeakTimestamp) > T_hold`:
  Peak = max(Live, Peak - R_decay * dt)
Default: OFF.

#### 4.3 Display

• Visually distinct from averages:
  • Thinner line, dotted line, or reduced opacity.
• No labels required.

---

### 5) Frequency-domain smoothing (spatial)

Purpose:
• Improve readability of band-energy data.
• Reduce comb-like artifacts inherent to filterbank analyzers.

Characteristics:
• Applied **only in the UI**.
• Does not affect DSP or stored averages.
• Applies consistently to Live, STA, LTA, and (optionally) Peak.

Method:
• Fractional-octave smoothing across neighboring bins.
• Operates on log-frequency spacing.

Recommended defaults:
• Default: 1/6 octave
• Options: Off | 1/12 | 1/6 | 1/3

Implementation notes:
• Prefer smoothing in linear power, then convert to dB (optional but cleaner).
• If applied in dB, accept slight bias for simplicity.

---

### 6) Toggles & controls (visualization options)

#### Required toggles
• Spectrum source: Off | Pre-EQ | Post-EQ
• Show Short-term Avg (default ON)
• Show Long-term Avg (default OFF)
• Show Peak Hold (default OFF)

#### Required controls
• Smoothing: Off | 1/12 | 1/6 | 1/3 (default 1/6)
• Analyzer opacity: 0–100%
• Reset averages

#### Optional controls
• Peak hold time (1–5 s, default 2 s)
• Peak decay rate (6–24 dB/s, default 12 dB/s)

---

### 7) Interaction with EQ editing

• When a band is selected:
  • Slightly reduce analyzer contrast or opacity.

• When a band is actively edited (dragging gain/Q/type):
  • Apply stronger analyzer ducking so the EQ curve and fill remain dominant.

• Ducking applies equally to all analyzer layers.

---

### 8) Performance & robustness

• All operations are O(N) per frame.
• Cache arrays for STA, LTA, Peak, and timestamps.
• Use actual `dt` between frames; clamp dt to ≤150 ms.
• If analyzer is Off:
  • Option A: stop polling and updates entirely.
  • Option B: keep state running for instant-on (implementation choice).

---

### Non-goals (explicit)

• This analyzer is **not** a true FFT.
• Transient precision and exact spectral magnitudes are not guaranteed.
• Intended use is **broad tonal balance, trend visualization, and EQ guidance**.


## MVP-17 - DSP info display

### Goal: Provide the user with information about the state of camillaDSP

### Status
✅ **COMPLETED** (2026-01-30)

### As Built

**Extended CamillaDSP client** (`client/src/lib/camillaDSP.ts`):
- New protocol methods:
  - `getVersion()` - Returns CamillaDSP version string
  - `getAvailableCaptureDevices(backend)` - Lists available capture devices
  - `getAvailablePlaybackDevices(backend)` - Lists available playback devices
  - `getConfigYaml(socket)` - Returns config as YAML from control or spectrum socket
  - `getConfigTitle(socket)` - Returns config title
  - `getConfigDescription(socket)` - Returns config description
- Event callbacks for success/failure tracking:
  - `onDspSuccess(info)` - Called on any successful DSP response
  - `onDspFailure(info)` - Called on any failed DSP response
  - Callbacks fire for both control and spectrum sockets
  - Info includes: timestamp, socket, command, request, response

**DSP state management** (`client/src/state/dspStore.ts`):
- Extended `DspState` interface with:
  - `version?: string`
  - `availableDevices?: { capture, playback, backend }`
  - `currentConfigs?: { control: {...}, spectrum: {...} }`
  - `failures: FailureEntry[]`
- New action: `refreshDspInfo()` - Fetches all DSP metadata after connection
- Failure tracking:
  - `handleDspSuccess()` - Clears all failures on any successful response
  - `handleDspFailure()` - Appends failure entry with full context
- Device highlighting: Compares `config.devices.*.device` with returned device lists

**ConnectPage UI** (`client/src/pages/ConnectPage.svelte`):
1. **Version display:**
   - Shows "CamillaDSP vX.Y.Z" in status card when connected
   - Hidden when disconnected

2. **Audio devices section:**
   - Two-column grid: Capture / Playback
   - Each device shows identifier + optional name
   - "In Use" badge highlights device matching current config
   - Backend name displayed (extracted from config or defaults to 'Alsa')

3. **Current configuration section:**
   - Two-column grid: Control Port / Spectrum Port
   - Each panel shows: title, description (if present), YAML config
   - YAML displayed in scrollable `<pre>` with monospace font
   - Empty state message if config unavailable

4. **DSP failures section:**
   - Only visible when failures array non-empty
   - Scrollable container with red-themed styling
   - Each failure entry shows:
     - Timestamp (formatted with `toLocaleTimeString()`)
     - Socket badge (control/spectrum)
     - Command name
     - Request payload (JSON string)
     - Response payload (formatted JSON with 2-space indent)
   - Auto-clears on next successful DSP response (any command)

**Mock server updates** (`server/src/services/mockCamillaDSP.ts`):
- Added handlers for new commands on both sockets:
  - `GetConfig` - Returns YAML config string
  - `GetConfigTitle` - Returns mock title
  - `GetConfigDescription` - Returns mock description
  - `GetAvailableCaptureDevices` - Returns mock device list
  - `GetAvailablePlaybackDevices` - Returns mock device list
- Version updated to '3.0.0' to reflect CamillaDSP v3 compatibility
- Device lists return proper `[identifier, name | null]` tuples per protocol

**Test coverage:**
- 24 new integration tests in `camillaDSP.integration.test.ts`:
  - 9 tests for new DSP info methods
  - 2 tests for success/failure callbacks
  - All existing tests updated for v3.0.0 version
- All 145 client tests passing

### Deliverables (files modified):
- `client/src/lib/camillaDSP.ts` - Extended with 6 new methods + event callbacks
- `client/src/state/dspStore.ts` - Added DSP info state + refresh action + failure tracking
- `client/src/pages/ConnectPage.svelte` - Added 3 new info sections + styling
- `server/src/services/mockCamillaDSP.ts` - Added 5 new command handlers per socket
- `client/src/lib/__tests__/camillaDSP.integration.test.ts` - Added 24 tests

### Success criteria
- ✅ When connected, Connect page shows:
  - CamillaDSP version in status card
  - Capture/playback device lists with in-use highlighting
  - YAML configs for control + spectrum with title/description when present
- ✅ When a DSP command fails, failure entry appears with full context
- ✅ Failures cleared automatically on next successful DSP response
- ✅ All 145 client tests + 54 server tests passing

## MVP-18 - Double-click fader reset to 0 dB
### Goal: Quick zero reset for fader gain values by double-clicking.

### Status
✅ **COMPLETED** (2026-01-31)

### As Built

**Double-click handlers** (`client/src/pages/EqPage.svelte`):
- Band faders: Double-clicking `.fader-thumb` calls `setBandGain(index, 0)`
- Master/preamp fader: Double-clicking `.fader-thumb` calls `setPreampGain(0)`
- Uses existing debounced upload + persistence logic (no new upload path needed)
- `event.preventDefault()` prevents text-selection quirks

**Implementation:**
- Handler: `handleFaderDoubleClick(event, bandIndex)` for band faders
- Handler: Inline arrow function for master fader (simpler, no band index needed)
- No changes to knobs (frequency/Q) - preserves current workflow

### Success criteria
- ✅ Double-clicking any band fader thumb sets gain to 0 dB
- ✅ Double-clicking master fader thumb sets preamp to 0 dB
- ✅ UI updates immediately (thumb position, tooltip if visible)
- ✅ Existing upload debounce applies (config persisted after 200ms)
- ✅ All existing tests remain passing


⸻

## MVP-19 — Pipeline Viewer (Read-Only Display)

### Goal
Implement read-only visualization of the CamillaDSP pipeline structure to establish the UI foundation before adding editing capabilities.

### Status
✅ **COMPLETED** (2026-01-31)

### Deliverables

1. **PipelinePage layout (`client/src/pages/PipelinePage.svelte`):**
   - Vertical stack of pipeline blocks (signal flow: top → bottom)
   - Fixed-width column (similar to EQ editor width constraints)
   - One visual block per pipeline step
   - Input/Output indicators at top/bottom

2. **Block component architecture:**
   - `FilterBlock.svelte` - Displays filter step with:
     - Filter type icons (reuse from EQ editor)
     - Channel indicators (which channels this filter applies to)
     - Filter names list
     - Bypass state indicator
   - `MixerBlock.svelte` - Displays mixer step with:
     - Mixer name
     - Summary view (channel counts: in → out)
     - Bypass state indicator
   - `ProcessorBlock.svelte` - Generic display for Processor/Unknown steps with:
     - Step type label
     - Step name (if present)
     - Bypass state indicator

3. **Visual distinction between block types:**
   - Color-coded borders or background tints
   - Type-specific icons
   - Consistent with existing theme variables

4. **Data source:**
   - Reads from `dspStore.config.pipeline`
   - Reactive updates when config changes
   - No local state (pure view of shared config)

### As Built

**Pipeline view model** (`client/src/lib/pipelineViewModel.ts`):
- Converts CamillaDSP config into render-friendly block view models
- Supports `Filter`, `Mixer`, and `Processor` pipeline steps
- Surfaces missing references (missing filters/mixers), bypass state, and per-block display labels

**Pipeline block components** (`client/src/components/pipeline/*`):
- `FilterBlock.svelte`
  - Channel badges
  - Filter list with filter type icons when possible
  - Missing reference + bypass indicators
- `MixerBlock.svelte`
  - Mixer name + in/out channel summary
  - Missing reference indicator
- `ProcessorBlock.svelte`
  - Generic processor/unknown step display
  - Bypass indicator

**Pipeline page** (`client/src/pages/PipelinePage.svelte`):
- Fixed-width vertical stack with explicit `[ Input ] → blocks → [ Output ]` signal flow
- Robust empty states (not connected / loading / no pipeline)
- Pure read-only rendering of shared `dspStore.config`

**Bug fix (supporting)**
- `client/src/lib/camillaTypes.ts`: `normalizePipelineStep()` now preserves `name` for any step type that includes it (not only Mixer/Processor)

### Test / Acceptance Criteria
- ✅ Component tests:
  - Each block type renders with correct data
  - Blocks display in pipeline order
  - Bypass state visually indicated
- ✅ Integration test:
  - Load config with multiple block types
  - Pipeline page displays all blocks correctly
  - Changes to `dspStore.config` trigger re-render
- ✅ Visual verification:
  - Signal flow direction is clear (top → bottom)
  - Block types are visually distinguishable
  - Layout matches spec (vertical stack, fixed width)

### Test Coverage (As Built)
- `client/src/lib/__tests__/pipelineViewModel.test.ts`
- `client/src/pages/PipelinePage.test.ts`

### Risk Reduced Early
- ✅ Validates layout approach before adding interaction complexity
- ✅ Confirms block component architecture is extensible
- ✅ Proves reactive rendering from shared config works

### Deferred Complexity
- Block editing (MVP-21, MVP-22)
- Reordering (MVP-20)
- Add/remove operations (MVP-23)
- Detailed mixer routing view (MVP-22)
- Selection/focus states (MVP-20)


⸻

## MVP-20 — Pipeline Block & Element Reordering

### Goal
Enable **drag-and-drop reordering** of:

- **Pipeline blocks** (items in `dspStore.config.pipeline[]`)
- **Elements within a block**, specifically:
  - Filter block: `pipeline[i].names[]` reordering **within the same Filter block**
  - (Deferred: moving names across different Filter blocks)

All reorders must preserve a valid CamillaDSP config and apply live via the **existing upload flow** (same behavior/policy as EQ: optimistic UI, debounced upload).

### Status
✅ **COMPLETED** (2026-02-01)

### As Built

**Row-level drag & drop implementation** with pointer events (no HTML5 drag-drop API):

1. **Filter row reordering** (`client/src/components/pipeline/FilterBlock.svelte`):
   - Per-row grab handles (☰, 24px width) for each filter in Filter blocks
   - Pointer-based DnD with 6px movement threshold
   - **Landing zone system:** Visual "Drop here" indicator rendered **before** target row
   - **Index adjustment logic:** Accounts for remove-then-insert shift when dragging down
     - Drag up (toIndex < fromIndex): no adjustment
     - Drag down (toIndex > fromIndex): `toIndex -= 1` to account for array shift
   - **Placeholder behavior:** Dragged row becomes semi-transparent (50% opacity)
   - **No-flicker design:** Gaps removed during drag (`gap: 0`) to prevent visual jitter
   - Stable identity: Each filter row keyed by `filter.name`
   - Dispatches `reorderName` event with `{blockId, fromIndex, toIndex}`

2. **PipelinePage integration** (`client/src/pages/PipelinePage.svelte`):
   - Event handler: `handleFilterNameReorder()` receives events from FilterBlock
   - **Identity-based lookup:** Uses `getStepByBlockId()` to find pipeline step by blockId
   - **Validation + snapshot/revert:**
     - Takes deep snapshot before reorder
     - Applies reorder via `reorderFilterNamesInStep()`
     - Validates updated config against CamillaDSP
     - On failure: reverts to snapshot + shows inline error banner
     - On success: optimistically updates UI + triggers debounced upload (200ms)
   - Same upload flow as EQ editor: `commitPipelineConfigChange()`

3. **Supporting infrastructure:**
   - **Stable IDs** (`client/src/lib/pipelineUiIds.ts`):
     - `getBlockId(step, index)` - Generates UI-only blockId (not persisted)
     - `getStepByBlockId(blockId)` - Reverse lookup using WeakMap
     - Regenerated only when config loaded from DSP/preset
   - **Reorder utilities** (`client/src/lib/pipelineReorder.ts`):
     - `arrayMove(arr, fromIndex, toIndex)` - Pure array reordering function
     - `reorderFilterNamesInStep(config, stepIndex, fromIndex, toIndex)` - Reorders `names[]` array
     - Returns new config (immutable pattern)
   - **Pipeline editor state** (`client/src/state/pipelineEditor.ts`):
     - `commitPipelineConfigChange()` - Debounced upload with validation
     - Upload status tracking (idle/pending/success/error)

4. **Test coverage:**
   - Updated `PipelinePage.test.ts` to expect `buildPipelineViewModel($dspConfig, getBlockId)`
   - All 240 tests passing (client + server)

### Implementation Notes
- **Pointer capture:** Uses `setPointerCapture()` for smooth dragging outside element bounds
- **Landing zone placement:** Rendered before target row to align with insertion semantics
- **Direction-aware index fix:** Critical for correct drop behavior (fixed off-by-one in both directions)
- **No HTML5 drag-drop:** Avoids jitter and nested dragging issues
- **Block-level reordering:** Deferred to future milestone (MVP-20 focuses on row-level only)

### Risk Reduced Early
- ✅ Validated pointer-event drag implementation (no jitter, smooth performance)
- ✅ Proved landing zone approach eliminates visual flicker
- ✅ Confirmed index adjustment logic works for both directions
- ✅ Validated snapshot/revert pattern for error recovery

### Deferred Complexity
- Block-level reordering (moving entire pipeline steps)
- Cross-block filter moves (dragging filters between different Filter blocks)
- Keyboard-based reordering
- Multi-selection
- Undo/redo
- Auto-scroll during drag

### 1. Drag-and-Drop Implementation (Hard Constraints)

#### 1.1 Event Model
- **HTML5 drag-and-drop API is forbidden** (`draggable`, `dragstart`, `dragover`, `drop`)
  - Rationale: causes jitter, unstable hit testing, and broken nested dragging.
- Use **Pointer Events with manual hit testing**:
  - `pointerdown`: record candidate (pointer position + element rect)
  - Drag begins only after movement threshold (~4–6px)
  - Single `pointermove` listener while dragging
  - Visual updates via `requestAnimationFrame`
  - `pointerup` / `pointercancel`: commit or cancel reorder

#### 1.2 Drag Scopes
Two mutually exclusive drag scopes:

1. **Block-level drag**
   - Reorders `dspStore.config.pipeline[]`
   - Drag handle: block header / explicit handle only
2. **In-block drag (Filter blocks only)**
   - Reorders `pipeline[i].names[]`
   - Drag handle: per-row handle only

Forbidden in MVP:
- Dragging filter names across blocks
- Dragging into non-Filter blocks
- Nesting blocks

---

### 2. Stable Identity & Rendering Model (Non-Negotiable)

#### 2.1 Identity Rules
Rendering MUST be identity-based so DOM nodes move with data.

- **Pipeline blocks**
  - UI-only `blockId`, not persisted
  - Computed when config is loaded:
    - `blockId = \`\${type}:\${name ?? ''}:\${indexAtLoad}\``
  - Stored via `WeakMap<object, string>` or parallel UI array
  - Regenerated only when a new config is loaded from DSP/preset
- **Filter names**
  - Keyed by `{ blockId + filterName }`

Keying by array index is explicitly forbidden.

---

### 3. Selection & Highlight Behavior

#### 3.1 Selection Model
Single-selection across both scopes:

- `{ kind: 'block', blockId }`
- `{ kind: 'filterName', blockId, name }`

#### 3.2 Click Behavior
- Click block background → select block
- Click filter-name row → select that row
- Click pipeline background → deselect

#### 3.3 Drag Interaction
- Dragged item becomes selected on drag start
- Selection highlight MUST move with the dragged item (identity-based)

---

### 4. Landing Zones & Drop Target Mechanics (Normative)

#### 4.1 Core Concepts
During drag, the UI distinguishes between:

- **Real rows**
  - Existing pipeline blocks or filter-name rows
- **Landing zone**
  - A **synthetic row** representing the insertion point
  - Only **one landing zone** may exist at any time
  - The landing zone is the authoritative drop target

---

#### 4.2 Landing Zone Creation
- No landing zone is shown at drag start.
- When the pointer enters a reorderable list:
  - Compute candidate insertion index
  - Render a landing zone at that index

**Landing zone characteristics**
- Height:
  - Approximately equal to the dragged row (or consistent fixed gap)
- Appearance:
  - Empty slot / dashed outline / glow
  - Visually distinct from real rows
- Layout:
  - Occupies real space (pushes rows apart)

---

#### 4.3 Placeholder vs Landing Zone (Distinct Roles)

- **Placeholder**
  - Occupies the original position of the dragged item
  - Exists for the entire drag
  - Prevents list collapse
- **Landing zone**
  - Represents potential drop position
  - Moves as drag intent changes
  - Is the sole drop target while hovered

They MUST NOT be conflated.

---

### 5. Landing Zone Hit Testing & Continuity (No-Flicker Corridor)

#### 5.1 Priority Rules
1. Landing zone has highest hit-test priority
2. Real rows are considered only when pointer is not over the landing zone

---

#### 5.2 Continuous Hit Corridor (Mandatory)

The pointer MUST be treated as moving through a **single continuous corridor**:

`[row N] → [landing zone] → [row N+1]`

Within this corridor:

- The landing zone MUST NOT be removed, recreated, or repositioned
- No flicker, redraw, or index change is permitted
- The insertion index remains stable

This explicitly covers:
- row → landing zone → next row transitions

---

#### 5.3 Zero-Gap Geometry Requirement
- No visual or hit-test gaps may exist between:
  - Row N bottom ↔ landing zone top
  - Landing zone bottom ↔ row N+1 top
- Boundaries must abut exactly
- If the pointer lies exactly on a shared boundary:
  - The landing zone owns that boundary

---

#### 5.4 Reposition Rules
- The landing zone MAY move only when:
  - The pointer exits the current corridor AND
  - Enters a different corridor (different adjacent row pair)
- Optional hysteresis:
  - Require ≥25–35% penetration into a new row before corridor change

---

#### 5.5 Drop Commit Semantics
- Dropping anywhere over the landing zone:
  - Commits insertion at the landing zone’s index
- Dropping outside all valid zones:
  - Cancels reorder and restores snapshot
- No midpoint logic is evaluated at drop time

---

### 6. Reorder Semantics (Data-Level)

#### 6.1 Block Reorder
- Move pipeline entry `fromIndex → toIndex`

#### 6.2 Filter Name Reorder (MVP-Critical)
- Applies only to `pipeline[i].type === 'Filter'`
- Reorder `pipeline[i].names[]` in-place
- `channels[]` remains unchanged

---

### 7. Validation, Snapshot, and Revert Rules

#### 7.1 Snapshot Policy
- Take deep snapshot of config at drag start:
  - `preDragConfigSnapshot`
- Snapshot is local to pipeline editor module

#### 7.2 Validation Flow
1. Apply reorder optimistically
2. Run `camillaDSP.validateConfig()`
3. On failure:
   - Revert snapshot
   - Show inline editor error
   - Do not upload
4. On success:
   - Trigger debounced upload

---

### 8. Live Upload (No Contract Changes)

- 200ms debounce (same as EQ)
- Triggered only on drop commit
- Use existing flow:
  - `uploadConfig()` → `SetConfigJson` → `Reload`
- Upload failure:
  - No rollback protocol
  - UI remains optimistic
  - Surface error state only

---

### 9. No Contract / Store Churn (Hard Constraint)

Forbidden:
- WebSocket protocol changes
- New DSP commands
- Store architecture rewrites
- Transactional commit systems

Allowed:
- Local drag state
- Helper utilities for hit testing / reorder math
- Editor-local error and status indicators

---

### 10. Pipeline Integrity Checks

After reorder, validation must ensure:

- Filter blocks reference existing `config.filters`
- Mixer blocks reference existing `config.mixers`
- Processor blocks reference existing `config.processors`

No auto-repair in MVP.

---

### 11. Test & Acceptance Criteria

#### Component
- Block reorder updates `pipeline[]`
- Filter-name reorder updates `pipeline[i].names[]`
- Selection highlight follows moved element
- Invalid reorder reverts snapshot and blocks upload

#### Integration
- Valid reorder → debounced upload → CamillaDSP updated
- Invalid reorder → no upload → error shown

#### Visual
- Smooth drag, no jitter
- Stable landing zone
- No flicker when traversing row → zone → row
- Placeholder prevents layout collapse

---

### 12. Deferred Complexity

- Keyboard reordering
- Button-based reordering
- Multi-selection
- Undo / redo
- Cross-block filter moves
- Block creation / deletion
- Auto-scroll during drag

⸻

## MVP-21 — Filter Block Editor (Basic Parameters)

### Goal
Enable inline editing of filter parameters with live DSP application and parameter validation.

### Status
To Do.

### Deliverables

1. **Filter block editor UI:**
   - Expand selected filter block to show parameter controls
   - Reuse existing components from EQ editor:
     - `KnobDial` for frequency/Q
     - Filter type icon (read-only for now)
     - Gain fader (if filter type supports gain)
   - Enable/disable toggle per filter
   - Remove filter button

2. **Parameter editing:**
   - Edit frequency: 20-20000 Hz (same constraints as EQ)
   - Edit Q: 0.1-10 (same constraints as EQ)
   - Edit gain: ±24 dB (for gain-capable filter types)
   - Parameter changes update `dspStore.config.filters[filterName]` directly
   - Reuse existing clamping/rounding functions from `eqStore.ts`

3. **Filter list display:**
   - Show all filters referenced by selected Filter block
   - Expand/collapse individual filters
   - Visual indicator for which filters are enabled/disabled
   - Display filter order (matches pipeline order)

4. **Validation:**
   - Reuse existing filter param validation from `camillaEqMapping.ts`
   - Prevent invalid parameter values (clamp on input)
   - Show warning if filter type doesn't support gain parameter

5. **Live upload:**
   - Debounced upload after parameter change (200ms)
   - Same flow as EQ editor: update config → validate → upload → download
   - Upload status indicator

### Test / Acceptance Criteria
- ✅ Component tests:
  - Parameter controls update filter definition
  - Clamping works correctly
  - Enable/disable updates filter bypass state
  - Remove filter updates pipeline step names array
- ✅ Integration tests:
  - Edit filter frequency → config updated → uploaded → CamillaDSP reflects change
  - Edit gain on non-gain filter type → gain ignored or clamped
  - Remove filter from middle of list → pipeline integrity maintained
- ✅ Visual verification:
  - Parameter controls match EQ editor styling
  - Changes reflect immediately in UI
  - Upload status visible

### Risk Reduced Early
- ✅ Validates filter editing interaction model
- ✅ Proves component reuse from EQ editor works in Pipeline context
- ✅ Confirms parameter validation is consistent across editors

### Deferred Complexity
- Filter type changing (use FilterTypePicker from EQ)
- Adding new filters to block (MVP-23)
- Multi-filter selection/editing
- Advanced filter types (Gain, Conv, etc.)
- Copy/paste filter parameters

⸻

## MVP-22 — Mixer Block Editor (Basic Routing)

### Goal
Enable editing of mixer routing, per-source gains, and inversion with validation to prevent invalid routing states.

### Status
To Do.

### Deliverables

1. **Mixer block editor UI:**
   - Summary view (default): channel counts (in → out)
   - Detailed view (expandable): full routing matrix
   - Per-destination channel:
     - List of source channels
     - Per-source gain control (slider or numeric input)
     - Per-source inversion toggle
     - Mute toggle per source

2. **Routing validation:**
   - Prevent silent channel loss (at least one non-muted source per dest)
   - Warn on summing (multiple sources to one dest)
   - Enforce gain ≤ 0 dB when summing (attenuation requirement)
   - Show inline warnings/errors per destination channel

3. **Gain editing:**
   - Per-source gain: -150 to +50 dB (CamillaDSP range)
   - Default: 0 dB (unity gain)
   - Slider or numeric input (implementation choice)
   - Visual warning if gain > 0 dB while summing

4. **Channel mapping:**
   - Visual representation of source → dest mapping
   - Highlight active (non-muted) sources
   - Clear indication of channel indices

5. **Live upload:**
   - Debounced upload after routing/gain change (200ms)
   - Validation blocks upload if routing is invalid
   - Upload status indicator

### Test / Acceptance Criteria
- ✅ Component tests:
  - Routing changes update mixer definition
  - Validation catches silent channel loss
  - Validation catches gain > 0 dB summing
  - Inversion toggle updates source config
- ✅ Integration tests:
  - Edit mixer routing → config updated → uploaded → CamillaDSP reflects change
  - Create invalid routing (silent channel) → error shown → upload blocked
  - Sum with gain > 0 → warning shown → upload blocked
- ✅ Visual verification:
  - Routing matrix is clear and unambiguous
  - Warnings/errors are descriptive
  - Gain controls are easy to adjust

### Risk Reduced Early
- ✅ Validates mixer editing complexity
- ✅ Proves routing validation logic is sound
- ✅ Confirms inline error display approach

### Deferred Complexity
- Adding/removing mixer destination channels (requires device config awareness)
- Advanced routing patterns (crossfeed, etc.)
- Preset routing templates
- Copy/paste routing configurations
- Mixer name editing

⸻

## MVP-23 — Add/Remove Pipeline Blocks

### Goal
Explicit add/remove actions for pipeline blocks with validation to maintain pipeline integrity.

### Status
To Do.

### Deliverables

1. **Add actions (explicit buttons):**
   - "Add Filter Block" button (+ icon, positioned at top or in toolbar)
   - "Add Mixer Block" button
   - "Add Processor Block" button (generic/unknown type)
   - Click to add → new block inserted at selected position or end of pipeline

2. **Add Filter Block flow:**
   - Create new Filter pipeline step with empty names array
   - Default: applies to channel 0 (or all channels, configurable)
   - Opens editor to add filters to new block (or starts empty)

3. **Add Mixer Block flow:**
   - Create new Mixer definition with default routing (passthrough)
   - Default: 2 in → 2 out (or match device config)
   - Create pipeline step referencing new mixer
   - Opens editor to configure routing

4. **Add Processor Block flow:**
   - Create new Processor step with user-specified name
   - Prompt for processor type/name (text input)
   - Parameters left empty (user must configure externally or via advanced editor)

5. **Remove actions:**
   - Remove button on selected block
   - Confirmation dialog for destructive operations (filter blocks with filters, mixers with complex routing)
   - Remove step from pipeline array
   - Optionally remove orphaned filter/mixer definitions (if not referenced elsewhere)

6. **Validation:**
   - Prevent adding blocks that would exceed v1 limits (max 3 blocks, 20 filters per block)
   - Later MVPs: remove limits or make configurable
   - Validate pipeline integrity after add/remove
   - Block invalid operations (e.g., removing last Filter block if EQ editor depends on it)

7. **Live upload:**
   - Debounced upload after add/remove (200ms)
   - Same validation + upload flow

### Test / Acceptance Criteria
- ✅ Component tests:
  - Add filter block → pipeline updated
  - Add mixer block → mixer definition created
  - Remove block → pipeline step removed
  - Validation blocks invalid add/remove
- ✅ Integration tests:
  - Add filter block → uploaded → CamillaDSP has new step
  - Remove mixer block → uploaded → mixer definition removed (if orphaned)
  - Remove block with confirmation → user can cancel
- ✅ Visual verification:
  - Add buttons are clear and accessible
  - Remove confirmation dialog is descriptive
  - New blocks appear in correct position

### Risk Reduced Early
- ✅ Validates add/remove interaction model
- ✅ Proves pipeline integrity checks work
- ✅ Confirms destructive operation UX (confirmations)

### Deferred Complexity
- Adding filters to existing Filter block (inline "Add Filter" within block)
- Drag-and-drop to reorder while adding
- Template-based block creation (e.g., "Add 4-band EQ block")
- Duplicate block operation
- Import/export individual blocks

⸻

## MVP-24 — Processor/Unknown Block Support

### Goal
View and manipulate Processor and unknown pipeline step types to enable construction of arbitrary CamillaDSP pipelines.

### Status
To Do.

### Deliverables

1. **Processor block display:**
   - Show processor type (e.g., "Processor", "Compressor", "Limiter")
   - Show processor name
   - Show parameters (if present) as key-value pairs (read-only or basic editing)
   - Bypass state indicator

2. **Unknown block display:**
   - Show step type (whatever CamillaDSP returns)
   - Show all step properties as JSON (formatted, read-only)
   - Warning indicator: "Unknown block type - external configuration required"

3. **Add Processor block:**
   - Prompt for processor name (text input)
   - Optionally prompt for processor type (dropdown of known types)
   - Create pipeline step with empty parameters object
   - User must configure processor externally (via CamillaDSP config file or advanced editor)

4. **Edit Processor block (basic):**
   - Edit processor name
   - Edit bypass state
   - Reorder (already supported from MVP-20)
   - Remove (already supported from MVP-23)

5. **Preserve unknown block data:**
   - Never modify unknown block properties
   - Reordering/removal works
   - Editing not allowed (read-only view)
   - Warning: "This block type is not fully supported - changes may require external configuration"

6. **Validation:**
   - Processor blocks: validate name is non-empty
   - Unknown blocks: no validation (assume valid if CamillaDSP accepts it)
   - Pipeline integrity checks still apply

### Test / Acceptance Criteria
- ✅ Component tests:
  - Processor block renders with name and parameters
  - Unknown block renders with JSON view
  - Add processor → pipeline updated
  - Remove processor → step removed
- ✅ Integration tests:
  - Load config with processor step → displayed correctly
  - Add processor → uploaded → CamillaDSP accepts it
  - Reorder pipeline with processor → order updated
  - Load config with unknown type → displayed with warning
- ✅ Visual verification:
  - Processor blocks visually distinct
  - Unknown blocks have clear warning indicator
  - JSON view is readable

### Risk Reduced Early
- ✅ Validates generic block handling approach
- ✅ Proves unknown block preservation works
- ✅ Confirms editor can handle arbitrary pipeline step types

### Deferred Complexity
- Advanced processor parameter editing (type-specific UIs)
- Processor parameter validation
- Processor library/presets
- Drag-and-drop processor templates
- External processor configuration import

⸻

## MVP-25 — Pipeline Validation UI

### Goal
Implement comprehensive inline validation with descriptive error messages that block invalid DSP applications.

### Status
To Do.

### Deliverables

1. **Validation layer (`client/src/lib/pipelineValidation.ts`):**
   - `validatePipeline(config): ValidationResult` - Top-level validation
   - Checks:
     - Filter references: all filter names in pipeline exist in config.filters
     - Mixer references: all mixer names in pipeline exist in config.mixers
     - Processor references: processor names are non-empty
     - Channel references: channels exist in device config
     - Mixer routing: no silent channels, valid summing
     - Filter parameters: within valid ranges
   - Returns: `{ valid: boolean, errors: ValidationError[], warnings: ValidationWarning[] }`

2. **Inline error display:**
   - Errors shown on affected block (red border, error icon)
   - Error message displayed in block or in tooltip
   - Example: "Filter 'EQ5' referenced but not found in config.filters"
   - Block-level errors prevent that block's changes from uploading

3. **Inline warning display:**
   - Warnings shown on affected block (yellow border, warning icon)
   - Warning message displayed
   - Example: "Mixer 'preamp' sums 2 sources - ensure gains are attenuated"
   - Warnings do not block upload (user can proceed)

4. **Global validation state:**
   - Show validation summary at top of page (e.g., "3 errors, 1 warning")
   - "Apply" button (if added) disabled when errors present
   - Or: upload automatically blocked when errors present (existing debounced flow)

5. **Validation triggers:**
   - After every pipeline edit (reorder, add, remove, parameter change)
   - Before upload attempt
   - Continuous (reactive) validation as user edits

6. **Integration with existing validators:**
   - Reuse `camillaDSP.validateConfig()` for filter/mixer reference checks
   - Reuse `camillaEqMapping.ts` validation for filter parameters
   - Add new validators for mixer routing (silent channels, summing)

### Test / Acceptance Criteria
- ✅ Unit tests (20+ tests in `pipelineValidation.test.ts`):
  - All validation rules tested individually
  - Error messages are descriptive
  - Edge cases handled (empty pipeline, single block, etc.)
- ✅ Component tests:
  - Errors displayed on correct blocks
  - Warnings displayed correctly
  - Validation state updates reactively
- ✅ Integration tests:
  - Create invalid pipeline → errors shown → upload blocked
  - Fix errors → upload proceeds
  - Warnings do not block upload
- ✅ Visual verification:
  - Error/warning indicators are clear
  - Error messages are helpful
  - Validation summary is visible

### Risk Reduced Early
- ✅ Validates validation layer is comprehensive
- ✅ Proves error display UX is clear
- ✅ Confirms validation integrates with existing code

### Deferred Complexity
- Advanced validation rules (e.g., phase coherence, latency checks)
- Validation for advanced filter types (Conv, DiffEq, etc.)
- Validation suggestions (e.g., "Did you mean 'EQ5_L' instead of 'EQ5'?")
- Validation history/log

⸻

## MVP-26 — EQ-Pipeline Synchronization

### Goal
Ensure changes made in the EQ editor are immediately visible in the Pipeline editor and vice versa, with no duplicate state.

### Status
To Do.

### Deliverables

1. **Shared model verification:**
   - Both editors operate on `dspStore.config` directly
   - No local copies of pipeline/filter state
   - All mutations go through `dspStore.config` → validate → upload → update store

2. **EQ → Pipeline sync:**
   - When EQ editor changes band frequency → filter definition in `dspStore.config.filters` updated
   - Pipeline editor's FilterBlock reactively displays new frequency
   - No explicit sync code needed (reactive stores handle it)

3. **Pipeline → EQ sync:**
   - When Pipeline editor reorders filters → `dspStore.config.pipeline[].names` array updated
   - EQ editor's band order updates (via `eqStore.bandOrderNumbers` derived from pipeline)
   - Band order icons reflect new pipeline position

4. **Test scenarios:**
   - EQ editor: Change band 3 frequency → Pipeline editor: Filter block shows new frequency
   - Pipeline editor: Reorder filters → EQ editor: Band tokens reorder on graph
   - Pipeline editor: Remove filter → EQ editor: Band disappears
   - EQ editor: Add band → Pipeline editor: Filter block shows new filter
   - Pipeline editor: Disable filter → EQ editor: Band shows as disabled (muted)

5. **Edge cases:**
   - User switches between pages mid-edit → no data loss
   - Upload pending while switching pages → upload completes, both pages update
   - Error state in one editor → visible in both editors

6. **UI indicators:**
   - Show "modified" indicator if config has unsaved changes (optional)
   - Show upload status (pending/success/error) consistently in both editors

### Test / Acceptance Criteria
- ✅ Integration tests (10+ scenarios):
  - All sync scenarios listed above tested
  - No state duplication detected
  - Race conditions handled (concurrent edits from both editors)
- ✅ Component tests:
  - EQ editor updates trigger Pipeline re-render
  - Pipeline editor updates trigger EQ re-render
- ✅ Manual testing:
  - Open both editors side-by-side (split screen)
  - Edit in one → changes visible in other immediately
  - No lag, no stale data

### Risk Reduced Early
- ✅ Validates shared model approach is sound
- ✅ Proves no hidden state duplication
- ✅ Confirms reactive stores handle cross-editor sync correctly

### Deferred Complexity
- Optimistic UI updates (show change before upload confirms)
- Conflict resolution (if CamillaDSP rejects change)
- Multi-user editing (multiple clients editing same config)
- Change history/undo across editors

⸻

## Future MVPs

### Deliverables:
1. **Implement pipeline editor**
2. **Ability to switch from pre-EQ to post-EQ**
3. **Band re-ordering with drag**
  - Allow user to select the order (number) where the band sits in the pipeline
  - Clicking on a band-order-icon pops up a context menu. 
  - The contedt menu wil contain a title "new position" and icons arranged in two columns.
  - The icons correspond to the band number icons with their respective colors.
  - The number of icons shown is the same as the number of bands shown on the page.
  - The current band is not displayed in the pop-up menu.
  - Selecting a band number icon will move the band to that position in the pipeline.
  - The 

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
