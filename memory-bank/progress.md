# Project Progress

## Completed Milestones
- [x] **M0: Memory bank initialized** (2026-01-22)
  - Created core context documentation (projectbrief, productContext, systemPatterns, techContext)
  - Established working-state tracking (activeContext, progress, decisions)
  - Documented design constraints and trade-offs
  - Aligned memory bank with authoritative design specification
  - Captured key architectural decisions (ADR-001 through ADR-006)

- [x] **MVP-0: Repo + Dev Environment Baseline** (2026-01-22)
  - Created monorepo structure with server/ and client/ workspaces
  - Initialized root package.json with npm workspaces
  - Set up server: Fastify + Pino logging + TypeScript + tsx watch
  - Set up client: Vite + Svelte + TypeScript
  - Created .env.example with configuration schema
  - Validated `npm run dev` starts both server and client
  - Verified HMR works for client changes
  - Build pipeline functional (`npm run build`)

- [x] **MVP-1: Backend REST Foundation + Hardening Primitives** (2026-01-22)
  - Implemented `GET /health` and `GET /api/version` endpoints
  - Established error response contract with structured JSON and ErrorCode enum
  - Added 404 handler with proper error structure (`setNotFoundHandler`)
  - Set up request logging with correlation IDs (custom hooks, disabled default logging)
  - Created `shellExec` utility with timeout, output limits, and command whitelist
  - Wrote route tests using `fastify.inject()` (3 tests)
  - Wrote `shellExec` unit tests with full coverage (10 tests)
  - Fixed Vite proxy to use IPv4 (`127.0.0.1:3000`) to avoid IPv6 issues
  - All tests passing: 13 server tests, 1 client placeholder test

- [x] **MVP-2: Config Persistence API (File I/O)** (2026-01-22)
  - Created ConfigStore service with atomic write operations (write to .tmp, then rename)
  - Implemented `GET /api/config` endpoint (reads config from disk)
  - Implemented `PUT /api/config` endpoint (saves config with validation)
  - Config-specific error codes (NOT_FOUND, INVALID_JSON, TOO_LARGE, WRITE_FAILED)
  - Size limit enforcement (default 1MB, configurable)
  - Comprehensive test coverage: 21 new tests (17 ConfigStore + 4 route tests)
  - Atomic write behavior verified (no temp file remnants on errors)
  - All tests passing: 34 server tests (33 + 1 client placeholder)

- [x] **MVP-3: Client CamillaDSP Module** (2026-01-23)
  - Created CamillaDSP client module (`client/src/lib/camillaDSP.ts`)
  - Dual WebSocket connections (control + spectrum)
  - Connection management with localStorage persistence
  - Config I/O: `downloadConfig()`, `uploadConfig()` with validation
  - Spectrum data retrieval: `getSpectrumData()`
  - Memory leak fix: Event listeners properly removed after use (per API contract spec)
  - Created mock WebSocket server (`server/src/services/mockCamillaDSP.ts`)
  - Implements control + spectrum protocol per `docs/api-contract-camillaDSP.md`
  - 9 integration tests added (`client/src/lib/__tests__/camillaDSP.integration.test.ts`)
  - Clean test output with console mocking
  - All tests passing: 34 server tests + 10 client tests (1 App + 9 CamillaDSP)

- [x] **MVP-4: EQ Editor Layout (Static) + Band Theming Contract** (2026-01-24)
  - Created `client/src/pages/EqPage.svelte` with complete 4-zone EQ graph layout
  - Zone 1: Octave indicators (C1-C9) aligned to musical C frequencies (32.70 Hz - 8372.02 Hz)
  - Zone 2: Frequency region labels (SUB, BASS, LOW MID, MID, HIGH MID, PRS, TREBLE)
  - Zone 3: Main graph area with SVG grid + gain axis labels (-18, -12, -6, 0, +6, +12, +18)
  - Zone 4: Frequency scale labels (20, 50, 100...10k) with first label pinned, last hidden
  - Implemented log10 frequency mapping (20 Hz - 20 kHz)
  - Decade-based vertical grid lines (majors at 20/50/100/200/500/1k/2k/5k/10k + minors)
  - Band tokens rendered as compensated ellipses (stay circular despite SVG stretch)
  - Alignment fix: All 4 zones use 2-column grid (1fr 44px) to keep octave/region/freq labels aligned with plot
  - Right panel: 5 band columns with filter icons, gain faders, mute buttons, frequency/Q dials
  - Band theming contract: CSS custom properties (`--band-color`, `--band-ink`, `--band-dim`, etc.)
  - Created `client/src/pages/EqPage.test.ts` with 5 source-based structural tests
  - All tests passing: 34 server tests + 15 client tests (1 App + 5 EqPage + 9 CamillaDSP)

- [x] **MVP-5: SVG EQ Curve Rendering (Sum + Per-Band)** (2026-01-24)
  - Created `client/src/dsp/filterResponse.ts` with RBJ Audio EQ Cookbook peaking filter implementation
  - Biquad frequency response calculation with complex magnitude at any frequency
  - `sumResponseDb()` combines all enabled bands (filter bank only, excludes preamp per spec)
  - `generateLogFrequencies()` creates log-spaced sampling arrays
  - Created `client/src/ui/rendering/EqSvgRenderer.ts` for SVG path generation
  - `freqToX()` - Log10 frequency mapping (20 Hz - 20 kHz)
  - `gainToY()` - Linear gain mapping (-24 to +24 dB, inverted for SVG coordinates)
  - `generateCurvePath()` - Samples 256 frequencies, generates SVG path `d` attribute
  - `generateBandCurvePath()` - Individual band curve paths
  - Updated EqPage with Tangzu Waner reference config (10 peaking filters)
  - Reactive curve generation: sum curve (white, 2.25px) + optional per-band curves (band-tinted, 1.25px, 40% opacity)
  - Created `client/src/ui/rendering/EqSvgRenderer.test.ts` with 15 comprehensive tests
  - All tests passing: 34 server tests + 30 client tests (1 App + 5 EqPage + 9 CamillaDSP + 15 EqSvgRenderer)

- [x] **MVP-6: Interactive Tokens + Bidirectional Sync** (2026-01-24)
  - Created `client/src/state/eqStore.ts` with Svelte stores for reactive band parameters
  - State management: writable stores for bands, derived stores for curves/positions/selection
  - Action functions: `setBandFreq()`, `setBandGain()`, `setBandQ()`, `toggleBandEnabled()`, `selectBand()`
  - Automatic curve regeneration on parameter changes
  - Interactive token drag handlers integrated in EqPage:
    - Horizontal drag → adjust frequency (log scale with `xToFreq()`)
    - Vertical drag → adjust gain (linear scale with `yToGain()`)
    - Shift + drag → adjust Q/bandwidth
    - Mouse wheel on token → adjust Q
  - Pointer capture for smooth dragging outside element bounds
  - Functional right panel controls:
    - Gain fader with draggable thumb (only thumb interactive, track is not)
    - Mute button toggles band enabled state
    - KnobDial components for frequency and Q (19px, mode-specific)
    - Filter type icon (clickable, selects band)
  - Bidirectional synchronization proven:
    - Token drag → eqStore → right panel updates
    - Right panel change → eqStore → token moves + curve updates
    - Mute toggle → band excluded from sum curve
    - Band selection syncs across all UI elements
  - Selection UX: Any interaction in band column selects it (capture phase handler)
  - Layout refinements:
    - Viz options area uses 2-column grid (32px gutter matches plot)
    - Band column selection styling (transparent base border, colored when selected)
  - Created `client/src/state/eqStore.test.ts` with 19 comprehensive unit tests
  - All tests passing: 34 server tests + 49 client tests (1 App + 5 EqPage + 9 CamillaDSP + 15 EqSvgRenderer + 19 eqStore)

- [x] **MVP-7: Canvas Spectrum Renderer + Mode Toggles** (2026-01-24)
  - Created pluggable layer architecture (`CanvasVisualizationLayer` interface)
  - Implemented filled spectrum curve with visible outline (replaces bars)
  - Added Catmull-Rom spline + moving-average smoothing with toggle
  - DPR-aware canvas sizing for retina displays
  - Stale frame detection with visual feedback
  - All tests passing (68 client tests)

- [x] **MVP-8: Real CamillaDSP Integration + Upload Policy** (2026-01-24)
  - Extended DSP math for 7 filter types using RBJ Audio EQ Cookbook formulas:
    - `HighPass`, `LowPass`: uses freq + q (no gain)
    - `BandPass`: uses freq + q (peaks around center)
    - `AllPass`: uses freq + q (flat magnitude response)
    - `HighShelf`, `LowShelf`: uses freq + q + gain
    - `Peaking`: already implemented (uses freq + q + gain)
  - Created bidirectional mapping layer (`client/src/lib/camillaEqMapping.ts`):
    - `extractEqBandsFromConfig()`: CamillaDSP → EqBands (uses channel 0 as reference)
    - `applyEqBandsToConfig()`: EqBands → CamillaDSP (applies to ALL channels)
    - Only supports Biquad filters with 7 supported subtypes
  - Integrated eqStore with CamillaDSP:
    - `initializeFromCamilla()`: loads bands from config on connect
    - `disconnectFromCamilla()`: cleanup on disconnect
    - Upload-on-commit with 200ms debounce via `debounceCancelable()`
    - Every parameter change (freq/gain/q/enabled) triggers debounced upload
  - Connection/upload status visualization:
    - Nav icon colors: green (connected/success), blue (connecting/pending), red (error)
    - Upload status tracked in eqStore with automatic 2s success timeout
  - Created debounce utility (`client/src/lib/debounce.ts`)
  - All tests passing: 102 total (68 client + 34 server)
  - **Pluggable layer architecture for extendable visualizations:**
    - Created `client/src/ui/rendering/canvasLayers/CanvasVisualizationLayer.ts` interface
    - Created `client/src/ui/rendering/canvasLayers/SpectrumAreaLayer.ts` for filled curve rendering
    - Refactored `SpectrumCanvasRenderer` to orchestrate multiple layers
  - **Filled spectrum curve with visible outline** (replaces vertical bars):
    - Area fill with lower opacity (~15%)
    - Outline stroke with higher opacity (~50-55%) for better visibility
    - Distinct colors for Pre-EQ (blue) and Post-EQ (green) modes
  - **Smoothing system:**
    - Catmull-Rom spline interpolation for geometric smoothing
    - Moving-average data filter to reduce bin-to-bin noise
    - `smoothingStrength` parameter (default: 5, range: 1-20, not yet wired to GUI)
    - UI toggle: "Smooth spectrum" checkbox in viz options
  - **Canvas rendering engine:**
    - High-frequency rendering (~10Hz, 100ms poll interval) with zero DOM churn
    - DPR-aware canvas sizing for retina displays (proper backing store scaling)
    - Fixed resize scaling accumulation bug (`ctx.setTransform()` reset)
    - Fixed smooth fill path closure (proper bottom-left anchor)
  - **Spectrum data processing:**
    - Created `client/src/dsp/spectrumParser.ts` for spectrum data normalization
    - Handles multiple formats: 256+ bins (real), 2 values (legacy per-channel peaks → fake spectrum)
    - Utility functions: `dbToLinear()`, `decimateBins()` for decimation
  - **Integration and testing:**
    - Updated `server/src/services/mockCamillaDSP.ts` to generate realistic 256-bin spectrum
    - Multi-band curve with time-based "breathing" animation
    - Fixed port/localStorage mismatch (`controlPort` vs `port` backward compatibility)
    - Integrated Canvas layer into EqPage with automatic CamillaDSP connection
    - Mode buttons: Off / Pre-EQ / Post-EQ
    - Stale frame detection with visual feedback (>500ms → fade to 30% opacity)
    - Proper cleanup on component destruction
  - **Test coverage:**
    - Created `client/src/dsp/__tests__/spectrumParser.test.ts` with 19 unit tests
    - Updated `client/src/lib/__tests__/camillaDSP.integration.test.ts` for 256-bin spectrum
    - All tests passing: 34 server tests + 68 client tests
  - **Documentation:**
    - Updated README.md with filled curve visualization description and smoothing toggle
    - Updated design-spec.md with pluggable layer architecture and smoothing requirements

- [x] **MVP-9: Config Library + Persistence Roundtrip** (2026-01-25)
  - Created server-side config library service (`server/src/services/configsLibrary.ts`)
  - Implemented API endpoints: `GET /api/configs`, `GET /api/configs/:id`, `PUT /api/configs/:id`
  - Created pipeline-config mapping layer (`client/src/lib/pipelineConfigMapping.ts`)
  - Built compact, searchable Presets UI (`client/src/pages/PresetsPage.svelte`)
  - Search functionality: case-insensitive substring matching, result counter, highlighted matches
  - Keyboard navigation: `/` to focus, arrow keys to navigate, Enter to load
  - Full roundtrip flow: Backend → Browser → CamillaDSP (load), CamillaDSP → Browser → Backend (save)
  - Fixed pipeline generation to match extraction expectations (single Filter step per channel)
  - Added global state sync after preset load (`updateConfig()` + `initializeFromConfig()`)
  - All 130 tests passing (76 client + 54 server)

- [x] **Post-MVP-9: Latest State Persistence** (2026-01-25)
  - Added `GET /api/state/latest` and `PUT /api/state/latest` endpoints
  - Storage: `server/data/latest_dsp_state.json` (full CamillaDSP config JSON)
  - Write-through on every successful EQ upload to CamillaDSP
  - Startup restore: if CamillaDSP returns empty config → fetch `/api/state/latest` and upload
  - Removed preset auto-restore behavior (presets load only on explicit user action)
  - Result: Page reload now shows most recent edited state
  - All 130 tests passing

- [x] **MVP-10: Tooltip & Labels on Band Editor** (2026-01-25)
  - Created FaderTooltip component (`client/src/components/FaderTooltip.svelte`)
  - Implemented fader value tooltip with band-themed SVG callout shape
  - Tooltip appears on fader pointerdown, fades out over 1.5s after pointerup
  - Displays formatted gain value (±X.X dB)
  - **Collision-aware positioning:** Flips from left to right side if would clip off-screen
  - Uses `strokeColor` prop with computed band color (color-mix formula)
  - Single global tooltip instance with position: fixed (escapes scroll container)
  - Horizontal mirroring via scaleX(-1) when flipped to right
  - All tests passing (76 client + 54 server)

- [x] **MVP-11: EQ Page Layout Refinement** (2026-01-25)
  - Implemented 3-row grid layout across main panel and band columns
  - Row 1 (auto height): Top controls/labels (octaves, regions, filter icons)
  - Row 2 (flex: 1): Main interactive area (EQ plot + fader tracks stretch together)
  - Row 3 (auto height): Bottom controls (freq scale, viz options, knobs, mute buttons)
  - Achieved precise vertical alignment: EQ plot top/bottom aligns with fader track top/bottom
  - Shared row sizing: Each row height = max(main panel, band columns)
  - All existing functionality preserved (dragging, curves, synchronization)
  - No visual gaps or misalignments
  - CSS precision requirements met (no double borders, clean corners)

- [x] **MVP-12: Informative EQ Plot Tokens** (2026-01-26)
  - Created dedicated EqTokensLayer component with full token enhancements
  - Token center index number (1, 2, 3...) showing filter pipeline position
  - Selection halo effect (1.8× radius, band-colored with blur)
  - Q/BW arc indicator around token perimeter (30°-270° sweep range)
  - Arc path split into 2 segments for sweeps >180° (prevents jitter/deformation)
  - Frequency label below token ("1.2k Hz" format) in band accent color
  - Q label below frequency ("Q 2.5" format) in muted band color
  - Boundary-aware label placement with smoothstep interpolation
  - Labels transition from "below" to "side orbit" when near bottom boundary
  - Shift-mode cursor feedback (ns-resize) for Q adjustment mode
  - Token circularity maintained via compensated ellipse with inverse-scale transform
  - Created tokenUtils module with formatting and geometry helpers
  - All 112 client tests passing (25 tokenUtils tests, 8 EqPage tests)

- [x] **MVP-13: Filter Type Selection** (2026-01-26)
  - Created FilterTypePicker component with side popover placement
  - 7 filter types supported: Peaking, LowShelf, HighShelf, HighPass, LowPass, BandPass, Notch
  - 4×2 grid layout with filter icon + label + subtitle per type
  - Side placement (left/right of 38px band column with 6px gap)
  - Speech-bubble tail (CSS double-triangle) points to filter icon
  - Keyboard navigation: arrow keys, Enter/Space to select, Escape to close
  - Parameter preservation: frequency always preserved, gain/Q preserved when applicable
  - Current type highlighted in popover, keyboard selection separate highlight
  - Extended eqStore with `setBandType()` action
  - Type changes trigger immediate curve regeneration
  - Upload debounce applies to type changes (200ms)
  - Lighter border color for better visual separation
  - Collision-aware positioning with viewport clamping
  - All 113 client tests passing

- [x] **MVP-14: Informative EQ Plot Token Highlighting** (2026-01-27)
  - **Focus mode visualization:**
    - Deselection: Click plot background clears selection
    - Token dimming: Unselected tokens at 30% opacity with labels hidden
    - Curve display: Sum curve (thin, low contrast) + selected band curve (thick, bright)
    - Spectrum ducking: 70% on selection, 40% while actively editing
    - Active editing tracking with 250ms timeout
  - **Area-of-effect rendering** (`client/src/ui/rendering/eqFocusViz.ts`):
    - Peaking: Filled area under curve to baseline
    - Shelf: Half-plane tint (left for LowShelf, right for HighShelf)
    - HP/LP: Localized tint around cutoff
    - BandPass: Full-height window with true -3 dB boundaries + octave fallback
    - Notch: Localized halo (wider stroke behind curve)
  - **Bandwidth markers** (`client/src/dsp/bandwidthMarkers.ts`):
    - -3 dB half-power points for Peaking/Notch
    - Rendered as ticks on frequency axis
    - Toggle control (default: ON)
  - **Band fill opacity control:**
    - Knob dial (0-100%, default 40%)
    - Arc styled with sum-curve color for visibility
    - Controls all area-of-effect visualizations
  - All 137 tests passing (15 eqFocusViz tests, 9 bandwidthMarkers tests)

## Current Status
**Phase:** MVP-14 Completed - Focus Mode with Area-of-Effect Visualization

## Planned Milestones

> **Implementation plan:** See `docs/implementation-plan.md` for detailed deliverables, acceptance criteria, and risk mitigation strategy.

## MVP-15 - Implement pipeline editor
## MVP-16 - Update to latest CamillaDSP
## MVP-17 - Review and refine state management


## Known Issues
None at this stage.

## Backlog
Items deferred to future iterations:
- Multi-channel pipeline editor (specified but lower priority than EQ editor)
- Advanced filter types beyond core set
- Client-side log forwarding to backend
- Accessibility audit and improvements
- Mobile/touch optimization
- Performance profiling tools

## Notes
All work must align with the core constraints from design specification:
- LAN-only, no cloud dependencies
- Optimized for low-power devices (Pi Zero-class hardware)
- Deterministic, predictable behavior
- Visual refinement handled browser-side (Canvas/SVG)
- Backend is file store, NOT source of truth (CamillaDSP service is authoritative)
- Browser connects directly to CamillaDSP WebSocket service (no proxying)
