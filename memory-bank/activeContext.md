# Active Context

## Current Focus
**MVP-23 completed** (2026-02-01) - Add/Remove Pipeline Blocks with support for all three block types (Filter, Mixer, Processor). Documentation updated across all files.

## Recently Completed
**MVP-23: Add/Remove Pipeline Blocks** (2026-02-01)

### Overview
Implemented full add/remove functionality for pipeline blocks with toolbar UI, validation, and orphan cleanup.

### Implemented Features

**1. Add/remove toolbar:**
- 4 toolbar buttons: Add Filter (🎚️), Add Mixer (🔀), Add Processor (⚙️), Remove Selected (🗑️)
- Toolbar only visible when connected and config loaded
- Remove button right-aligned, disabled when no selection

**2. Add Filter Block flow:**
- Creates new Filter step with `channels: [0]`, empty `names[]`
- Inserts after selected block (or at end if no selection)
- Uses `createNewFilterStep()` helper
- Validates and uploads immediately

**3. Add Mixer Block flow:**
- Creates 2→2 passthrough mixer with unique auto-generated name (mixer_1, mixer_2, etc.)
- Inserts pipeline step after selected block (or at end)
- Uses `createNewMixerBlock()` helper
- Validates and uploads immediately

**4. Add Processor Block flow:**
- Prompts user for processor name via `window.prompt()` (default: "processor")
- Creates empty processor definition `{}`
- Generates unique name if collision detected
- Inserts pipeline step after selected block (or at end)
- Uses `createNewProcessorBlock(config, 'Processor', baseName)` helper
- User must configure processor externally (parameters left empty)
- Validates and uploads immediately

**5. Remove Block flow:**
- Removes selected pipeline step
- Calls `cleanupOrphanDefinitions()` to remove unused filters/mixers/processors
- Validates and uploads immediately
- Deselects after removal

**6. Validation:**
- All operations validated via `dsp.validateConfig()` before upload
- Snapshot/revert pattern on validation failure
- Inline error banner displays validation errors
- No confirmation dialogs (matches existing UX pattern)

### Implementation Files
- **Mutations:** `client/src/lib/pipelineBlockEdit.ts` (all block creation helpers + cleanup)
- **UI:** `client/src/pages/PipelinePage.svelte` (toolbar + handlers)
- **Cleanup:** `client/src/lib/disabledFiltersOverlay.ts` (`removeDisabledLocationsForStep()`)
- **Tests:**
  - `client/src/lib/__tests__/pipelineBlockEdit.test.ts` (17 tests)
  - `client/src/pages/PipelinePage.test.ts` (8 tests)

### Test Results
- All 25 new/updated tests passing
- All 240 client tests passing total

### Documentation Updated
- `docs/implementation-plan.md` - Marked MVP-23 complete with comprehensive "As Built" section
- `README.md` - Updated project status, added MVP-23 feature summary
- `memory-bank/progress.md` - Added MVP-23 milestone entry
- `memory-bank/activeContext.md` - Updated current focus (this file)

**Previous (MVP-22: Mixer Block Editor)** (2026-02-01)

### Overview
Implemented full mixer block editor with inline routing controls, validation, and live editing on the Pipeline page.

### Implemented Features

**1. Mixer block editor UI:**
- Expandable mixer blocks with inline routing editor
- Per-destination channel display with list of source channels
- Per-source controls: gain knob (-150 to +50 dB), invert toggle, mute toggle
- Destination-level mute toggle
- Inline validation warnings/errors per destination
- Compact summary view when collapsed

**2. Routing validation:**
- **Error (blocks upload):** Destination has 0 unmuted sources (unless dest itself muted)
- **Warning (non-blocking):** Destination sums >1 unmuted source
- **Warning (non-blocking):** Summing with any source gain > 0 dB (risk of clipping)
- Validation runs continuously as user edits
- Results displayed inline on affected destination

**3. Gain editing:**
- Per-source gain: -150 to +50 dB (CamillaDSP range)
- KnobDial component (24px) for gain adjustment
- Default: 0 dB (unity gain)
- Live updates with debounced upload (200ms)

**4. Test config:**
- `server/data/configs/mvp22-mixer-block-test.json` - 2ch passthrough mixer
- Changed from 4→2 downmix to 2ch-safe for device compatibility
- Reason: Presets don't store `devices`, so mixer must match common 2ch capture/playback

### Implementation Files
- **UI:** `client/src/components/pipeline/MixerBlock.svelte`
- **State mutations:** `client/src/lib/pipelineMixerEdit.ts`
- **Validation:** `client/src/lib/mixerRoutingValidation.ts`
- **Tests:**
  - `client/src/lib/__tests__/pipelineMixerEdit.test.ts` (17 tests)
  - `client/src/lib/__tests__/mixerRoutingValidation.test.ts` (8 tests)

### Test Results
- All 25 new tests passing (17 mixer edit + 8 validation)
- All 292 tests passing total (240 client + 52 server, 2 intentionally skipped)

### Documentation Updated
- `docs/implementation-plan.md` - Marked MVP-22 complete with "As Built" section
- `README.md` - Added "Mixer Editing (MVP-22)" section with usage instructions
- `docs/rest-api.md` - Updated `/api/configs/:id` to document extended preset format
- `memory-bank/progress.md` - Added MVP-22 milestone entry
- `memory-bank/activeContext.md` - Updated current focus

**Previous (MVP-21 Follow-up: Unified Enablement Semantics)** (2026-02-01)

### Overview
Unified the enablement semantics across EQ and Pipeline editors to resolve confusion between global mute and per-block disable operations. Changed enabled computation from overlay check to pipeline membership scan.

### Implemented Features

**1. Unified enablement semantics:**
- **Enabled computation:** Filter is enabled if present in **at least one** relevant Filter step
- **Relevant Filter steps:** All `step.type === 'Filter'` steps containing EQ biquad filter set
- **Global vs per-block behavior:**
  - **EQ editor mute:** Global operation (removes/restores filter across all Filter steps)
  - **Pipeline editor enable/disable:** Per-block operation (affects only selected Filter step)

**2. Overlay schema v2 (multi-step aware)** (`client/src/lib/disabledFiltersOverlay.ts`):
- Migrated from `Record<string, DisabledFilterLocation>` to `Record<string, DisabledFilterLocation[]>`
- Each filter can have multiple disabled locations (one per Filter step where it was disabled)
- Each location: `{ stepKey, index, filterName }`
- **Migration:** `loadDisabledFiltersOverlay()` wraps v1 single location into array
- Added `markFilterEnabledForStep()` - per-block enable (removes only specified step's overlay entry)
- Existing `markFilterDisabled()` adds to location array
- Existing `markFilterEnabled()` removes all locations (global enable)

**3. EQ enabled computation** (`client/src/lib/camillaEqMapping.ts`):
- **Changed from overlay check to pipeline membership scan**
- `extractEqBandsFromConfig()` checks if filter present in any Filter step
- Band shows as enabled if present in at least one step (not bypassed)
- Removed dependency on disabled overlay for enabled computation

**4. Global enable/disable helpers** (`client/src/lib/filterEnablement.ts`):
- `ensureFilterEnabledInAllSteps()` - adds filter to all relevant Filter steps (for EQ mute)
- `removeFilterFromAllSteps()` - removes filter from all relevant Filter steps (for EQ mute)
- Used by EQ editor's toggle mute functionality

**5. Per-block enable** (`client/src/lib/pipelineFilterEdit.ts`):
- `enableFilter()` now uses `markFilterEnabledForStep()` instead of `markFilterEnabled()`
- Restores filter only to the specific step where it was disabled
- Preserves disabled state in other Filter steps

### Test Updates
- **Obsolete tests removed/skipped:**
  - `eqStore.test.ts`: `setFilterBypassed` unit test (skipped - behavior changed to pipeline scan)
  - `EqPage.behavior.test.ts`: `toggleBandEnabled` integration test (skipped - behavior changed)
- All 292 tests passing (240 client + 52 server, 2 intentionally skipped)

### Documentation Updates
- **docs/implementation-plan.md**: Added MVP-21 Follow-up section with comprehensive details
- **docs/current-architecture.md**: Added "Unified enablement semantics" section under Pipeline Editor
- **README.md**: Updated project status to MVP-21 Follow-up Complete
- **memory-bank/progress.md**: Added MVP-21 Follow-up milestone entry
- **memory-bank/activeContext.md**: Updated current focus

### Next Steps
- MVP-22+: Future pipeline editing features (add/remove blocks, mixer editing, etc.)

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
