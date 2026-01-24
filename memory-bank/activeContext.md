# Active Context

## Current Focus
**MVP-0 through MVP-7 complete** - Full interactive EQ editor with real-time spectrum overlay implemented and tested.

## Current Milestone
**MVP-8: Real CamillaDSP Integration + Upload Policy**

Implement full CamillaDSP protocol integration with debounced config uploads.

## Immediate Next Steps

### 1. Implement Full CamillaDSP Protocol
- Review `docs/api-contract-camillaDSP.md` for complete protocol coverage
- Ensure all control socket commands are implemented
- Add error handling for all CamillaDSP operations
- Verify config normalization (`getDefaultConfig()`) is complete

### 2. Implement Upload-on-Commit with Debounce
- Add debounce utility (150-300ms delay)
- Hook into eqStore parameter changes
- Upload config to CamillaDSP when changes settle
- Show upload status indicator (pending/success/error)
- Handle upload failures gracefully

### 3. Improve Connection Management UI
- Enhance ConnectPage with better error messages
- Add connection status indicator on EqPage
- Handle disconnections gracefully (reconnect logic)
- Display CamillaDSP version and state

### 4. Write Integration Tests
- Test config upload flow (eqStore → CamillaDSP)
- Test config download flow (CamillaDSP → eqStore)
- Test debounce behavior (multiple rapid changes → single upload)
- Optional: Add gated tests for real CamillaDSP device

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

## Next Milestones (after MVP-8)
1. **MVP-9:** Config persistence roundtrip (load/save via backend)
2. **Future:** Multi-channel pipeline editor, preset management, operator lock

## Context References
- **`docs/implementation-plan.md`** - Sequential MVP roadmap (NEW - authoritative)
- `docs/design-spec.md` - Implementation specification
- `docs/api-contract-camillaDSP.md` - CamillaDSP protocol contract
- `docs/reference/camillaDSP.js` - Reference implementation
- `docs/reference/filter.js` - Reference implementation
- `memory-bank/decisions.md` - ADR-001 through ADR-006
- `memory-bank/` - All context documents
