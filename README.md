# CamillaEQ

A graphical user interface for CamillaDSP equalizer control.

## Project Structure

```
/server          - Node.js + Fastify backend REST API
/client          - Svelte + Vite frontend application
/docs            - Design specifications and API contracts
/memory-bank     - Project context and decisions
```

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file and customize as needed:

```bash
cp .env.example .env
```

Default configuration:
- Server runs on port 3000
- Client dev server runs on port 5173
- CamillaDSP WebSocket URLs: ws://localhost:1234 (control), ws://localhost:1235 (spectrum)

### 3. Development

Start both server and client in watch mode:

```bash
npm run dev
```

Or run them separately:

```bash
npm run dev:server  # Start backend only
npm run dev:client  # Start frontend only
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Health check: http://localhost:3000/health

### 4. Build

Build both server and client for production:

```bash
npm run build
```

### 5. Testing

Run all tests:

```bash
npm test
```

## Spectrum Analyzer (MVP-16)

To see the real-time spectrum analyzer overlay without a real CamillaDSP device, use the included **MockCamillaDSP** WebSocket server:

### 1. Start the Mock CamillaDSP Server

In a separate terminal, run:

```bash
npm -w server exec -- tsx -e "import { MockCamillaDSP } from './src/services/mockCamillaDSP'; (async () => { const s = new MockCamillaDSP(); await s.start(); console.log('Mock CamillaDSP running: control=3146 spectrum=6413'); setInterval(() => {}, 1<<30); })().catch(e => { console.error(e); process.exit(1); });"
```

This starts:
- **Control WebSocket**: `ws://localhost:3146`
- **Spectrum WebSocket**: `ws://localhost:6413`

### 2. Start the Development Server

In another terminal:

```bash
npm run dev
```

### 3. Configure Connection

1. Open `http://localhost:5173/#/connect`
2. Set connection parameters:
   - **Server**: `localhost`
   - **Control Port**: `3146`
   - **Spectrum Port**: `6413`
3. (Optional) Enable **Auto-reconnect on page load** checkbox
4. Click **Connect**

### 4. Enable Spectrum Analyzer Overlay

On the EQ page, under **Visualization Options**:

1. **Select spectrum source:**
   - Click **Pre** (blue) or **Post** (green) to choose the spectrum source
   - Note: Buttons dim when overlay is disabled (no analyzer series enabled)

2. **Enable analyzer series** (toggle any to activate overlay):
   - **STA** (Short-Term Average) - Default: ON, shows stable trend
   - **LTA** (Long-Term Average) - Default: OFF, shows long-term balance
   - **PEAK** (Peak Hold) - Default: OFF, shows peak levels with decay

3. **Optional: Adjust smoothing:**
   - Choose **Smoothing**: Off / 1/12 Oct / 1/6 Oct (default) / 1/3 Oct
   - Fractional-octave smoothing reduces comb-like artifacts

4. **Reset averages:** Click **↺** to reset STA/LTA/Peak to current live values

You should see analyzer series rendering behind the EQ curve at ~10Hz.

**New in MVP-16:**
- **Temporal averaging:** STA (0.8s) and LTA (8s) exponential moving averages in dB domain
- **Peak hold:** Tracks maximum per-bin with configurable hold time (2s) and decay rate (12 dB/s)
- **Fractional-octave smoothing:** 1/12, 1/6 (default), 1/3 octave options
- **Coherent overlay state:** Overlay enabled when any of STA/LTA/PEAK is on; Pre/Post selects source
- **Canvas polling:** Automatically starts/stops based on overlay enabled state

## Auto-Reconnect Feature

The application supports automatic reconnection when you reload the page or navigate back to the app.

### How It Works

When **Auto-reconnect on page load** is enabled on the Connection page:

1. **Startup**: On app load, it automatically attempts to connect using the last saved connection parameters
2. **Retry Logic**: If the connection fails, it retries with exponential backoff:
   - Retry 1: after 1 second
   - Retry 2: after 2 seconds
   - Retry 3: after 5 seconds
   - Retry 4: after 10 seconds
   - Retry 5+: after 30 seconds
   - Maximum: 10 attempts total
3. **Visual Feedback**: The connection icon in the navigation rail changes color based on state:
   - **Green glow**: Connected (both control + spectrum sockets)
   - **Yellow/Amber glow**: Degraded (control socket OK, spectrum socket down)
   - **Blue glow**: Connecting/Reconnecting
   - **Red glow**: Connection error (control socket down)
   - **Default**: Disconnected

### Enable/Disable

Toggle the **Auto-reconnect on page load** checkbox on the Connection page. The setting is saved to localStorage and persists across sessions.

### Manual Disconnect

Clicking **Disconnect** will:
- Close the current connection
- Cancel any pending retry attempts
- The app will not attempt to reconnect until you manually click **Connect** again or reload the page (if auto-reconnect is enabled)

## Degraded Connection

The app tracks the health of **two separate WebSocket connections** to CamillaDSP:
1. **Control socket** - Used for EQ config uploads, state queries, volume control
2. **Spectrum socket** - Used for real-time spectrum data (~10Hz polling)

### What is Degraded State?

When the **control socket is connected but the spectrum socket is down**, the app enters "degraded" mode:

**What still works:**
- ✅ EQ editing (drag tokens, adjust faders, change filter types)
- ✅ Config uploads to CamillaDSP
- ✅ Preset load/save
- ✅ Volume control

**What's unavailable:**
- ❌ Spectrum analyzer overlay (canvas clears)
- ❌ Real-time spectrum data display

**Visual indicators:**
- Nav icon shows **yellow/amber glow** (instead of green)
- Connection page shows which socket is down
- Spectrum canvas clears or shows "unavailable" message

**Recovery:**
- Control socket failure → App attempts full reconnect (both sockets)
- Spectrum-only failure → App stays in degraded mode (EQ editing continues)
- Manual reconnect: Click "Disconnect" then "Connect" to retry both sockets

## Copy Diagnostics

The Connection page includes a **"Copy Diagnostics"** button that exports comprehensive troubleshooting data to your clipboard.

### What's Included

The diagnostics JSON export contains:
- **Connection state**: Current state (connected/degraded/error/disconnected)
- **Server info**: Server address, control port, spectrum port
- **CamillaDSP version**: If connected
- **Failure log**: Last 50 failures with timestamps
  - Command that failed
  - Request/response details
  - Socket identifier (control/spectrum)
- **Config summary**: Filter count, mixer count, pipeline step count

### When to Use

Use "Copy Diagnostics" when:
- Reporting connection issues
- Troubleshooting WebSocket failures
- Verifying which commands are failing
- Sharing debug info with developers

The JSON can be pasted into bug reports or analyzed to understand connection behavior patterns.

## API Endpoints

### Health Check
- **GET** `/health` - Returns server health status

### Version Info
- **GET** `/api/version` - Returns version, build hash, and build time

### Config Persistence
- **GET** `/api/config` - Reads the current config file from disk
  - Returns: Config JSON object
  - Error: 404 if config file not found
- **PUT** `/api/config` - Saves config to disk with atomic write
  - Body: Config JSON object (max 1MB)
  - Returns: `{ success: true }`
  - Errors: 400 (invalid), 413 (too large), 500 (write failed)

## Development Workflow

1. The client proxies API requests to the backend during development
2. Hot Module Replacement (HMR) is enabled for instant client updates
3. Server auto-restarts on code changes via tsx watch mode

### Client Logging

The client uses a lightweight logging utility (`client/src/lib/log.ts`) with debug message gating:

```typescript
import { log } from './lib/log';

log.debug('Only visible in dev mode or when debug=true in localStorage');
log.info('Important info message');
log.warn('Warning message');
log.error('Error message', errorObject);
```

**Debug modes:**
- **Development**: All debug messages visible automatically
- **Production**: Debug messages hidden by default
- **Production with debug**: Set `localStorage.setItem('debug', 'true')` to enable debug logs

All log messages include timestamp and level prefix for easy filtering.

## Pipeline Editor (MVP-19/20)

The **Pipeline page** (`/#/pipeline`) provides a read-only view of the CamillaDSP signal processing pipeline, showing each processing step in the order audio flows through them.

### What You See

- **Filter blocks**: Display which channels they apply to and list all filters in that block
- **Mixer blocks**: Show input/output channel counts and mixer name
- **Processor blocks**: Display processor type and name
- **Signal flow**: Top → Bottom (Input → blocks → Output)

Each block shows:
- Missing references (filters/mixers not found in config)
- Bypass state indicators

### Reordering Filters Inside a Filter Block (MVP-20)

You can **reorder filters within the same Filter block** using drag-and-drop:

1. **Grab the handle** (☰) on the left side of any filter row
2. **Drag up or down** - a **"Drop here" landing zone** appears showing where the filter will be inserted
3. **Drop** to commit the reorder:
   - Config is validated automatically
   - Invalid reorders revert with an inline error banner
   - Valid reorders upload to CamillaDSP with the existing 200ms debounce
4. Changes appear immediately in the EQ page (band order icons update)

**Note:** Moving filters **between different Filter blocks** is not yet supported. Moving entire pipeline blocks is also deferred to a future milestone.

---

## Project Status

**Current Milestone:** MVP-20 Complete ✓ — Pipeline filter reordering

**New in MVP-20:**
- **Drag-and-drop filter reordering** inside Filter blocks on Pipeline page
- **Landing zone visualization** shows insertion point during drag
- **Direction-aware index adjustment** ensures correct drop behavior when dragging up/down
- **Validation + snapshot/revert** prevents invalid pipeline states
- **Stable identity keying** ensures smooth DOM updates during reorder

**New in MVP-17:**
- **CamillaDSP version display** in status card when connected
- **Audio devices section:** Capture/playback device lists with "In Use" badges
- **Current configuration section:** YAML configs for control + spectrum with title/description
- **DSP failures section:** Timestamped error log with request/response context (auto-clears on success)

### Completed Milestones

#### MVP-0: Repo + Dev Environment ✓
Monorepo structure, Fastify backend, Svelte frontend, dev workflow, build pipeline

#### MVP-1: Backend REST Foundation + Hardening ✓
Structured error responses, request logging with correlation IDs, `shellExec` utility, comprehensive test coverage

#### MVP-2: Config Persistence API ✓
ConfigStore service with atomic writes, GET/PUT endpoints, config validation, error handling

#### MVP-3: Client CamillaDSP Module ✓
WebSocket client for CamillaDSP control + spectrum, mock server for testing, 9 integration tests

#### MVP-4: EQ Editor Layout (Static) + Band Theming ✓
4-zone EQ graph layout (octaves, regions, plot, frequency scale), log10 frequency mapping, decade-based grid, band tokens with compensated ellipses, right panel with band columns, band theming contract with CSS custom properties

#### MVP-5: SVG EQ Curve Rendering (Sum + Per-Band) ✓
RBJ biquad filter response calculation, `EqSvgRenderer` module, reactive curve generation (256 sample points), sum curve + optional per-band curves, Tangzu Waner reference config (10 bands)

#### MVP-6: Interactive Tokens + Bidirectional Sync ✓
**Fully functional EQ editor with:**
- State management via Svelte stores (`eqStore.ts`)
- Interactive drag on tokens (freq/gain/Q adjustment)
- Functional right panel controls (fader, mute, frequency/Q dials)
- Bidirectional synchronization (token ↔ controls ↔ curves)
- Band selection sync across all UI elements
- Layout refinements (viz options alignment, selection styling)
- 49 client tests passing (5 test suites)

#### MVP-7: Canvas Spectrum Renderer + Mode Toggles ✓
**Real-time spectrum visualization with:**
- **Pluggable layer architecture** for extendable background visualizations
  - `CanvasVisualizationLayer` interface for modular rendering
  - `SpectrumAreaLayer` renders filled curve with visible outline
- **Canvas-based rendering** (~10Hz) with zero DOM churn and DPR-aware sizing
- **Filled spectrum curve** (area fill + brighter outline) replaces vertical bars
- **Smoothing system:**
  - Catmull-Rom spline interpolation for geometric smoothing
  - Moving-average data filter (default window size: 5, configurable 1-20)
  - Toggle: "Smooth spectrum" checkbox in viz options
  - Internal `smoothingStrength` parameter (not yet wired to GUI, ready for future control)
- Spectrum data parser supporting multiple formats (256+ bins, legacy 2-channel)
- Integration into EqPage with automatic CamillaDSP connection
- Mode toggles: Off / Pre-EQ / Post-EQ with distinct colors
- Stale frame detection (>500ms → fade indicator)
- MockCamillaDSP updated to generate realistic 256-bin spectrum data
- **Bug fixes:**
  - Fixed resize scaling accumulation (`ctx.setTransform()` reset)
  - Fixed smooth fill path closure (proper bottom-left anchor)
- Full test coverage (19 spectrumParser tests, updated integration tests)
- All 68 client tests passing

#### MVP-8: Real CamillaDSP Integration + Upload Policy ✓
**Full CamillaDSP protocol integration with:**
- **Extended DSP math** for 7 filter types using RBJ Audio EQ Cookbook formulas:
  - Peaking, HighShelf, LowShelf (freq + q + gain)
  - HighPass, LowPass, BandPass, AllPass (freq + q)
- **Bidirectional CamillaDSP ⇄ EqBand mapping layer** (`camillaEqMapping.ts`):
  - Extract EQ bands from CamillaDSP config (uses channel 0 as reference)
  - Apply EQ bands to ALL channels in config
  - Only Biquad filters with 7 supported subtypes
- **Upload-on-commit with debounce** (200ms default via `debounceCancelable()`):
  - Every parameter change (freq/gain/q/enabled) triggers debounced upload
  - `SetConfigJson` followed by `Reload` per CamillaDSP spec
  - Upload status tracked (idle/pending/success/error)
- **Global DSP state management** (`dspStore.ts`):
  - Singleton CamillaDSP instance shared across all pages
  - Connection state management with auto-reconnect
  - Config synchronization (CamillaDSP → eqStore on connect)
- **Master volume control**:
  - Master fader controls CamillaDSP volume via `SetVolume`
  - Range: -150 to +50 dB (per CamillaDSP spec)
  - Debounced live updates during drag (200ms)
  - `GetVolume` on connect to sync initial state
- **Visual feedback**:
  - Nav icon colors: green (connected/success), blue (connecting/pending), red (error)
  - Upload status with automatic 2s success timeout
- All 76 client tests passing (6 test suites)

### Current Capabilities

The application now provides a **fully interactive equalizer editor** with:
- Real-time EQ curve visualization (sum + per-band)
- **Real-time spectrum overlay** (Canvas, ~10Hz):
  - Filled area curve with visible outline
  - Pre-EQ / Post-EQ / Off modes with distinct colors
  - Optional smoothing (spline + data filter)
  - Extendable layer system for future visualizations
- Drag tokens to adjust frequency and gain
- Shift+drag or mouse wheel to adjust Q/bandwidth
- Right panel controls (faders, mute buttons, parameter dials)
- Live curve updates as parameters change
- Band selection and visual feedback
- Log-scale frequency axis (20 Hz - 20 kHz)
- Linear gain axis (±24 dB)

#### MVP-9: Config Library + Persistence Roundtrip ✓
**Preset management with compact, searchable UI:**
- **Server-side config library** (`server/src/services/configsLibrary.ts`):
  - Lists configs from `server/data/configs/` directory
  - Loads/saves pipeline-config JSON format
  - Atomic writes, validation, error handling
- **New API endpoints:**
  - `GET /api/configs` - List all saved configurations with metadata
  - `GET /api/configs/:id` - Get specific configuration
  - `PUT /api/configs/:id` - Save configuration
- **Pipeline-config mapping layer** (`client/src/lib/pipelineConfigMapping.ts`):
  - `pipelineConfigToCamillaDSP()` - Converts simplified format → full CamillaDSP config
  - `camillaDSPToPipelineConfig()` - Extracts filters/preamp from CamillaDSP config
  - Full config replacement (pipeline + filters + devices)
- **Presets page UI** (`client/src/pages/PresetsPage.svelte`):
  - Compact list layout (2-3× more presets visible than card grid)
  - **Search functionality:**
    - Case-insensitive substring matching
    - Real-time filtering with result counter
    - Highlighted matched substrings in yellow
  - **Keyboard navigation:**
    - Press `/` anywhere to focus search (Vim-style)
    - Arrow Up/Down to navigate results
    - Enter to load highlighted preset
    - Hover also highlights rows
  - **Load/Save operations:**
    - Load: Fetches config → converts to CamillaDSP → uploads → syncs EQ UI
    - Save: Downloads from CamillaDSP → converts → saves to server
  - Error handling and loading states
- **Full roundtrip flow:**
  - Config storage: `server/data/configs/` (tracked in git)
  - Format: pipeline-config JSON (configName, filterArray with filters/preamp/volume)
  - All 130 tests passing (76 client + 54 server)

#### MVP-10: Tooltip & Labels on Band Editor ✓
**Visual enhancements for precision and feedback:**
- **Fader value tooltip**: SVG-based, band-themed, collision-aware positioning
  - Appears on fader `pointerdown`, fades out over 1.5s
  - Displays formatted gain value (±X.X dB)
  - Flips to right side when would clip off-screen
  - Single global tooltip instance (avoids DOM churn)

#### MVP-11: EQ Page Layout Refinement ✓
**Vertically aligned plot + fader tracks for visual continuity:**
- **3-row grid layout** across main panel and band columns:
  - Row 1 (auto height): Top controls/labels (octaves, regions, filter icons)
  - Row 2 (flex: 1): Main interactive area (EQ plot + fader tracks stretch together)
  - Row 3 (auto height): Bottom controls (freq scale, viz options, knobs, mute buttons)
- **Precise vertical alignment**: EQ plot top/bottom aligns with fader track top/bottom
- **Shared row sizing**: Each row height = max(main panel, band columns)
- All existing functionality preserved (dragging, curves, synchronization)
- No visual gaps or misalignments

#### MVP-12: Informative EQ Plot Tokens ✓
**Enhanced token visuals with comprehensive feedback:**
- **Token center index number**: Shows filter's position in pipeline (1, 2, 3...)
- **Selection halo**: Outer glow ring (1.8× radius) when token selected
- **Q/BW arc indicator**: Visual arc around token perimeter
  - Sweep range: 30° (Q=0.1) to 270° (Q=10), centered at top
  - Arc split into 2 segments for sweeps >180° (prevents jitter)
- **Frequency label**: Smart formatting ("1.2k Hz" or "150 Hz") in band accent color
- **Q label**: "Q 2.5" format (1 decimal place) in muted band color
- **Boundary-aware label placement**: Labels smoothly transition from "below" to "side orbit" when token approaches bottom
  - Uses smoothstep interpolation for smooth movement
  - Chooses left/right side based on token X position
- **Shift-mode cursor feedback**: Cursor changes to `ns-resize` when Shift held (Q adjustment mode)
- **Token circularity maintained**: Compensated ellipse approach ensures tokens remain circular when plot stretches
- All 112 client tests passing (including 25 tokenUtils tests, 8 EqPage tests)

#### MVP-13: Filter Type Selection ✓
**Interactive filter type picker with polished popover UI:**
- **Filter type picker component** (`client/src/components/FilterTypePicker.svelte`):
  - 7 filter types supported: Peaking, LowShelf, HighShelf, HighPass, LowPass, BandPass, Notch
  - 4×2 grid layout with filter icon + label + subtitle per type
  - Subtitles indicate parameter availability ("Gain + Q" vs "Q only")
- **Side popover placement**:
  - Positioned left or right of 38px band column with 6px gap
  - Prefers right side, falls back to left if insufficient room
  - Vertical centering on filter icon with viewport clamping
  - Speech-bubble tail (CSS double-triangle) points to filter icon
  - Lighter border color for better visual separation
- **Keyboard navigation**:
  - Arrow keys (up/down/left/right) navigate grid
  - Enter/Space selects highlighted type
  - Escape closes popover
- **Parameter preservation**:
  - Frequency always preserved across type changes
  - Gain preserved when switching between gain-supporting types
  - Q preserved across all types
- **Visual feedback**:
  - Current type highlighted in popover
  - Keyboard-selected type highlighted differently
  - Band icon updates to reflect new type
  - Curve updates immediately on type change
- **Integration**:
  - `eqStore.ts` extended with `setBandType()` action
  - Type changes trigger curve regeneration
  - Upload debounce applies to type changes (200ms)
- All 113 client tests passing

#### MVP-14: Informative EQ Plot Token Highlighting ✓
**Focus mode with visual emphasis and area-of-effect visualization:**
- Focus mode: Selected token bright + labels visible; others dimmed to 30% with labels hidden
- Curves: Sum curve thin/low contrast + selected band curve thick/bright
- Spectrum ducking: Partial duck (70%) on selection, stronger duck (40%) while actively editing
- Area-of-effect per filter type:
  - Peaking: Filled area under curve to baseline (0 dB)
  - Shelf: Half-plane tint (left for LowShelf, right for HighShelf)
  - HP/LP: Localized tint around cutoff frequency
  - BandPass: Full-height window tint with true -3 dB boundaries
  - Notch: Localized halo (wider stroke behind curve)
- Bandwidth markers: -3 dB half-power points for Peaking/Notch (toggle, default ON)
- Band fill opacity control: Knob dial (0-100%, default 40%) with sum-curve colored arc
- Deselection: Click plot background clears selection
- All 137 tests passing

#### MVP-19: Pipeline Viewer (Read-Only Display) ✓
**Pipeline page showing CamillaDSP signal flow:**
- **Pipeline view model** (`client/src/lib/pipelineViewModel.ts`):
  - Converts CamillaDSP config → render-friendly block view models
  - Supports Filter, Mixer, and Processor pipeline steps
  - Detects missing references (orphaned filter/mixer names)
- **Block components** (`client/src/components/pipeline/*`):
  - FilterBlock: channel badges, filter list with type icons, missing reference indicators
  - MixerBlock: mixer name + in/out channel summary
  - ProcessorBlock: generic processor/unknown step display
- **Pipeline page** (`client/src/pages/PipelinePage.svelte`):
  - Vertical stack with explicit `[ Input ] → blocks → [ Output ]` signal flow
  - Robust empty states (not connected / loading / no pipeline)
  - Pure read-only rendering of shared `dspStore.config`

#### MVP-20: Pipeline Block & Element Reordering ✓
**Drag-and-drop filter reordering within Filter blocks:**
- **Filter row reordering** (`client/src/components/pipeline/FilterBlock.svelte`):
  - Per-row grab handles (☰, 24px) with pointer-based DnD (6px movement threshold)
  - Landing zone system: "Drop here" indicator rendered before target row
  - Direction-aware index adjustment (drag down: toIndex -= 1 to account for array shift)
  - Placeholder behavior: dragged row at 50% opacity, no-flicker design (gaps removed during drag)
  - Stable identity keying by filter.name
- **PipelinePage integration**:
  - Identity-based lookup via `getStepByBlockId()` (WeakMap-based blockId tracking)
  - Validation + snapshot/revert: deep snapshot before reorder, reverts on validation failure
  - Debounced upload (200ms) on successful reorder
- **Supporting infrastructure**:
  - `client/src/lib/pipelineUiIds.ts`: Stable UI-only blockId generation
  - `client/src/lib/pipelineReorder.ts`: Pure array reordering utilities
  - `client/src/state/pipelineEditor.ts`: Upload status tracking
- All 240 tests passing

### Next Milestone

**MVP-18:** Review and refine state management

## Documentation

- [Design Specification](docs/design-spec.md) - Complete implementation specification
- [Implementation Plan](docs/implementation-plan.md) - Sequential MVP milestones
- [API Contract](docs/api-contract-camillaDSP.md) - CamillaDSP WebSocket protocol

## License

See LICENSE file for details.
