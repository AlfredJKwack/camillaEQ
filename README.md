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

## Visualizing MVP-7 (Spectrum Analyzer)

To see the real-time spectrum overlay without a real CamillaDSP device, use the included **MockCamillaDSP** WebSocket server:

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

### 4. Enable Spectrum Overlay

On the EQ page, under **Spectrum** options, click:
- **Pre-EQ** (blue filled curve) or
- **Post-EQ** (green filled curve)

You should see an animated spectrum curve with area fill rendering behind the EQ curve at ~10Hz.

**Optional:** Enable the **Smooth spectrum** checkbox for visually smoother curves (applies data smoothing + Catmull-Rom spline interpolation).

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
   - **Green glow**: Connected
   - **Blue glow**: Connecting/Reconnecting
   - **Red glow**: Connection error
   - **Default**: Disconnected

### Enable/Disable

Toggle the **Auto-reconnect on page load** checkbox on the Connection page. The setting is saved to localStorage and persists across sessions.

### Manual Disconnect

Clicking **Disconnect** will:
- Close the current connection
- Cancel any pending retry attempts
- The app will not attempt to reconnect until you manually click **Connect** again or reload the page (if auto-reconnect is enabled)

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

## Project Status

**Current Milestone:** MVP-12 Complete ✓ — Informative EQ plot tokens with labels, arcs, and visual feedback

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

### Next Milestone

**MVP-13:** Usability improvements (double-click reset, filter type selection)

## Documentation

- [Design Specification](docs/design-spec.md) - Complete implementation specification
- [Implementation Plan](docs/implementation-plan.md) - Sequential MVP milestones
- [API Contract](docs/api-contract-camillaDSP.md) - CamillaDSP WebSocket protocol

## License

See LICENSE file for details.
