# Active Context

## Current Focus
**MVP-10 in progress** - Tooltip & labels on band editor. Fader tooltip with collision-aware positioning complete.

## Current Milestone
**MVP-10: Tooltip & Labels on Band Editor** - Visual enhancements for band editor

### Completed in MVP-10:
- ✅ FaderTooltip component with band-themed SVG callout
- ✅ Collision-aware left/right positioning (flips if would clip)
- ✅ Formatted gain value display (±X.X dB)
- ✅ 1.5s fade-out animation after release
- ✅ Single global tooltip instance (position: fixed, escapes scroll container)
- ✅ Band color integration via strokeColor prop
- ✅ Horizontal mirroring (scaleX) when flipped to right
- ✅ Fader track tickmarks at 6 dB increments
- ✅ Master-band zero-line coupling (preamp gain control)
- ✅ Fader-thumb appearance update (14×28px rounded rect with colored accent)
- ✅ Selected band brightening (increase --band-ink opacity/lightness)

## Recent Work

### Latest State Persistence (2026-01-25)
**Problem:** Page reload showed empty EQ (0 bands) because CamillaDSP returned empty config on reconnect.

**Solution:** Server-side persistence of latest applied DSP state
- Added `GET /api/state/latest` and `PUT /api/state/latest` endpoints
- Storage location: `server/data/latest_dsp_state.json`
- Write-through on every successful EQ upload (non-fatal if server unavailable)
- Startup restore: if CamillaDSP returns empty config, fetch and upload `/api/state/latest`
- Removed old preset auto-restore behavior (presets now only load on explicit user action)

**Files Modified:**
- `server/src/index.ts` - Added latest state endpoints using ConfigStore
- `client/src/state/eqStore.ts` - Write-through to `/api/state/latest` after successful uploads
- `client/src/state/dspStore.ts` - `maybeRestoreLatestState()` replaces `maybeRestoreLastPreset()`
- `client/src/pages/PresetsPage.svelte` - Removed localStorage preset tracking

**Result:** Page reload now shows the most recent edited state, not last loaded preset.

## Decisions Made
- ✅ **Frontend framework:** Svelte (ADR-003)
- ✅ **Monorepo:** Single repo with workspaces
- ✅ **Testing:** Jest (backend) + Vitest (frontend) + Playwright (E2E, deferred)
- ✅ **Layout pattern:** 4-zone grid with shared right-side column (44px) for axis labels
- ✅ **Curve rendering:** RBJ biquad formulas, 256 sample points, reactive SVG paths
- ✅ **EQ graph semantics:** Filter bank response only (excludes preamp/output gain)
- ✅ **Spectrum rendering:** Canvas layer with pluggable architecture, filled curve + outline (not bars)
- ✅ **Spectrum smoothing:** Catmull-Rom spline + moving-average filter, toggle in UI, strength parameter ready
- ✅ **Canvas resolution:** Use DPR scaling for retina displays (decided during MVP-7)
- ✅ **Layer architecture:** `CanvasVisualizationLayer` interface for extendable background visualizations

## Open Questions
- **Upload debounce timing:** 150ms vs 300ms - balance responsiveness vs. CamillaDSP load
- **Error recovery:** Retry failed uploads automatically or require user action?
- **Connection persistence:** Auto-reconnect on disconnect, or require manual reconnect?

## Current Risks
- **CamillaDSP overload** - Rapid parameter changes could overwhelm WebSocket with config uploads
- **Network latency** - Upload lag could create confusing UX (out-of-sync state)

## Risk Mitigation Strategy (per implementation plan)
- **MVP-7 (current):** Validate Canvas performance in isolation before adding complexity
- **MVP-8:** Add upload debouncing to avoid overwhelming CamillaDSP with rapid updates
- **MVP-9:** Prove full persistence roundtrip before considering production-ready

## Next Milestones (after MVP-10)
1. **MVP-11:** EQ page Layout refinement
2. **MVP-12:** Informative EQ Plot tokens
3. **MVP-13:** Usability improvements
4. **Future:** Multi-channel pipeline editor, Update to latest CamillaDSP

## Context References
- **`docs/implementation-plan.md`** - Sequential MVP roadmap (NEW - authoritative)
- `docs/design-spec.md` - Implementation specification
- `docs/api-contract-camillaDSP.md` - CamillaDSP protocol contract
- `docs/reference/camillaDSP.js` - Reference implementation
- `docs/reference/filter.js` - Reference implementation
- `memory-bank/decisions.md` - ADR-001 through ADR-006
- `memory-bank/` - All context documents
