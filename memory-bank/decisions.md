# Architecture Decision Records

This file tracks significant technical decisions made during development.

---

## ADR-001: Memory Bank Structure
**Date:** 2026-01-22  
**Status:** Accepted

### Context
Need a consistent way to track project context, decisions, and progress for both human developers and AI assistants.

### Decision
Implement a `memory-bank/` directory with the following structure:
- `projectbrief.md` - High-level project overview and goals
- `productContext.md` - Design philosophy, non-goals, and trade-offs
- `systemPatterns.md` - Architecture patterns and component relationships
- `techContext.md` - Technology stack and technical constraints
- `activeContext.md` - Current work focus and open questions
- `progress.md` - Milestone tracking and backlog
- `decisions.md` - This file, for ADRs

### Consequences
- **Positive:** Clear separation of concerns, easy onboarding, consistent context for AI assistance
- **Positive:** Lightweight, file-based approach suitable for version control
- **Negative:** Requires discipline to keep files updated
- **Negative:** Could become outdated if not maintained

---

---

## ADR-002: Backend Technology Stack
**Date:** 2026-01-22  
**Status:** Accepted

### Context
Need a lightweight, performant backend for LAN-only web UI server on low-power devices (Pi Zero-class). Requirements:
- Serve static assets
- Provide minimal REST API for config/OS queries
- NOT proxy real-time spectrum data
- Structured logging
- Low CPU/memory overhead

### Decision
- **Runtime:** Node.js
- **Framework:** Fastify (lightweight, high-performance, built-in Pino logging)
- **Logging:** Pino with JSON structured logs
- **Shell operations:** `child_process.spawn` with strict timeouts and argument whitelisting

### Consequences
- **Positive:** Fastify is extremely lightweight vs Express/alternatives
- **Positive:** Pino provides structured logging out-of-the-box with minimal overhead
- **Positive:** Node.js ecosystem mature for this use case
- **Negative:** Requires Node.js runtime on target device
- **Negative:** Must be disciplined about shell-out security

---

## ADR-003: Frontend Technology Stack
**Date:** 2026-01-22  
**Status:** Accepted  
**Updated:** 2026-01-22 (Svelte confirmed)

### Context
Need browser-based UI with high-performance real-time rendering, running on user's tablet/desktop. Requirements:
- Canvas rendering for spectrum @ ~10Hz (no DOM churn)
- SVG rendering for interactive EQ curves/tokens
- TypeScript preferred for maintainability
- Minimal build complexity

### Decision
- **Build tool:** Vite (fast dev server, optimized bundling)
- **Language:** TypeScript
- **UI Framework:** **Svelte** (confirmed choice)
  - Lightweight reactive runtime
  - Compiles to minimal JavaScript
  - No virtual DOM overhead
  - Minimal boilerplate for state management

### Consequences
- **Positive:** Vite provides instant HMR and optimized production builds
- **Positive:** Svelte compiles to minimal JavaScript, ideal for low-power device constraints
- **Positive:** TypeScript catches errors early, improves maintainability
- **Positive:** Svelte's reactivity model simplifies state synchronization between UI elements
- **Negative:** Svelte is less ubiquitous than React/Vue (smaller ecosystem)
- **Negative:** Team must learn Svelte conventions if unfamiliar
- **Negative:** Vanilla TS fallback option now closed (acceptable trade-off)

---

## ADR-004: WebSocket Topology (Critical)
**Date:** 2026-01-22  
**Status:** Accepted

### Context
Need real-time spectrum data (~10Hz) from CamillaDSP service. Two options:
1. Browser → Web Server → CamillaDSP (proxied)
2. Browser → CamillaDSP directly (Web Server uninvolved)

### Decision
**Browser connects directly to CamillaDSP WebSocket service** (Process A).

The web UI server (Process B) only serves static assets and REST API. It does NOT proxy WebSocket traffic.

### Consequences
- **Positive:** Eliminates server CPU/memory overhead for proxying high-frequency data
- **Positive:** Reduces latency (one fewer hop)
- **Positive:** Web server remains simple and stateless
- **Negative:** Browser must know CamillaDSP service address (handled via config endpoint)
- **Negative:** Two separate TCP connections to manage (REST + WS)

---

## ADR-005: Rendering Architecture (Critical)
**Date:** 2026-01-22  
**Status:** Accepted

### Context
Need to render two distinct visual layers:
1. High-frequency spectrum data (~10Hz updates)
2. Interactive EQ curves, tokens, controls (on user interaction)

### Decision
**Rendering split:**
- **Canvas:** Spectrum analyzer (10Hz redraw, minimal allocations, no DOM mutations)
- **SVG/DOM:** EQ curves, filter tokens/handles, interactive controls (incremental updates on interaction)

**Rules:**
- Spectrum rendering must NOT trigger DOM layout/reflow
- SVG updates must modify existing elements, not rebuild trees
- Canvas context is reused across frames

### Consequences
- **Positive:** Canvas avoids DOM overhead for high-frequency updates
- **Positive:** SVG provides crisp vector graphics, easy hit-testing, CSS styling for interactive elements
- **Positive:** Clear separation of concerns (fast path vs interactive path)
- **Negative:** Slightly more complex rendering pipeline (two layers to coordinate)
- **Negative:** Team must understand both Canvas and SVG APIs

---

## ADR-006: Band Color Persistence
**Date:** 2026-01-22  
**Status:** Accepted

### Context
Per design-spec: each EQ band needs consistent visual identity across graph tokens, curves, and right-panel controls.

### Decision
- Each band has ONE persistent color for its lifetime
- Band color NEVER changes when frequency/type/Q changes
- Band color is applied consistently via CSS custom properties (`--band-color`, `--band-ink`, etc.)
- Disabled state uses same hue at reduced opacity, not different hue
- Filter type communicated by icon shape, not color

### Consequences
- **Positive:** Strong visual coherence across UI
- **Positive:** User learns band identity by color
- **Positive:** CSS theming via custom properties enables clean implementation
- **Negative:** Requires discipline to not "color by type" (common antipattern)
- **Negative:** 10+ bands may require secondary visual markers (dotted rings, dash patterns)

---

## ADR-007: Spectrum Analyzer Pipeline & Overlay Enablement Model
**Date:** 2026-01-30  
**Status:** Accepted

### Context
MVP-16 adds temporal averaging (STA/LTA/Peak) and fractional-octave smoothing to the spectrum analyzer. Need to decide:
1. **Averaging domain:** Linear power vs dB?
2. **Timing model:** Fixed intervals vs actual dt?
3. **Smoothing order:** Before or after averaging?
4. **Overlay enablement:** What determines if spectrum renders?
5. **Pre/Post selector:** Independent control or coupled to overlay state?

### Decision
**Temporal Averaging:**
- All averaging operates in **dB domain** (not linear power)
- Uses **actual dt** between frames (not fixed intervals)
- Exponential Moving Average (EMA) with time constants: STA τ=0.8s, LTA τ=8s
- Peak hold: per-bin maximum with 2s hold time, 12 dB/s decay rate
- dt clamped to 150ms max to avoid visual jumps after stalls

**Fractional-Octave Smoothing:**
- Applied to **raw dB bins before analyzer state update**
- Log-frequency spacing (proper filterbank smoothing)
- Options: Off / 1/12 / 1/6 (default) / 1/3 octave

**Overlay Enablement Model:**
- Overlay enabled = **any of STA/LTA/PEAK toggled ON**
- Pre/Post selector **chooses spectrum source** (independent concern)
- Pre/Post buttons **dim when overlay disabled** (visual feedback)
- Polling starts/stops automatically based on `overlayEnabled` derived state
- Canvas clears when overlay disabled

**Processing Pipeline:**
1. Raw spectrum bins (dBFS) from CamillaDSP
2. Fractional-octave smoothing (if enabled)
3. Analyzer state update (STA/LTA/Peak)
4. Normalize to [0..1] rendering range
5. Canvas rendering with ducking (70% selection, 40% editing)

### Consequences
- **Positive:** dB domain averaging matches human perception and typical analyzer behavior
- **Positive:** Actual dt timing adapts to real poll jitter, more accurate than fixed intervals
- **Positive:** Smoothing before averaging prevents averaging from blurring spatial features
- **Positive:** Overlay enablement model is coherent (analyzer series control visibility, not source selector)
- **Positive:** Polling lifecycle matches overlay state (no wasted CPU when disabled)
- **Negative:** dB domain introduces log/exp overhead (minimal impact at 10Hz)
- **Negative:** Overlay model differs from initial MVP-7 behavior (Pre/Post were toggle buttons, now source selectors)
- **Negative:** More complex state management (3 analyzer series + smoothing + enablement logic)

---

## ADR-008: Unified Enablement Semantics
**Date:** 2026-02-01  
**Status:** Accepted

### Context
After implementing MVP-21 (filter editor with disable overlay), we discovered semantic ambiguity:
- EQ editor "mute" button appeared to be per-band operation
- Pipeline editor "disable" button was per-block operation
- Both modified the same filters but with different scopes
- Enabled state computation relied on overlay presence, not pipeline membership

This created confusion: disabling a filter in one Pipeline block showed it as "muted" in the EQ editor, even though it was still present (and audible) in other Filter blocks.

### Decision
Implement **unified enablement semantics** with clear global vs per-block boundaries:

1. **Enabled computation:** Filter is enabled if present in **at least one** relevant Filter step (not all)
2. **EQ editor mute:** Global operation (removes/restores filter across ALL Filter steps)
3. **Pipeline editor enable/disable:** Per-block operation (affects ONLY the selected Filter step)
4. **Enabled determination:** Changed from overlay check to pipeline membership scan

**Implementation:**
- Overlay schema v2: `Record<string, DisabledFilterLocation[]>` (array of locations per filter)
- New helper: `markFilterEnabledForStep()` for per-block enable
- New module: `filterEnablement.ts` with global enable/disable helpers
- Changed: `extractEqBandsFromConfig()` scans pipeline for membership (not overlay)

### Consequences
- **Positive:** Clear separation between global and per-block operations
- **Positive:** Enabled state accurately reflects audio processing (pipeline membership)
- **Positive:** EQ mute behaves as expected (complete silence)
- **Positive:** Pipeline editor allows per-block control for advanced routing
- **Positive:** User mental model: EQ editor = global tone shaping, Pipeline editor = per-block routing
- **Negative:** Two tests skipped (obsolete after behavior change to pipeline scan)
- **Negative:** More complex overlay schema (array of locations vs single location)

---

## ADR-009: Canonical Schema as Single Source of Truth
**Date:** 2026-02-02  
**Status:** Accepted

### Context
Before MVP-24, CamillaDSP types were defined in multiple locations:
- `client/src/lib/camillaDSP.ts` had local interface definitions
- `client/src/lib/camillaEqMapping.ts` imported some types but not others
- `docs/reference/camillaDSP-canonical-schema.ts` existed as reference but wasn't used

This led to:
- Type drift between modules (e.g., `FilterDefinition` vs `Filter`)
- Incomplete type coverage (missing processor types, device variants)
- Confusion about which definition was authoritative

### Decision
Adopt **`client/src/lib/camillaSchema.ts`** as the single source of truth for all CamillaDSP types.

**Implementation approach:**
1. Copy complete type definitions from reference schema to `camillaSchema.ts`
2. Re-export all types from `camillaDSP.ts` to minimize churn in consuming code
3. Remove duplicate type definitions from `camillaDSP.ts`
4. Update all imports to use re-exported types
5. Add optional chaining throughout codebase for schema-compliant nullable fields

**Type narrowing strategy:**
- Canonical schema uses discriminated unions (e.g., `Filter` = `BiquadFilter | GainFilter | ...`)
- View-model code casts to `any` when accessing union-specific properties
- Rationale: Preserves type safety at API boundaries while allowing practical access patterns

### Consequences
- **Positive:** Single source of truth eliminates drift
- **Positive:** Complete type coverage for all 9 filters, 2 processors, pipeline steps
- **Positive:** Stronger typing catches errors at compile time
- **Positive:** Easier to update types when CamillaDSP protocol changes
- **Negative:** Some view-model code requires `as any` casts for union narrowing
- **Negative:** Optional chaining verbose in places (`config.filters?.`, `config.pipeline?.`)
- **Negative:** Initial migration required touching many files (one-time cost)

**Validation:** All 292 tests passing after migration confirms no behavioral regressions.

---

## ADR-010: Server-Provided Connection Defaults & Read-Only Mode
**Date:** 2026-02-07  
**Status:** Accepted

### Context
Initial release (v0.1.0) required users to manually enter CamillaDSP connection parameters on first load. For production deployments (headless SBCs, public-facing demos), this created two problems:
1. **Configuration friction:** Users had to know and type WebSocket URLs
2. **Security exposure:** Public deployments needed a way to block preset/state writes while allowing EQ control

### Decision
**Server-provided connection defaults:**
- New endpoint: `GET /api/settings`
  - Returns: `{ camillaControlWsUrl: string | null, camillaSpectrumWsUrl: string | null }`
  - Source: Environment variables `CAMILLA_CONTROL_WS_URL` and `CAMILLA_SPECTRUM_WS_URL`
- Client fetches on first load (when localStorage empty) to auto-populate connection fields
- Enables zero-config connection for preconfigured deployments

**Read-only server mode:**
- New environment variable: `SERVER_READ_ONLY=true`
- When enabled: blocks all write operations (`PUT/POST/PATCH/DELETE`) to `/api/*`
- Implemented via Fastify `preHandler` hook (runs before all routes)
- What still works: `GET` endpoints, WebSocket connections to CamillaDSP (unaffected)
- Use case: Public internet exposure without allowing preset/state changes

### Consequences
- **Positive:** Production deployments can preconfigure connection parameters
- **Positive:** Hosted demo at `camillaeq.his.house` works out-of-box (just click Connect)
- **Positive:** Read-only mode enables safer public exposure
- **Positive:** CamillaDSP control remains fully functional (WebSocket bypass)
- **Positive:** Zero-code client changes (env vars configure behavior)
- **Negative:** Adds optional env var complexity (must be documented)
- **Negative:** Read-only mode blocks legitimate use cases (must be disabled for personal deployments)
- **Negative:** Connection defaults only work for single CamillaDSP instance per deployment

---

## ADR Template for Future Decisions

```markdown
## ADR-XXX: [Decision Title]
**Date:** YYYY-MM-DD  
**Status:** [Proposed | Accepted | Deprecated | Superseded]

### Context
[What is the issue that we're seeing that is motivating this decision or change?]

### Decision
[What is the change that we're proposing and/or doing?]

### Consequences
[What becomes easier or more difficult to do because of this change?]
- **Positive:** ...
- **Negative:** ...
```
