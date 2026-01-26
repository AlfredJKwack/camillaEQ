# Interactive camillaDSP Graphical user interface

Project: LAN-hosted Interactive camillaDSP UI + Lightweight Device Backend
Target platform: Low-power Linux SBC (e.g., Raspberry Pi Zero / OrangePi Zero 2W)
Primary use: Tablet/desktop browser connecting over LAN
Real-time: Spectrum frames ~ every 100ms (10 Hz) via WebSocket to browser

---

## Current Implementation Status (as of 2026-01-26)

**Milestone:** MVP-13 Complete ✅

This specification describes both **implemented** and **planned** features. For the current as-built architecture, see [`docs/current-architecture.md`](current-architecture.md).

**Key Implementation Notes:**
- ✅ Backend REST API implemented (health, version, config, state, preset library)
- ✅ Direct browser-to-CamillaDSP WebSocket topology working
- ✅ Spectrum rendering via polling (10Hz) with Canvas + pluggable layers
- ✅ Interactive EQ editor with 3-row grid layout (MVP-11)
- ✅ Token visual enhancements (labels, arcs, halos) (MVP-12)
- ✅ Filter type selection UI with popover + speech-bubble tail (MVP-13)
- ✅ Preset library with search/keyboard nav (MVP-9)
- ✅ Write-through state persistence for recovery
- ⏳ Static asset serving from Fastify (planned for production)
- ⏳ ALSA/systemctl endpoints (infrastructure ready, routes not implemented)
- ⏳ Pipeline editor (placeholder page exists)

See [`README.md`](../README.md) for detailed milestone completion status. For complete API documentation, see [`docs/rest-api.md`](rest-api.md).

---

⸻
## Implementation Architecture Specification

1) Goals

Primary Functional goals
	•	Serve a browser-based application on a LAN device.
	•	Provide a set of pages to connect to and control a camillaDSP instance.
	•	Provide a page serving as ineteractive pipeline editor UI with:
		•	ability to add/edit/remove filters and connections between them.
		•	visualize this across multiple channels.
	•	Provide a page serving as an interactive equalizer UI with:
		•	Spectrum overlay updated at ~10 Hz.
		•	EQ response curve and per-filter curves updated on user interaction.
		•	Filter controls (tokens/handles) with strong interactivity and styling.
	•	Integrate with a local camillaDSP client-side DSP/session + config manager WebSocket service (which may be running on the same device) for spectrum streaming and/or audio control messaging.
	•	Provide a small backend for:
		•	Loading/saving a DSP config file.
		•	Running infrequent OS/service queries (e.g., ALSA device listing, systemctl status).
	•	Provide structured logging across backend and (optionally) frontend.

Non-goals
	•	No user management, authentication flows, multi-tenant support, or internet exposure features.
	•	No packaged binary distribution required.
	•	No requirement for extensive build optimization beyond reasonable defaults.

⸻

2) Key Constraints and Design Principles

Constraints
	•	Low compute budget; avoid heavy SSR frameworks unless they add clear value.
	•	Browser will handle most rendering and real-time data processing.
	•	LAN-only and “no login” by default; still apply basic hardening to prevent accidental exposure.

Principles
	•	Separation of concerns
		•	Real-time stream: browser ↔ WebSocket service (direct).
		•	Device control/inspection: browser ↔ lightweight backend REST endpoints.
	•	Fast path vs interactive path
		•	High-frequency spectrum rendering: Canvas.
		•	Interactive, stylable curves/controls: SVG/DOM.
	•	Observability first
		•	Structured logs with consistent fields and correlation IDs.

⸻

3) System Context

Runtime topology (on-device)
	•	Process A: WebSocket DSP Service (CamillaDSP-compatible control + spectrum/metrics)
		•	Provides spectrum frames at ~10 Hz
		•	Potentially receives control messages
	•	Process B: Web UI Server (new)
		•	Serves static UI assets
		•	Exposes minimal REST API for config + OS/service queries
	•	Browser client
		•	Fetches UI assets from Process B
		•	Connects directly to Process A for Control socket (config/state/volume) and Spectrum socket (metrics frames).
		•	Manages DSP config domain state in-browser

This topology keeps the web server minimal and avoids proxying real-time frames through Node.

⸻

4) Recommended Technology Choices

Backend
	•	Node.js + Fastify
		•	Lightweight, high performance, low overhead.
		•	Built-in structured logging via Pino.
	•	Pino (JSON logs) with consistent schema.
	•	Shell-outs via Node child process (spawn) with strict timeouts and controlled arguments.

Frontend
	•	TypeScript preferred (not mandatory, but recommended for correctness and maintainability).
	•	Vite for dev server + bundling to static assets.
	•	UI framework options:
		•	Svelte (recommended) for lightweight reactive UI, minimal runtime overhead.
		•	Or vanilla TS + small helpers if you want ultra-minimal dependencies.

Rendering split (critical architectural decision)
	•	Canvas: spectrum analyzer layer (10 Hz redraw)
		•	Rendered as filled area curve with visible outline (not vertical bars)
		•	Pluggable layer architecture via `CanvasVisualizationLayer` interface
		•	Support for smoothing: geometric (spline) + data (moving average filter)
	•	SVG: curves, filter tokens/handles, selectable/stylable UI elements
	•	Optional HTML overlay: tooltips, menus, numeric editors

⸻

5) Component Architecture

5.1 Backend (Web UI Server)

Responsibilities:
	•	Serve static front-end (/ and assets).
	•	Provide REST API for:
		•	Config load/store
		•	Infrequent OS/service queries
	•	Provide health endpoint and version/build info endpoint.

Non-responsibilities:
	•	Do not proxy spectrum frames.
	•	Do not manage the real-time WebSocket session to the tertiary service (browser owns it).

Suggested endpoints (shape, not final spec):
	•	GET /health → basic liveness
	•	GET /api/version → app version/build hash
	•	GET /api/config → return config
	•	PUT /api/config → validate + persist config
	•	GET /api/state/latest → return latest applied DSP state (full CamillaDSP config JSON)
	•	PUT /api/state/latest → save latest applied DSP state (server/data/latest_dsp_state.json)
	•	GET /api/alsa/devices → list ALSA devices/capabilities
	•	GET /api/system/services → systemctl info subset

Implementation requirements:
	•	All endpoints must:
		•	Validate inputs (even if LAN-only)
		•	Enforce timeouts for shell-outs
		•	Return errors as structured JSON with error codes

5.2 Frontend (Browser App)

Responsibilities:
	•	Establish WebSocket connection to DSP web service.
	•	Render spectrum frames at ~10 Hz (Canvas).
	•	Render curves/tokens/handles (SVG) updated on interaction.
	•	Maintain application state for:
		•	Filters and other audio objects (mixers, channels, pipelines, source/destination etc.)
		•	Config state (loaded/saved through backend)
		•	Device/service info (loaded infrequently)

Recommended front-end modules:
	•	camillaDSP: WebService client-side DSP/session + DSP config manager. This layer owns:
		•	WebSocket protocol implementation
		•	Config state and normalization
		•	Config mutation operations (filters, pipelines, mixers)
		•	Validation and upload/download
		•	Convenience controls (tone, balance, crossfeed)
		•	Spectrum/metrics query API (and/or streaming handler)	
	•	filters: Filter Domain + UI Integration which owns:
		•	Filter parameter schema (type/subtype/params)
		•	Filter wrapper operations (rename, subtype switching, parameter coercion)
		•	UI bindings (recommended: SVG/UI components rather than raw DOM factories)		
	•	renderSpectrumCanvas: spectrum drawing pipeline
	•	renderEqSvg: path generation for combined and per-filter curves
	•	interaction: hit testing, dragging, gestures, keyboard support (if desired)
	•	apiClient: config + os/service calls to backend
	•	stateStore: central state + derived/computed values

A reference implementation for camillaDSP and filters is available and documented in [api-contract-camillaDSP.md](api-contract-camillaDSP.md). Read the API contract specification and both reference implementation for details. These CamillaDSP spec MUST be correctly implemented.


⸻

6) Data Flow and Update Rates

On connect with camillaDSP Web Service
	1.	Establish connection
		•	load server/ports from localStorage if absent
		•	connect to control WS
		•	connect to spectrum WS
	2.	Initialize after connection
		•	downloadConfig() via GetConfigJson
		•	Check if config is empty (0 filters/pipeline):
			•	If empty: fetch GET /api/state/latest and upload to CamillaDSP (restores last applied state)
			•	If not empty: use downloaded config
		•	UI store receives config and renders initial curves and filter tokens.

During streaming with camillaDSP Web Service 
	•	Spectrum frames arrive (via WS service stream or via polling GetPlaybackSignalPeak)
	•	SpectrumCanvasRenderer updates at ~10Hz
	•	No impact on SVG unless you choose to overlay additional data.

During filter edits
	•	UI changes call FilterModel.setFilterParameter(...)
	•	Model writes into DSP.config via loadToDSP()
	•	UI updates SVG curves immediately
	•	Upload behavior:
		•	uploads on every change in the DOM factory or equivalent state change
		•	recommended: upload on “commit” (mouseup / end drag / debounce 150–300ms) to reduce WS chatter. Keep this duration configurable.

Config and OS/service queries (infrequent)
	•	Source: user navigating to setup pages or pressing refresh
	•	Rate: low
	•	Backend:
		•	For shell-outs: run command with timeout; parse output to structured JSON.

⸻

7) Performance Requirements and Guardrails

Browser performance
	•	Spectrum rendering:
		•	Should avoid DOM mutation per spectrum frame.
		•	Canvas redraw only; canvas context reused.
	•	SVG updates:
		•	Update existing elements; avoid re-creating the SVG tree repeatedly.
		•	Keep node count limited (paths + tokens + labels).
	•	Scheduling:
		•	Spectrum: time-based redraw (10 Hz) or redraw on frame receipt.
		•	Drag interactions: requestAnimationFrame loop while dragging, but throttle any expensive curve recomputation if needed.

On-device backend performance
	•	REST endpoints must be low overhead and non-blocking.
	•	Shell-out calls:
		•	Use spawn not exec (avoid shell injection and huge buffers).
		•	Strict timeout and max output size policy.

⸻

8) Reliability and Failure Handling

WebSocket resilience (browser)
	•	Automatic reconnect with exponential backoff and jitter.
	•	UI should show “stream disconnected” state clearly.
	•	If spectrum frames stall:
		•	freeze spectrum gracefully (e.g., fade out or hold last frame with indicator)

Backend endpoints
	•	If config load fails:
		•	return default config (if defined) + error warning, or fail hard depending on policy (defined in config spec)
	•	If shell-outs fail:
		•	return partial results + diagnostic error code

⸻

9) Logging and Observability

Backend logging (mandatory)

Use structured JSON logs (Pino/Fastify):
	•	Fields:
		•	time, level, msg
		•	service (e.g., web-ui-server)
		•	requestId / correlation id (Fastify request id)
		•	route, method, statusCode, durationMs
		•	err object on errors (stack, code)
	•	Log levels:
		•	info: requests, successful config saves
		•	warn: timeouts, partial failures, non-fatal parse issues
		•	error: unexpected failures, repeated WS service query failures

Frontend logging (recommended)
	•	Keep minimal but useful:
		•	WS connect/disconnect events, config storing events
		•	In debug mode any events triggered by user interaction.
	•	dropped frames counter
	•	Optionally forward critical client logs to backend endpoint (only if needed; not required initially).

⸻

10) Security Baseline (LAN-only but not “no security”)

Even if no login is desired:
	•	Bind servers to LAN interface as intended; avoid exposing to WAN by default.
	•	Enforce same-origin for backend API requests (the webservice may or may not be on the same server as the back-end)
	•	Validate payload sizes and input formats.
	•	For shell-outs:
		•	Never accept raw command strings from the client
		•	Use predefined command templates and whitelist arguments
		•	Consider optional “operator lock” later (simple token or basic auth) if the device might land on untrusted networks.

⸻

11) Deployment Model
	•	Start with a simple process model:
		•	systemd service for web-ui-server (Fastify)
		•	systemd service for WS service (existing)
	•	Static assets served directly from Fastify (or via Caddy if you prefer, but not required).
	•	Environment configuration via:
		•	.env file for ports and WS URL
		•	Config file for EQ parameters (separate spec)

⸻

12) Folder Structure (Reference Layout)

Example (monorepo):
	•	server/
		•	src/
			•	index.ts (Fastify bootstrap)
			•	routes/ (config, alsa, system)
			•	services/ (configStore, shellExec, parsers)
			•	logger.ts
		•	package.json
	•	client/
		•	src/dsp/CamillaDSPClient.ts
		•	src/dsp/protocol.ts
		•	src/dsp/configOps.ts
		•	src/filters/FilterModel.ts
		•	src/filters/FilterSchema.ts
		•	src/ui/rendering/SpectrumCanvasRenderer.ts
		•	src/ui/rendering/EqSvgRenderer.ts
		•	src/ui/interaction/FilterInteractionController.ts
		•	src/state/store.ts
		•	src/api/DeviceApiClient.ts
		•	src/pages/* (half dozen routes)
		•	vite.config.ts
		•	package.json

Or a single package with server/ and client/ as workspaces.

⸻

13) Decision Checklist. Use This to Keep Choices “Right”

When generating code or making framework/library decisions, require the following:

A) Does this add runtime overhead on the device?
	•	Prefer libraries that do not add a heavy server runtime.
	•	Avoid SSR frameworks unless routing/layout benefits clearly outweigh CPU/memory costs.

B) Does this touch the high-frequency path (spectrum @ 10 Hz)?
	•	If yes: it must be Canvas-only, minimal allocations, no DOM churn.
	•	No per-frame JSON parsing if binary is possible.

C) Does this touch interactive UI (filters/curves)?
	•	If yes: SVG/DOM is acceptable and preferred for styling and hit targets.
	•	Ensure updates are incremental (update attributes, not rebuild trees).

D) Does this run shell commands?
	•	Must use spawn with whitelist arguments.
	•	Must implement timeouts and output size limits.
	•	Must never accept raw command text from the browser.

E) Logging requirements
	•	Backend must emit JSON structured logs with request correlation.
	•	Errors must include a stable error code for troubleshooting.

F) Maintainability for a small app
	•	Avoid “enterprise scaffolding” patterns that bloat code.
	•	Keep modules small and explicit: ws client, renderers, api client, store.

14) Summary of Recommended Stack
	•	Backend: Node.js + Fastify + Pino
	•	Frontend tooling: Vite + TypeScript
	•	Frontend UI: Svelte (recommended) or vanilla TS
	•	Rendering: Canvas (spectrum) + SVG (curves + interaction)
	•	WS topology: Browser connects directly to the local WS service (no proxying)

⸻

## Parametic EQ GUI Specification

1. Goal / User Story

The user adjusts the tonal balance of audio by manipulating several (usually 5 to 10) parametric EQ bands, using either direct manipulation on a frequency graph or precise controls on a vertical control panel.

⸻

2. Screen Inventory

This application is composed of few screens
	•	Parametric EQ : The main view through which we manage the CamillaDSP device.
	•	Connection parameters : Used to establish a connection to the CamillaDSP device.
	•	Configuration: Provides a list of pre-made DSP configurations the user can load (or save the current configuration)
	•	Pipeline editor: Allows the user to edit the camillaDSP pipeline. This is a complex editor that is not part of the MVP 0-9

⸻

3. Layout Overview of the Parametic EQ 

```
┌───────────────────────────────┬────────────────────────────────────────────────┬───────────────────────────────┐
│ LEFT COLUMN (Page Navigation) │  MAIN PANEL (Graph + Tokens + Analyzer)        │ BAND PANEL (N columns)        │
│ - Connection (icon only)      │ - Top labels (octaves + regions)               │ Each band column contains:    │
│ - Presets (icon only)         │ - EQ graph (log freq / dB gain)                │ 1) Filter type icon           │
│ - Parametric EQ (active icon) │ - Sum curve + optional per-band curves         │ 2) Slope/order icon           │
│ - Pipeline Editor (icon only) │ - Tokens (max 20)                              │ 3) Gain fader (vertical)      │
│                               │ - Freq axis labels                             │ 4) Mute button                │
│                               │  - Visualization options bar                   │ 5) Frequency dial/value       │
│                               │                                                │ 6) Q/Bandwidth dial/value     │
└───────────────────────────────┴────────────────────────────────────────────────┴───────────────────────────────┘
```

Band panel color binding (strict)
	•	The entire column is a .band root with --band-color.
	•	All sub-controls inside must derive from --band-* variables.
	•	The column background remains neutral; only accents are tinted.

3.1 Layout Refinement (MVP-11)

**Status:** ✅ Implemented (2026-01-25)

The preferred layout structure vertically aligns the EQ plot and fader tracks for visual continuity:

**Three-row grid layout:**
```
Row 1 (auto height): Top controls/labels
  • Main panel: eq-octaves-area + eq-regions-area
  • Each band column: filter-type-icon + slope-icon
  • Height = max(main panel, band columns) with bottom-aligned content

Row 2 (flex: 1, fills remaining viewport height): Main interactive area
  • Main panel: eq-plot-area (zones 1-4 as described in section 4.1)
  • Each band column: fader-track
  • EQ plot top/bottom MUST align with fader-track top/bottom

Row 3 (auto height): Bottom controls
  • Main panel: eq-freqscale-area + viz-options-area
  • Each band column: mute-btn + knob-wrapper×2 + knob-label×2
  • Master-band column: shows controls here
  • Height = max(main panel, band columns) with top-aligned content
```

**CSS precision requirements:**
	•	No vertical gaps between elements within columns
	•	Borders managed carefully (avoid double borders at row boundaries)
	•	`.band-column` wrapper spans all 3 rows for each band (maintains selection/theme context)
	•	`band-column[data-selected="true"]` highlighting logic preserved across all rows

⸻

4. Main Panel (Visualization & Direct Manipulation)

4.1 EQ Graph Panel Specification

0) Coordinate System and Frequency Domain

0.1 Frequency domain
	•	The graph X-axis represents frequency from 20 Hz to 20 kHz.
	•	The horizontal mapping MUST be logarithmic (base 10).

Mapping function
	•	Let fMin = 20, fMax = 20000.
	•	Normalized x in [0..1] is:

xNorm = (log10(f) - log10(fMin)) / (log10(fMax) - log10(fMin))

All vertical grid lines and token positions use this mapping.

⸻

1) Layout: 4 Horizontal Zones (Top-to-Bottom)

The panel is one rectangular card containing four stacked zones:
	1.	Octave Indicator Row (C1–C9)
	2.	Frequency Region Label Row (SUB…TREBLE)
	3.	Main Graph Area (grid + tokens + curves + analyzer)
	4.	Frequency Scale Row (numeric ticks: 20 … 10k)

All zones share the same left/right inner padding and exact X alignment.

1.1 Recommended CSS grid skeleton
```css
.eq-graph {
  display: grid;
  grid-template-rows:
    var(--row-octaves)
    var(--row-regions)
    1fr
    var(--row-freqscale);
  background: var(--ui-panel);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  overflow: hidden;
}

:root{
  --row-octaves: 34px;
  --row-regions: 34px;
  --row-freqscale: 34px;
  --pad-x: 14px;
}
```

⸻

2) Zone 1: Octave Indicators Row (C1…C9)

2.1 Structure
	•	A single horizontal strip subdivided into 9 equal octave-width segments labeled:
	•	C1, C2, C3, C4, C5, C6, C7, C8, C9

2.2 Octave starting frequencies (Hz) (critical)
	•	C1 ≈ 32.70 Hz
	•	C2 ≈ 65.41 Hz
	•	C3 ≈ 130.81 Hz
	•	C4 ≈ 261.63 Hz (middle C)
	•	C5 ≈ 523.25 Hz
	•	C6 ≈ 1046.50 Hz
	•	C7 ≈ 2093.00 Hz
	•	C8 ≈ 4186.01 Hz
	•	C9 ≈ 8372.02 Hz

An unlabelled bar sits before C1 and after C9 to complete the graph on either end. A small gap separates the octave segment strips/tabs from each other.

2.3 Styling
	•	Each octave segment is a rectangular "tab" with:
		•	darker background than the main graph
		•	subtle internal dividers between segments
		•	centered label text
```css
.eq-octaves {
  padding: 0 var(--pad-x);
  align-items: center;
  gap: 6px; /* small separation like the reference */
  background: color-mix(in oklab, var(--ui-panel) 70%, black 30%);
}
.eq-octave-cell{
  height: 22px;
  display:flex;
  align-items:center;
  justify-content:center;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(255,255,255,.07);
  color: rgba(255,255,255,.72);
  font-weight: 600;
  letter-spacing: .02em;
}
```

⸻

1) Zone 2: Frequency Region Labels Row

3.1 Labels and segmentation

This row contains 7 region blocks labeled:
	•	SUB, BASS, LOW MID, MID, HIGH MID, PRS, TREBLE

3.2 Alignment to frequencies
The start of each region blocks MUST align to the following frequencies:
	•	SUB: 20 Hz
	•	BASS: 60 Hz
	•	LOW MID: 250 Hz
	•	MID: 500 Hz
	•	HIGH MID: 2 kHz
	•	PRS (Presence): 4 kHz
	•	TREBLE: 6 kHz

3.3 Styling
	•	Similar "tab strip" style to octave row but with cells of different sizes.
	•	Centered labels, all caps, slightly bolder than tick labels.
	•	A small gap separates the region segment strips/tab from each other.

⸻

1) Zone 3: Main Graph Area (Grid + Zero Line + Tokens)

This is the large central area.

4.1 Background appearance (matches reference)
	•	Background is a dark teal/blue tone with a subtle vertical gradient:
	•	slightly brighter mid-lower region
	•	slightly darker near top edge
	•	Optional: very subtle horizontal banding (barely visible).

4.2 Grid: Vertical lines

4.2.1 Tick set

The vertical grid is composed of log-spaced frequency lines at:
	•	Labeled majors (also used for stronger grid lines): 20, 50, 100, 200, 500, 1k, 2k, 5k, 10k
	•	Additional unlabeled minor lines inside each decade:
		•	30, 40, 60, 70, 80, 90
		•	300, 400, 600, 700, 800, 900
		•	3k, 4k, 6k, 7k, 8k, 9k

Rule (implementable):
For each decade 10^n, draw lines at k * 10^n for k ∈ {2,3,4,5,6,7,8,9} that fall within [20..20000].
	•	Treat k ∈ {2,5,10} as "major", others as "minor".
	•	(20 and 50 are the {2,5} in the 10–100 decade; 100, 1k, 10k are the decade boundaries.)

4.2.2 Visual hierarchy
	•	Major vertical lines: brighter
	•	Minor vertical lines: dimmer

4.3 Grid: Horizontal lines and zero line

4.3.1 Zero line
	•	A single horizontal line across the center of the main graph area.
	•	This line is more prominent than other horizontal grid lines.

4.3.2 Horizontal grid lines
	•	Evenly spaced lines above and below zero.
	•	In the reference, they are very subtle.
	•	Recommended: majors every 6 dB, minors optional.

4.4 Tokens (band handles)
	•	Tokens appear as circles.
	•	Tokens are clipped to the graph rect.
	•	Tokens are always on top of grid lines.
	•	Token remains perfectly circular regardless of SVG stretching (compensated ellipse)

Interactions
	•	Drag token horizontally → adjust frequency
	•	Drag token vertically → adjust gain
	•	Mouse wheel on token → adjust bandwidth (Q)
	•	Right-click on token → open contextual menu

Context Menu (per band)
	•	Reset
	•	Type →
		•	Disabled
		•	Low Pass
		•	High Pass
		•	Band Pass
		•	Band Stop (Notch)
		•	Low Shelf
		•	Peaking
		•	High Shelf
	•	Order
	•	Key

Token Visual Elements (MVP-12)

**Status:** ✅ **Implemented** (2026-01-26)

1. **Filter order number (center of token):**
   - Displays filter's position in pipeline (1-based index)
   - Font: 12px, bold, sans-serif
   - Color: `var(--ui-text)` (neutral bright)
   - Design accommodates 2-digit numbers (max: "20")
   - Always visible (layered above token fill)

2. **Selection halo:**
   - When `token[data-selected="true"]`:
     - Outer glow/halo ring at ~2× token radius
     - Color: `color-mix(in oklab, var(--band-color) 30%, transparent)`
     - Blur: 8-12px (SVG filter or CSS box-shadow)

3. **Q/BW arc indicator:**
   - Arc rendered around token perimeter (radius slightly > token radius)
   - **Stroke thickness:** 10-15% of token radius
   - **Stroke cap:** butt or round
   - **Arc sweep range:** 30° (min) to 270° (max)
   - **Positioning:** Centered at top of token (0° = 12 o'clock)
   - **Growth behavior:** Arc grows **symmetrically** in both directions from top
     - Low Q → small arc centered at top (e.g., ±15° from vertical)
     - High Q → large arc wrapping around sides (e.g., ±135° from vertical)
   - **Mapping:** `arcStartAngle = -sweep/2`, `arcEndAngle = +sweep/2`
     - where `sweep = map(Q, minQ, maxQ, 30°, 270°)`
   - **Color:** `--band-ink` at ~85% opacity

4. **Frequency label (below token, or above if near bottom):**
   - Format: "1.2k Hz" or "150 Hz" (smart unit formatting)
   - Value in **band accent color** (`--band-ink`)
   - Unit "Hz" in **muted band color** (`color-mix(in oklab, var(--band-ink) 70%, transparent)`)
   - Font: 11px, semi-bold
   - Positioned 4px below token (or above if token Y > plot height - 60px)

5. **Q/BW label (below frequency label):**
   - Format: "Q 2.5" or "BW 1.2"
   - Color: muted band color (same as Hz unit)
   - Font: 10px, regular
   - Positioned 2px below frequency label
   - Follows token during drag
   - Switches to above-token placement when near bottom boundary

4.5 Gain Axis Labels (Right Side)

Purpose: Provide numeric reference for the dB (gain) axis.

4.5.1 Structure
	•	A vertical column positioned to the right of the main plot area
	•	Contains labels for the major 6 dB increments
	•	Takes the full height of Zone 3 (main plot area)

4.5.2 Labels (exactly as specified)
	•	-18, -12, -6, 0, +6, +12, +18
	•	Each label must align vertically with its corresponding horizontal grid line
	•	The zero label must align with the emphasized zero line

4.5.3 Alignment rule
	•	Each label's y-position MUST match the corresponding horizontal grid line y-position
	•	Uses the same gain-to-y mapping as the plot:
		•	`y = 200 - (gain / 48) * 400` (for viewBox 0-400)
		•	Or as percentage: `top = (1 - (gain + 24) / 48) * 100%`

4.5.4 Styling
	•	Column width: ~40-50px (enough for "-18" with padding)
	•	Labels are small, muted, right-aligned or centered
	•	Same background as top/bottom bars (darker than plot)
	•	Labels vertically centered on their grid line

4.5.5 Implementation note
	•	Zone 3 becomes a 2-column grid: `grid-template-columns: 1fr var(--gain-col);`
	•	Left column: existing `.eq-plot` with SVG
	•	Right column: new `.eq-gainscale` with absolutely positioned labels

The equalizer plot zone will take all the available height in the browser window.
Note that "stretching" of the viewport should not deform the band token shape.
⸻

5) Zone 4: Frequency Scale Row (Bottom Tick Labels)

5.1 Labels (exactly as shown)

The bottom bar shows labels:
	•	20, 50, 100, 200, 500, 1k, 2k, 5k, 10k

5.2 Alignment rule

Each label's x-position MUST match the corresponding vertical major grid line x-position (computed using the log mapping above).

5.3 Styling
	•	Labels sit inside a darker strip, like the top rows.
	•	Text is small, muted, left-aligned to tick or centered (either is acceptable) but must line up with the grid line.

⸻

6) Implementation Recommendation: SVG Layering Model

To achieve "high fidelity" and easy alignment:

Use a single <svg> for the main graph area with layered groups:
	1.	g.grid-vertical
	2.	g.grid-horizontal
	3.	g.zero-line
	4.	g.analyzer (optional, clipped)
	5.	g.curves (sum + band curves)
	6.	g.tokens (handles)

The SVG viewport width must match the exact width of the header strips and bottom scale strip inside the same padding (--pad-x).

⸻

7) Non-Negotiable Visual Contract (Checklist)
	•	X scale is logarithmic (20–20k).
	•	Octave row divides into C1..C9 based on doubling from 20 Hz (20–10240).
	•	Region row spans octave groups: SUB (C1–C2), BASS (C3), LOW MID (C4), MID (C5–C6), HIGH MID (C7), PRS (C8), TREBLE (C9).
	•	Vertical grid lines include majors at 20/50/100/200/500/1k/2k/5k/10k and minors at 3/4/6/7/8/9 within decades (as visible).
	•	Zero line is emphasized.
	•	Bottom labels align exactly with major grid lines.
	•	All zones share exact left/right padding so labels align with grid.

⸻

4.2 Visualization Options Bar

Purpose: Toggle display features.

Icons / Toggles
	•	Show spectrum:
		•	Pre-EQ (blue filled curve)
		•	Post-EQ (green filled curve)
		•	Off
	•	Smooth spectrum (checkbox):
		•	When enabled: applies Catmull-Rom spline + moving-average data filter
		•	Smoothing strength configurable internally (default window size: 5)
	•	Show / hide band tokens (checkbox)

Visual specification
	•	Spectrum is rendered as filled area curve with visible outline stroke
	•	Fill opacity: ~15% (dimmer)
	•	Stroke opacity: ~50-55% (brighter for visibility)
	•	Pre-EQ: blue hues
	•	Post-EQ: green hues

Technical requirements
	•	Canvas layer architecture must be extendable via `CanvasVisualizationLayer` interface
	•	Allows future addition of alternative background visualizations (gradients, particle effects, etc.)
	•	Smooth fill path must properly close to graph corners (bottom-left → curve → bottom-right)

Behavior
	•	Changes visualization only
	•	Does not affect audio processing

⸻

5. Right Panel (Precise Band Controls)

	•	The right panel is a set of vertical stacks each describing one band. There may be up to 20 bands. 
	•	Every per-band control is visually tied to the band via tint rules described in this document.
	•	Disabled bands are "muted" by opacity and reduced tint, not hue changes.
	•	The number of bands displayed is determined by the current configuration of camillaDSP
	•	Target band column width: 80px (max 80px to fit 10+ comfortably)
	•	Band name/number not displayed in column; shown only as tooltip on filter icon

5.1 Top Row – Band Mode Controls

Per Band
	1.	Band Type Selector
		•	Icon-based
		•	Indicates current filter type:
			•	High Shelf
			•	Low Shelf
			•	Peaking
			•	Band Pass
			•	Notch
			•	Low Pass
			•	High Pass
	2.	Filter Slope Selector
		•	Icon-based
		•	Indicates steepness (order) of the filter

Interaction
	•	Clicking an icon cycles or opens selection
	•	Updates both EQ curve and band token behavior

⸻

5.2 Middle Row – Vertical EQ Faders

Description
	•	N+1 vertical sliders total:
	•	N band-specific faders
	•	1 master-band fader located left of band-specific faders. Muted color scheme.

Behavior
	•	**Band faders:** Drag up/down to adjust gain (dB)
	•	**Master-band fader:** Adjusts preamp/gain stage (NOT CamillaDSP output volume)
		•	Range: **±24 dB** (clamped to EQ plot limits, same as filter bands)
		•	Shifts the **zero-line** on EQ plot: `zero-line Y = gainToY(masterGainValue)`
		•	Persists in config save/load if preamp/gain stage present
		•	**Note:** If CamillaDSP config has no gain/volume stage in pipeline, master-band has visual-only effect (no audio impact)
	•	**CamillaDSP output volume (`SetVolume`)**: Separate control concept (range -150 to +50 dB), not represented on EQ plot or master-band fader
	•	Real-time update of:
		•	EQ curve
		•	Band token vertical position
		•	Zero-line position (master-band only)

Fader-thumb appearance
	•	Shape: **Vertical rectangle** 14px wide × 28px high
	•	Rounded corners: `border-radius: 4px`
	•	Fill: neutral dark (`var(--ui-panel-2)`)
	•	Outline: slightly darker than fill, 1px stroke
	•	Selected band: add subtle colored accent using `--band-outline`

Fader-track tickmarks (MVP-10)
	•	Render horizontal tickmarks at **6 dB increments** (-18, -12, -6, 0, +6, +12, +18 dB)
	•	Use band color scheme with muted opacity
	•	Thickness: 2-3px
	•	Help users visually align fader with EQ plot grid

Fader value tooltip (MVP-10)
	•	Appears on `mousedown`/`pointerdown` at fader-thumb
	•	Positioned hanging off **left side** of thumb
	•	SVG-based shape with band-themed colors (fill: `--band-ink`, stroke: `--band-outline`)
	•	Displays gain value formatted to 1 decimal place (e.g., "-15.0 dB")
	•	Fades out over **1.5 seconds** after `mouseup`/drag end
	•	Text positioned 1/3 to 1/4 from right border, vertically centered

⸻

5.3 Bottom Row – Per-Band Controls

Per Band Controls
	1.	Mute Button
		•	Small circular toggle (no text label)
		•	Solid fill when enabled, muted when disabled
		•	Toggles band on/off
	2.	Frequency Dial (Graphical Knob + Arc)
		•	Adjusts center frequency
		•	Synced with horizontal token position
		•	See "Strict Specification: Frequency & BW/Q Dials" below
	3.	Bandwidth / Q Dial (Graphical Knob + Arc)
		•	Adjusts filter width
		•	Synced with mouse-wheel interaction on token
		•	See "Strict Specification: Frequency & BW/Q Dials" below

Visual Feedback
	•	Color-coded per band
	•	Active band highlighted
	•	Static row labels ("FREQ", "BW") placed left of all bands at correct row height

⸻

5.4 Strict Specification: Frequency & BW/Q Dials

1. Control Role and Scope
	•	Each band SHALL have exactly:
		•	One Frequency dial
		•	One Bandwidth / Q dial
			•	These controls SHALL be:
			•	Always visible
			•	Always color-tinted by band
			•	Synchronized with graph interactions

2. Knob Body (Neutral Element)

Purpose: Provide tactile affordance without competing visually.

Specification
	•	Shape: perfect circle
	•	Fill: neutral dark UI color
	•	Stroke: none or very subtle neutral outline
	•	Never tinted by band color

```css
.knob-body {
  background: var(--ui-panel-2);
  border-radius: 50%;
  box-shadow: inset 0 1px 2px rgba(0,0,0,.6);
}
```

3. Value Arc (Band-Tinted Indicator)

This is the primary expressive element.

Geometry
	•	Arc radius: slightly larger than knob radius
	•	Stroke thickness: thin but clearly legible (≈ 10–15% of knob radius)
	•	Stroke cap: round
	•	Arc does not close into a full ring

Color
	•	Stroke color: --band-ink
	•	Opacity:
	•	Active: ~90–100%
	•	Disabled band: ~40–50%

```css
.knob-arc {
  stroke: var(--band-ink);
  stroke-linecap: round;
  fill: none;
}
.band[data-enabled="false"] .knob-arc {
  opacity: .45;
}
```

4. Angular Mapping Rules (Critical)

Shared Rules (Both Knobs)
	•	The arc occupies a bounded angular range
	•	Example: −135° to +135°
	•	No value ever renders a full 360°
	•	Arc sweep represents current value, not modulation range

Frequency Dial

Mapping
	•	Input domain: [20 Hz … 20 kHz]
	•	Mapping: logarithmic
	•	Visual behavior:
	•	Low frequencies → arc end near left-lower quadrant
	•	Mid frequencies → arc end near top
	•	High frequencies → arc end near right-lower quadrant

Important
	•	Arc length (angular sweep), not position, communicates frequency

```
Frequency:
  angle = mapLog(freq, 20, 20000, -135°, +135°)
  arcSweep = constant (e.g. 40°)
```

Bandwidth / Q Dial

Mapping
	•	Input domain: implementation-defined (e.g. Q = 0.1 → 10)
	•	Mapping: linear or perceptual
	•	Visual behavior:
	•	Low Q → short arc
	•	High Q → longer arc

Important
	•	Arc length (sweep), not position, communicates value
	•	Uses same fixed-start behavior as Frequency dial

```
Bandwidth:
  startAngle = -135° (fixed)
  sweep = map(Q or BW, min, max, minSweep → maxSweep)
  endAngle = startAngle + sweep
```

1. Interaction & State

Default (Idle)
	•	Knob body neutral
	•	Arc visible in band color

Hover
	•	Arc brightens slightly
	•	Optional subtle glow in band color

Active (Dragging)
	•	Arc brightness increases
	•	Optional thicker stroke
	•	Cursor changes to rotary indicator

Disabled Band
	•	Arc remains band-colored but heavily muted
	•	Knob body remains visible
	•	Interaction disabled

6. Labeling & Context
	•	Static text labels ("FREQ", "BW") are:
		•	Neutral color
		•	Not band-tinted
		•	Placed to the left of all bands at the correct row height
	•	Dynamic numeric readouts (if shown on hover or focus):
		•	Use band color for the value
		•	Units remain neutral

⸻

1. State Model

Band States
	•	Enabled / Disabled
	•	Selected / Unselected
	•	Muted / Active

Visualization States
	•	Spectrum: Pre / Post / Off
	•	Tokens: Visible / Hidden

⸻

7. Constraints & Rules
	•	Any number of arbitrary bands. These come form a back-end source.
	•	Band tokens cannot leave the main EQ graph
	•	All control paths (token, slider, dial) are bidirectionally synced
	•	Frequency axis is logarithmic
	•	Gain axis is linear
	•	Real-time visual feedback required

⸻

8. Acceptance Criteria
	•	Dragging a band token updates EQ curve immediately
	•	Changing band type updates token behavior and curve shape
	•	Fader movement matches band gain precisely
	•	Right-click menu reflects current band settings
	•	Spectrum display respects selected pre/post mode
	•	Muted bands do not affect EQ curve

⸻
## Style Guide (Web / CSS)

1) Global Theme Foundations

1.1 Background and base surfaces (dark UI)
	•	App background: near-black neutral (no hue bias).
	•	Panels: slightly elevated dark surfaces, subtle borders.
	•	Grid: low-contrast, never competes with band curves.

CSS tokens
```css
:root {
  /* Core dark theme */
  --ui-bg: #0b0d10;         /* app background */
  --ui-panel: #10141a;      /* panel surface */
  --ui-panel-2: #0e1217;    /* deeper surface */
  --ui-border: rgba(255,255,255,.08);

  /* Text */
  --ui-text: rgba(255,255,255,.88);
  --ui-text-muted: rgba(255,255,255,.62);
  --ui-text-dim: rgba(255,255,255,.38);

  /* Graph */
  --grid-line: rgba(255,255,255,.06);
  --grid-line-major: rgba(255,255,255,.10);
  --zero-line: rgba(255,255,255,.22);

  /* Combined EQ curve */
  --sum-curve: rgba(255,255,255,.92);

  /* Analyzer (independent, muted) */
  --analyzer-pre: rgba(120,160,255,.18);
  --analyzer-post: rgba(120,255,190,.16);

  /* Focus */
  --focus-ring: rgba(255,255,255,.25);
  --shadow: 0 8px 24px rgba(0,0,0,.45);
}
```

⸻

2) Band Color System

2.1 Non-negotiable rules
	1.	Each band has one persistent color for its entire lifetime.
	2.	Band color never changes when frequency/type/Q changes.
	3.	Band color is applied consistently across:
		•	graph token
		•	per-band curve (if shown)
		•	right-panel column UI (icons, slider accents, knobs, values)
	4.	Do not color by filter type. Filter type is communicated by glyph shape only.
	5.	A band’s “disabled/muted” state uses the same hue at reduced opacity + contrast.

2.2 Palette (comfortable for 10)

Use 10 distinct hues with similar perceived brightness.
```css
:root {
  --band-1: hsl(205 90% 62%);
  --band-2: hsl(45  95% 58%);
  --band-3: hsl(140 70% 55%);
  --band-4: hsl(285 80% 65%);
  --band-5: hsl(18  90% 60%);
  --band-6: hsl(190 85% 55%);
  --band-7: hsl(330 80% 66%);
  --band-8: hsl(95  70% 55%);
  --band-9: hsl(260 85% 68%);
  --band-10:hsl(0   0%  72%); /* reserved: use only if you must */
}
```
Strict guidance: Bands 1–9 should be the “comfortable” core. If you need 10 comfortable colors, replace --band-10 with a real hue (e.g., cyan/amber variant) and keep gray reserved for “global/master”.

2.3 Beyond 10 bands (up to 20)

For bands 11–20, reuse hues but add a secondary identifier that is NOT hue:
	•	Token gets a second ring (or dotted ring)
	•	Per-band curve becomes dashed
	•	Column header shows a small marker shape (◻︎, ◯, △, ◆) next to band number

This preserves color constancy while remaining distinguishable in crowded states.

⸻

3) Band Theming via CSS (Implementation Contract)

3.1 Band column and token must set the same CSS variable

Every band “owns” a theme root node:
```css
.band {
  --band-color: var(--band-1); /* overridden per band */
  --band-ink: color-mix(in oklab, var(--band-color) 70%, white 30%);
  --band-dim: color-mix(in oklab, var(--band-color) 35%, transparent 65%);
  --band-muted: color-mix(in oklab, var(--band-color) 18%, transparent 82%);
  --band-outline: color-mix(in oklab, var(--band-color) 55%, white 10%);
}
.band[data-enabled="false"] {
  --band-ink: color-mix(in oklab, var(--band-color) 35%, white 10%);
  --band-outline: rgba(255,255,255,.14);
}
.band[data-selected="true"] {
  --band-ink: color-mix(in oklab, var(--band-color) 78%, white 22%);
}
```

3.2 Selected band brightening (MVP-10)

When `band-column[data-selected="true"]`, the following elements brighten:
	•	**Filter type icon** → brighter (increased opacity or lightness)
	•	**Slope icon** → brighter
	•	**Fader-thumb** → add subtle colored accent using `--band-outline`
	•	**Mute button** → brighter
	•	**Knob arc** → brighter (increased opacity)

Implementation: The `[data-selected="true"]` modifier increases `--band-ink` lightness (already defined above). Individual elements inherit this brighter value automatically.

```css
/* Selected band controls get brighter accents */
.band[data-selected="true"] .filter-icon,
.band[data-selected="true"] .slope-icon,
.band[data-selected="true"] .mute-btn,
.band[data-selected="true"] .knob-arc {
  opacity: 1; /* or use filter: brightness(1.15); */
}

.band[data-selected="true"] .fader-thumb {
  outline: 2px solid var(--band-outline);
  outline-offset: 1px;
}
```

3.3 What is tinted vs neutral

Tinted with band color
	•	Filter type icon
	•	Slope icon
	•	Slider track outline and/or active range outline
	•	Slider thumb outline (optional fill neutral)
	•	Mute button when enabled (icon + outline)
	•	Frequency and Q numeric values
	•	Knob arc/indicator (not the knob body)

Neutral (never tinted)
	•	Panel backgrounds
	•	Grid lines and axes
	•	Combined EQ curve (“sum curve”)
	•	Analyzer colors (pre/post are global, muted)

⸻

4) Interaction States (Strict)

4.1 Graph tokens (handles)
	•	Default: solid fill = panel surface, stroke = band ink
	•	Hover: stroke thickens + subtle glow
	•	Selected: thicker stroke + halo ring (band ink at low alpha)
	•	Disabled: stroke becomes band-muted, token fill darker

```css
.eq-token {
  fill: var(--ui-panel);
  stroke: var(--band-ink);
  stroke-width: 2;
}
.eq-token:hover { stroke-width: 3; filter: drop-shadow(0 0 6px color-mix(in oklab, var(--band-color) 45%, transparent)); }
.eq-token[data-selected="true"] { stroke-width: 3.5; }
.eq-token[data-enabled="false"] { stroke: var(--band-muted); opacity: .55; }
```

4.2 Curves
	•	Combined EQ curve: always --sum-curve (white-ish), top layer.
	•	Optional per-band curve: band-dim, thinner, below sum-curve.
	•	Disabled band curve: hidden or very faint (opacity ≤ 0.15).

```
.eq-curve-sum { stroke: var(--sum-curve); stroke-width: 2.25; fill: none; }
.eq-curve-band { stroke: var(--band-dim); stroke-width: 1.25; fill: none; }
.eq-curve-band[data-enabled="false"] { opacity: .12; }
```

4.3 Right panel column
	•	Unselected columns: normal tint
	•	Selected column: slightly brighter tint + border accent
	•	Disabled: reduce opacity and remove “active” accents

```css
.band-column {
  background: var(--ui-panel);
  border: 1px solid var(--ui-border);
}
.band-column[data-selected="true"] {
  border-color: color-mix(in oklab, var(--band-color) 45%, var(--ui-border));
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--band-color) 22%, transparent);
}
.band-column[data-enabled="false"] { opacity: .62; }
```

⸻

5) Iconography Requirements (Filter Type + Slope)

5.1 Mandatory icon style
	•	Icons must be mini frequency-response curves.
	•	Rendered as stroke-only SVG using currentColor.
	•	No fills; no gradients; no shadow baked into SVG.
	•	stroke-linecap="round", stroke-linejoin="round".
	•	Icon color must be band ink (color: var(--band-ink) on the container).

5.2 SVGs (filter type icons)

All are 24×24 viewBox, drawn on a baseline near y=12.

Low Pass (LPF)
```html
<svg viewBox="0 0 24 24" class="icon" aria-label="Low Pass">
  <path d="M3 9 H12 C14 9 15 10 15 12 V20" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```
High Pass (HPF)
```html
<svg viewBox="0 0 24 24" class="icon" aria-label="High Pass">
  <path d="M3 20 V12 C3 10 4 9 6 9 H21" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
Band Pass (BPF)
```html
<svg viewBox="0 0 24 24" class="icon" aria-label="Band Pass">
  <path d="M3 20 V12 C3 10 4 9 6 9 C9 9 9 4 12 4 C15 4 15 9 18 9 C20 9 21 10 21 12 V20"
        fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```
Notch
```html
<svg viewBox="0 0 24 24" class="icon" aria-label="Notch">
  <path d="M3 9 H8 C10 9 10 20 12 20 C14 20 14 9 16 9 H21"
        fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```
Low Shelf
```html
<svg viewBox="0 0 24 24" class="icon" aria-label="Low Shelf">
  <path d="M3 16 H8 C10 16 11 14 11 12 C11 10 12 8 14 8 H21"
        fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```
Peaking (Bell)
```html
<svg viewBox="0 0 24 24" class="icon" aria-label="Peaking">
  <path d="M3 12 C7 12 8 6 12 6 C16 6 17 12 21 12"
        fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```
High Shelf
```html
<svg viewBox="0 0 24 24" class="icon" aria-label="High Shelf">
  <path d="M3 8 H10 C12 8 13 10 13 12 C13 14 14 16 16 16 H21"
        fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```
Icon CSS
```css
.icon {
  width: 20px;
  height: 20px;
  color: var(--band-ink);
  opacity: 0.95;
}
.band[data-enabled="false"] .icon { opacity: 0.55; }
```

5.3 Slope/Order icon requirements
	•	Slope is communicated by stack count, not text (text can exist as tooltip).
	•	Use a simple “steepness bars” glyph (1–4 bars) tinted with band ink.
	•	Mapping (example; you can change values, but mapping must be fixed):
	•	12 dB/oct → 1 bar
	•	24 dB/oct → 2 bars
	•	36 dB/oct → 3 bars
	•	48 dB/oct → 4 bars

Example SVG (2 bars)
```html
<svg viewBox="0 0 24 24" class="icon" aria-label="Slope 24 dB/oct">
  <path d="M6 18 L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M10 18 L16 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>
```
