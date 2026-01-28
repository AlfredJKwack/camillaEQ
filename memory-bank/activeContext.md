# Active Context

## Current Focus
**MVP-15 completed** - Icons & CamillaDSP v3 Compatibility. Next milestone: MVP-16 (Averaged Spectrum + Peak Hold).

## Recently Completed
**MVP-15: Icons & CamillaDSP v3 Compatibility** (2026-01-29/30)

### Delivered in MVP-15:
- ✅ BandOrderIcon component with 20 unique position icons
- ✅ Direct SVG attribute rewriting (avoids CSS collision from duplicate IDs)
- ✅ Spectrum mode image buttons (100×65px, replacing text labels)
- ✅ CamillaDSP v3 compatibility: removed Reload call (SetConfigJson applies directly)
- ✅ Fixed config persistence issue (Reload was reverting browser edits)
- ✅ Improved restore-latest heuristic (checks for actual filter names in pipeline)
- ✅ SVG namespace cleanup (ns0:svg → svg)
- ✅ All 140 tests passing

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
