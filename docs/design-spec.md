# Interactive camillaDSP Graphical user interface

Project: LAN-hosted Interactive camillaDSP UI + Lightweight Device Backend
Target platform: Low-power Linux SBC (e.g., Raspberry Pi Zero / OrangePi Zero 2W)
Primary use: Tablet/desktop browser connecting over LAN
Real-time: Spectrum frames ~ every 100ms (10 Hz) via WebSocket to browser

⸻
## Implementation Architecture Specification

1) Goals

Primary Functional goals
	•	Serve a browser-based application on a LAN device.
	•	Provide a set of pages to connect to and control a camillaDSP instance.
	•	Provide an ineterative pipeline editor UI with:
		•	ability to add/edit/remove filters and connections between them.
		•	visualize this across multiple channels.
	•	Provide an interactive equalizer UI with:
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
		•	getDefaultConfig() normalization
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

⸻

3. Layout Overview of the Parametic EQ 

```
┌───────────────────────────────────────────────┬───────────────────────────────┐
│ MAIN PANEL (Graph + Tokens + Analyzer)        │ BAND PANEL (N columns)        │
│ - Top labels (octaves + regions)              │ Each band column contains:    │
│ - EQ graph (log freq / dB gain)               │ 1) Filter type icon           │
│ - Sum curve + optional per-band curves        │ 2) Slope/order icon           │
│ - Tokens (max 20)                             │ 3) Gain fader (vertical)      │
│ - Freq axis labels                            │ 4) Mute button                │
│ - Visualization options bar                   │ 5) Frequency dial/value       │
│                                               │ 6) Q/Bandwidth dial/value     │
└───────────────────────────────────────────────┴───────────────────────────────┘
```

Band panel color binding (strict)
	•	The entire column is a .band root with --band-color.
	•	All sub-controls inside must derive from --band-* variables.
	•	The column background remains neutral; only accents are tinted.d

⸻

4. Main Panel (Visualization & Direct Manipulation)

4.1 Row 1 – Band Index Indicators

Purpose: Visual mapping of musical/octave bands.
	•	Horizontal labels: C1, C2, C3, C4, C5, C6, C7, C8, C9
	•	Passive indicators (non-interactive)
	•	Span entire width of center section

⸻

4.2 Row 2 – Frequency Region Labels

Purpose: Semantic frequency grouping.
	•	Labels: SUB, BASS, LOW MID, MID, HIGH MID, PRS, TREBLE
	•	Aligned horizontally with the grid below
	•	Non-interactive

⸻

4.3 Row 3 – Main Equalizer Graph (Primary Interaction Area)

Description
A large 2D grid representing:
	•	X-axis: Frequency (logarithmic scale)
	•	Y-axis: Gain (dB)

Elements within this area:
	1.	EQ Curves
		•	Continuous white line represents the combined effect of all enabled bands only.
		•	If you show per-band contributions, they are thin, tinted, and dim. This feature can be turned On/Off and is controlled from the Visualization Options Bar.
	2.	Spectral Analyzer
		•	Vertical animated bars
		•	Can display:
		•	Pre-EQ spectrum
		•	Post-EQ spectrum
		•	Hidden
		•	Color-coded and semi-transparent
	3.	Band Tokens (N up to 20 total)
		•	Circular, color-coded, numbered (They are N = activeBands, max 20)
		•	Each token represents one EQ band
		•	One token may be in a selected state
		•	Tokens are constrained to this graph area
		•	Token rendering must support crowded layouts:
			•	always selectable
			•	selected token appears on top
			•	if >10 visible, non-selected tokens may reduce label opacity		

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

⸻

4.4 Row 4 – Frequency Scale Indicators

Purpose: Numeric reference for frequency axis.
	•	Labels: 20, 50, 100, 200, 500, 1k, 2k, 5k, 10k
	•	Fixed positions aligned with logarithmic grid

⸻

4.5 Row 5 – Visualization Options Bar

Purpose: Toggle display features.

Icons / Toggles
	•	Show spectrum:
	•	Pre-EQ
	•	Post-EQ
	•	Off
	•	Show / hide band tokens

Behavior
	•	Changes visualization only
	•	Does not affect audio processing

⸻

5. Right Section (Precise Band Controls)

	•	The right section is a set of vertical stacks each describing one band. There may be up to 20 bands. 
	•	Every per-band control is visually tied to the band via tint rules above.
	•	Disabled bands are “muted” by opacity and reduced tint, not hue changes.

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
	•	1 master/global fader located left of band specific faders. Muted color scheme.

Behavior
	•	Drag up/down to adjust gain (dB)
	•	Real-time update of:
		•	EQ curve
		•	Band token vertical position

⸻

5.3 Bottom Row – Per-Band Controls

Per Band Controls
	1.	Mute Button
		•	Toggles band on/off
		•	Disabled bands visually muted
	2.	Frequency Dial
		•	Adjusts center frequency
		•	Synced with horizontal token position
	3.	Bandwidth / Q Dial
		•	Adjusts filter width
		•	Synced with mouse-wheel interaction on token

Visual Feedback
	•	Color-coded per band
	•	Active band highlighted

⸻

6. State Model

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

3.2 What is tinted vs neutral

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
```svg
<svg viewBox="0 0 24 24" class="icon" aria-label="Low Pass">
  <path d="M3 9 H12 C14 9 15 10 15 12 V20" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```
High Pass (HPF)
```svg
<svg viewBox="0 0 24 24" class="icon" aria-label="High Pass">
  <path d="M3 20 V12 C3 10 4 9 6 9 H21" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
Band Pass (BPF)
```svg
<svg viewBox="0 0 24 24" class="icon" aria-label="Band Pass">
  <path d="M3 20 V12 C3 10 4 9 6 9 C9 9 9 4 12 4 C15 4 15 9 18 9 C20 9 21 10 21 12 V20"
        fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```
Notch
```svg
<svg viewBox="0 0 24 24" class="icon" aria-label="Notch">
  <path d="M3 9 H8 C10 9 10 20 12 20 C14 20 14 9 16 9 H21"
        fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```
Low Shelf
```svg
<svg viewBox="0 0 24 24" class="icon" aria-label="Low Shelf">
  <path d="M3 16 H8 C10 16 11 14 11 12 C11 10 12 8 14 8 H21"
        fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```
Peaking (Bell)
```svg
<svg viewBox="0 0 24 24" class="icon" aria-label="Peaking">
  <path d="M3 12 C7 12 8 6 12 6 C16 6 17 12 21 12"
        fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```
High Shelf
```svg
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
```svg
<svg viewBox="0 0 24 24" class="icon" aria-label="Slope 24 dB/oct">
  <path d="M6 18 L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M10 18 L16 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>
```


