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

## Current Status
**Phase:** MVP-5 - SVG EQ Curve Rendering (Sum + Per-Band)
**State:** Ready to implement curve rendering pipeline and DSP math

## Planned Milestones

> **Implementation plan:** See `docs/implementation-plan.md` for detailed deliverables, acceptance criteria, and risk mitigation strategy.

### MVP-5: SVG EQ Curve Rendering (Sum + Per-Band)
- [ ] Create curve rendering module (path generation, scaling)
- [ ] Implement DSP math for filter frequency response
- [ ] Render sum curve (white, thick) and per-band curves (tinted, thin)
- [ ] Add toggle for per-band curve visibility
- [ ] Write unit tests for scaling and path generation

### MVP-6: Interactive Tokens + Bidirectional Sync
- [ ] Render band tokens (SVG circles, up to 20)
- [ ] Implement drag interaction (freq/gain) with constraints
- [ ] Add mouse-wheel handler for Q/bandwidth
- [ ] Create functional right panel controls (fader, mute, inputs)
- [ ] Implement state management (single source of truth)
- [ ] Write E2E tests for bidirectional sync

### MVP-7: Canvas Spectrum Renderer with Mode Toggles
- [ ] Create Canvas rendering layer (10Hz update loop)
- [ ] Implement spectrum data parsing from WebSocket
- [ ] Add spectrum bar rendering (vertical bars)
- [ ] Implement mode toggles (off, pre-EQ, post-EQ)
- [ ] Add freeze/fade behavior when frames stall
- [ ] Write performance tests for frame rate

### MVP-8: Real CamillaDSP Integration + Upload Policy
- [ ] Implement full protocol per API contract
- [ ] Add config normalization (`getDefaultConfig()`)
- [ ] Implement upload-on-commit with debounce (150-300ms)
- [ ] Create connection management UI with error handling
- [ ] Write integration tests against real CamillaDSP (optional/gated)

### MVP-9: Config Screen + Persistence Roundtrip
- [ ] Create config manager page (list/load/save)
- [ ] Implement `GET /api/configs` endpoint (list directory)
- [ ] Add load flow: Backend → Browser → CamillaDSP
- [ ] Add save flow: CamillaDSP → Browser → Backend
- [ ] Write E2E test for full save/reload cycle

## Known Issues
None at this stage.

## Backlog
Items deferred to future iterations:
- Multi-channel pipeline editor (specified but lower priority than EQ editor)
- Advanced filter types beyond core set
- Preset management system
- Optional operator lock (basic auth for untrusted networks)
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
