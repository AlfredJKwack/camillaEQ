# Active Context

## Current Focus
**MVP-20 completed** (2026-02-01) - Pipeline Block & Element Reordering with pointer-based drag-and-drop, landing zone system, and direction-aware index adjustment. All documentation updated.

## Recently Completed
**MVP-20: Pipeline Block & Element Reordering** (2026-02-01)

### Overview
Implemented drag-and-drop reordering for filter rows within Filter blocks using pointer events with landing zone visualization, direction-aware index adjustment, and validation/snapshot/revert error handling.

### Implemented Features

**1. Filter row reordering** (`client/src/components/pipeline/FilterBlock.svelte`):
- Per-row grab handles (☰, 24px width) with pointer-based DnD
- 6px movement threshold before drag begins
- **Landing zone system:** Visual "Drop here" indicator rendered **before** target row
- **Direction-aware index adjustment:**
  - Drag up (toIndex < fromIndex): no adjustment needed
  - Drag down (toIndex > fromIndex): `toIndex -= 1` to account for remove-then-insert shift
- Placeholder behavior: dragged row at 50% opacity during drag
- No-flicker design: gaps removed during drag (`gap: 0`)
- Stable identity keying by `filter.name`
- Dispatches `reorderName` event with `{blockId, fromIndex, toIndex}`

**2. PipelinePage integration** (`client/src/pages/PipelinePage.svelte`):
- Event handler `handleFilterNameReorder()` receives events from FilterBlock
- Identity-based lookup via `getStepByBlockId()` to find pipeline step
- **Validation + snapshot/revert:**
  - Deep snapshot before reorder
  - Applies reorder via `reorderFilterNamesInStep()`
  - Validates updated config
  - On failure: reverts to snapshot + shows inline error
  - On success: optimistic UI update + debounced upload (200ms)

**3. Supporting infrastructure:**
- **Stable IDs** (`client/src/lib/pipelineUiIds.ts`):
  - `getBlockId()` generates UI-only blockId (WeakMap-based, not persisted)
  - Regenerated only when config loaded from DSP/preset
- **Reorder utilities** (`client/src/lib/pipelineReorder.ts`):
  - `arrayMove()` - Pure array reordering function
  - `reorderFilterNamesInStep()` - Reorders `names[]` array in pipeline step
- **Pipeline editor state** (`client/src/state/pipelineEditor.ts`):
  - `commitPipelineConfigChange()` - Debounced upload with validation
  - Upload status tracking (idle/pending/success/error)

### Documentation Updates
- **docs/implementation-plan.md**: Marked MVP-20 complete, added comprehensive as-built section
- **memory-bank/progress.md**: Added MVP-20 milestone entry
- **memory-bank/activeContext.md**: Updated current focus

### Test Coverage
- Updated `PipelinePage.test.ts` to expect `buildPipelineViewModel($dspConfig, getBlockId)`
- All 240 tests passing (client + server)

### Next Steps
- MVP-21: Filter block editor (parameter editing)
- MVP-22: Mixer block editor (routing editing)
- MVP-23: Add/remove pipeline blocks

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
