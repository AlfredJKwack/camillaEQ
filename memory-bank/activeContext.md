# Active Context

## Current Focus
**MVP-0 through MVP-8 complete** - Full interactive EQ editor with real-time spectrum overlay, CamillaDSP integration, and debounced config uploads.

## Current Milestone
**MVP-9: Config Screen + Persistence Roundtrip**

Implement config load/save via backend with full roundtrip flow.

## Immediate Next Steps

### 1. Create Config Manager Page
- Build `client/src/pages/ConfigManager.svelte` UI
- List available configs (fetch from backend)
- Load button: Backend → Browser → CamillaDSP upload
- Save button: Capture current state → Backend persistence
- Display config metadata (name, last modified)

### 2. Backend Endpoint for Config List
- Implement `GET /api/configs` endpoint
- Read config directory, return file names + metadata
- Error handling for missing/inaccessible directory
- Unit tests for config list endpoint

### 3. Implement Config Flow Logic
- **Load flow**: Backend → Browser state → CamillaDSP `SetConfigJson` + `Reload`
- **Save flow**: CamillaDSP `GetConfigJson` → Browser → Backend `PUT /api/config`
- Validation: Ensure browser/CamillaDSP state sync before save
- Optional: Force save with warning if out of sync

### 4. Write E2E Test
- Save config via UI
- Reload page (or disconnect/reconnect)
- Load saved config
- Verify UI state matches saved config

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
