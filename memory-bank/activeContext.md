# Active Context

## Current Focus
**Post-MVP-18 work completed** (2026-01-31) - WebSocket lifecycle monitoring and diagnostics export. All documentation updated to reflect degraded state, lifecycle events, and failure logging architecture.

## Recently Completed
**Post-MVP-18: WebSocket Lifecycle Monitoring & Diagnostics** (2026-01-31)

### Overview
Extended the WebSocket client with event-driven lifecycle monitoring and comprehensive diagnostics export, enabling better visibility into connection health and failure patterns.

### Implemented Features
1. **Degraded State Support:**
   - Connection state now includes `degraded` (control OK, spectrum down)
   - Per-socket tracking: `controlConnected`, `spectrumConnected` booleans
   - State derivation logic: error (control down) / degraded (spectrum down) / connected (both up)

2. **Lifecycle Event Monitoring:**
   - `CamillaDSP.onSocketLifecycleEvent(event)` callback for open/close/error on both sockets
   - Event-driven state transitions based on actual socket events
   - Transport failures logged even when requests never reach DSP

3. **Failure Logging with Bounded Retention:**
   - Last 50 failures kept in `dspState.failures[]`
   - Failures include: timestamp, socket, command, request, response
   - Failures NOT cleared on success (persistent for diagnostics)
   - Transport errors logged: "WebSocket not connected", timeouts, aborts

4. **Diagnostics Export:**
   - `exportDiagnostics()` function in dspStore
   - Exports: connection state, server/ports, version, failure log, config summary
   - "Copy Diagnostics" button on Connection page
   - JSON format for easy bug reporting

5. **UI Improvements:**
   - Nav icon shows yellow/amber for degraded state
   - Connection page shows which socket is down
   - Spectrum canvas clears in degraded mode
   - EQ editing continues when spectrum unavailable

### Documentation Updates
- **docs/current-architecture.md**: Added WebSocket lifecycle monitoring section, updated state machine
- **README.md**: Added "Degraded Connection" and "Copy Diagnostics" sections, updated nav icon colors
- **docs/api-contract-camillaDSP.md**: Added "As-Built Implementation Notes" covering lifecycle callbacks, queue/timeout, v3 compatibility
- **memory-bank**: Updated activeContext, progress, systemPatterns with new patterns

### Test Coverage
- All 202 tests passing (145 client + 54 server + 3 new lifecycle tests)
- New test files: `camillaDSP.lifecycle.test.ts`, `dspStore.lifecycle.test.ts`

---

**MVP-17: DSP Info Display** (2026-01-30)

### Delivered in MVP-16:
- ✅ Temporal averaging engine with STA (τ=0.8s), LTA (τ=8s), Peak hold (2s hold, 12 dB/s decay)
- ✅ Fractional-octave smoothing (Off / 1/12 / 1/6 / 1/3 octave)
- ✅ Multi-series canvas rendering layer (SpectrumAnalyzerLayer)
- ✅ Coherent overlay enablement model (overlay ON when any of STA/LTA/PEAK enabled)
- ✅ UI controls: 2×2 analyzer grid + smoothing dropdown + reset button
- ✅ Reactive polling (starts/stops based on overlayEnabled state)
- ✅ All 140 tests passing

## Recent Work

### MVP-17 Implementation Details (2026-01-30)

**Extended CamillaDSP Client:**
- New protocol methods: `getVersion()`, `getAvailableCaptureDevices()`, `getAvailablePlaybackDevices()`, `getConfigYaml()`, `getConfigTitle()`, `getConfigDescription()`
- Event callbacks: `onDspSuccess(info)` and `onDspFailure(info)` for tracking all DSP responses
- Callbacks fire for both control and spectrum sockets
- Info includes: timestamp, socket, command, request, response

**DSP State Management:**
- Extended `DspState` with: version, availableDevices, currentConfigs, failures array
- New action: `refreshDspInfo()` - fetches all metadata after connection
- Failure tracking: accumulates failures, clears on any successful response
- Device highlighting: compares active config devices with available device lists

**ConnectPage UI Enhancements:**
- Version display in status card ("CamillaDSP vX.Y.Z")
- Audio devices section: two-column grid with "In Use" badges
- Current configuration section: YAML display for control + spectrum with title/description
- DSP failures section: timestamped error log with full request/response context

**Files Modified:**
- `client/src/lib/camillaDSP.ts` - Extended with 6 new methods + event callbacks
- `client/src/state/dspStore.ts` - Added DSP info state + refresh action + failure tracking
- `client/src/pages/ConnectPage.svelte` - Added 3 new info sections + styling
- `server/src/services/mockCamillaDSP.ts` - Added 5 new command handlers per socket
- `client/src/lib/__tests__/camillaDSP.integration.test.ts` - Added 24 tests (9 DSP info + 2 callbacks)

## Decisions Made
- ✅ **Frontend framework:** Svelte (ADR-003)
- ✅ **Monorepo:** Single repo with workspaces
- ✅ **Testing:** Jest (backend) + Vitest (frontend) + Playwright (E2E, deferred)
- ✅ **Layout pattern:** 4-zone grid with shared right-side column (44px) for axis labels
- ✅ **Curve rendering:** RBJ biquad formulas, 256 sample points, reactive SVG paths
- ✅ **EQ graph semantics:** Filter bank response only (excludes preamp/output gain)
- ✅ **Spectrum rendering:** Canvas layer with pluggable architecture, multi-series analyzer
- ✅ **Temporal averaging:** EMA in dB domain with actual dt timing (ADR-007)
- ✅ **Fractional-octave smoothing:** Log-frequency spacing, applied before averaging (ADR-007)
- ✅ **Overlay enablement:** Driven by analyzer series toggles, not Pre/Post selector (ADR-007)
- ✅ **Canvas resolution:** Use DPR scaling for retina displays
- ✅ **Layer architecture:** `CanvasVisualizationLayer` interface for extendable visualizations
- ✅ **Failure tracking:** Accumulate failures, clear on any success (MVP-17)

## Open Questions
- **Upload debounce timing:** 200ms current - validated as good balance
- **CamillaDSP spectrum Q:** Current default Q=18 - recommend Q=12-16 for smoother display (documented in current-architecture.md)

## Current Risks
- **CamillaDSP overload** - Mitigated with 200ms upload debounce
- **Network latency** - Optimistic UI updates, write-through persistence

## Risk Mitigation Strategy (per implementation plan)
- ✅ **MVP-17 validated:** DSP info display provides comprehensive diagnostics
- ✅ **Failure tracking:** Clear visibility into DSP communication issues
- ✅ **Version display:** Users can verify CamillaDSP compatibility

## Next Milestones
1. **MVP-18:** Review and refine state management (eqStore, dspStore patterns)
2. **Future:** Multi-channel pipeline editor, advanced features

## Context References
- **`docs/implementation-plan.md`** - Sequential MVP roadmap (authoritative)
- **`docs/current-architecture.md`** - As-built architecture + CamillaDSP spectrum interdependencies
- `docs/design-spec.md` - Implementation specification
- `docs/api-contract-camillaDSP.md` - CamillaDSP protocol contract
- `memory-bank/decisions.md` - ADR-001 through ADR-007
- `memory-bank/` - All context documents
