# Active Context

## Current Focus
**MVP-19 completed** (2026-01-31) - Pipeline Viewer (read-only display) + PipelineConfig extended format support. Documentation updated across implementation-plan, current-architecture, and memory-bank.

## Recently Completed
**MVP-19: Pipeline Viewer + PipelineConfig Extension** (2026-01-31)

### Overview
Implemented read-only pipeline visualization and extended the on-disk preset format to support full CamillaDSP pipeline configurations while maintaining backward compatibility with EQ-only presets.

### Implemented Features

**1. Pipeline Viewer (Read-Only Display):**
- **Pipeline view model** (`client/src/lib/pipelineViewModel.ts`):
  - Converts CamillaDSP config → render-friendly block view models
  - Supports Filter, Mixer, and Processor pipeline steps
  - Detects missing references (orphaned filter/mixer names)
  - Surfaces bypass state and per-block display labels
- **Block components** (`client/src/components/pipeline/*`):
  - `FilterBlock.svelte`: channel badges, filter list with type icons, missing reference indicators
  - `MixerBlock.svelte`: mixer name + in/out channel summary
  - `ProcessorBlock.svelte`: generic processor/unknown step display
- **Pipeline page** (`client/src/pages/PipelinePage.svelte`):
  - Vertical stack: `[ Input ] → blocks → [ Output ]`
  - Robust empty states (not connected / loading / no pipeline)
  - Pure read-only rendering of `dspStore.config.pipeline` (reactive)

**2. PipelineConfig Extended Format:**
- **Extended interface** (`client/src/lib/pipelineConfigMapping.ts`):
  - Added optional fields: `title`, `description`, `filters`, `mixers`, `processors`, `pipeline`
  - Maintains full backward compatibility with legacy `filterArray`-only format
- **Loading behavior** (`pipelineConfigToCamillaDSP()`):
  - If `pipeline` array present and non-empty → uses advanced fields directly
  - If `pipeline` absent → converts legacy `filterArray` to filters/pipeline
  - **Devices never persisted** - always from templateConfig or defaults
- **Test coverage:** 6 new tests in `pipelineConfigMapping.test.ts`

**3. Bug fix:**
- `normalizePipelineStep()` now preserves `name` for any step type (not only Mixer/Processor)

### Documentation Updates
- **docs/implementation-plan.md**: Marked MVP-19 complete, added as-built section
- **docs/current-architecture.md**: Updated pages list, module structure, added Pipeline Viewer + PipelineConfig Extension sections
- **memory-bank/progress.md**: Added MVP-19 + Post-MVP-9 Enhancement entries
- **memory-bank/activeContext.md**: Updated current focus

### Test Coverage
- Test files: `pipelineViewModel.test.ts`, `PipelinePage.test.ts`, `pipelineConfigMapping.test.ts`
- All tests remain passing

### Next Steps
- MVP-20: Pipeline block reordering (drag-and-drop)
- MVP-21: Filter block editor (parameter editing)
- MVP-22: Mixer block editor (routing editing)

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
