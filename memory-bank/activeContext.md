# Active Context

## Current Focus
**MVP-27 Complete** (2026-02-11) - AutoEQ preset library with full test coverage and updated documentation.

## Recently Completed

**MVP-27: AutoEQ Library Integration** (2026-02-11)

### Overview
Integrated 800+ headphone/IEM EQ profiles from the AutoEQ database as read-only presets with manifest optimization, comprehensive test coverage, and updated documentation.

### Implementation Details

**1. Core Integration:**
- AutoEQ presets stored in `server/data/configs/autoeq/<category>/` (committed to repo)
- New preset format: EqPresetV1 schema with device metadata (manufacturer, model, variant, category)
- Runtime conversion: EqPresetV1 → PipelineConfig (filterArray format) for client compatibility
- Read-only enforcement: 403 error when attempting to overwrite AutoEQ presets

**2. Performance Optimization:**
- Manifest file: `server/data/configs/autoeq/index.json` with pre-computed metadata
- Fast-path loading: O(1) manifest read vs O(n) recursive filesystem scan
- Manifest includes: id, configName, file path, timestamps, size, metadata fields
- Fallback: Full scan if manifest missing/invalid

**3. API Changes:**
- `GET /api/configs` now returns flat `ConfigMetadata[]` array (not wrapped object)
- `PUT /api/configs/:id` returns `{ success: true }` (not `{ message, id }`)
- ConfigMetadata includes: `presetType`, `source`, `readOnly`, `category`, `manufacturer`, `model`, `variant`
- `index.json` files excluded from all directory scans

**4. Client UI Enhancements:**
- AutoEQ toggle button: "Show/Hide AutoEQ (N)" on Presets page
- Progressive rendering: 200-item batches via requestAnimationFrame (smooth UX for large lists)
- Keyboard navigation: arrow keys + auto-expand render count when navigating beyond rendered items
- AutoEQ badge: visual indicator for imported presets
- CSS-only hover (no mouseenter handlers for performance)

**5. Import Tooling:**
- `tools/import-autoeq.ts`: Build-time script to import from AutoEQ repo
- `tools/autoeqParser.ts`: ParametricEQ.txt → EqPresetV1 converter
- Sparse git checkout: only clones `results/` directory from AutoEQ repo
- Deterministic output: sorted, normalized, idempotent
- Automatic manifest generation during import

### Test Coverage Added

**Server Tests** (`server/src/services/__tests__/configsLibrary.test.ts`):
- ✅ Manifest fast-path with mock `autoeq/index.json`
- ✅ Fallback to filesystem scan when manifest missing
- ✅ `index.json` exclusion during directory scanning
- ✅ Read-only preset protection (403 on save attempt)
- ✅ EqPresetV1 → PipelineConfig conversion
- Total: 77 server tests passing

**Client Tests** (`client/src/pages/PresetsPage.test.ts`):
- ✅ Progressive rendering batch mechanics
- ✅ AutoEQ toggle two-phase filtering
- ✅ Keyboard navigation with auto-expand
- ✅ No mouseenter handler (CSS hover only)
- Total: All client tests passing

**Tools Tests** (`tools/__tests__/`):
- ✅ `autoeqParser.test.ts`: ParametricEQ.txt parsing, Q clamping, normalization
- ✅ `import-autoeq.manifest.test.ts`: Manifest generation, ID consistency, sorting
- Total: 17 tools tests passing

**Bug Fixes During Testing:**
- Fixed Q normalization expectation (parser warns for both clamping AND rounding)
- Fixed `configsLibrary` malformed config test (NOT_FOUND vs INVALID_JSON)
- Added `index.json` skip logic to `scanDirectory()` method
- Fixed `test:tools` npm script path resolution

### Documentation Updates

**Developer Docs Updated:**
- `docs/developer/backend.md`: Logger (Pino), env vars (CONFIG_DIR), API responses, ConfigsLibrary details, AutoEQ library
- `docs/developer/architecture.md`: Added AutoEQ library + manifest to key files
- `docs/developer/data-flow.md`: Updated preset save flow with read-only check
- `docs/developer/state-and-persistence.md`: Added AutoEQ to preset library layer

**Power-User Docs Updated:**
- `docs/power-user/deployment-models.md`: Disk usage (~5-10 MB with AutoEQ), manifest optimization
- `docs/power-user/recovery-and-backups.md`: Backup includes `configs/autoeq/` directory
- `docs/power-user/linux-services.md`: Verified env var naming (already correct: CONFIG_DIR)
- `docs/power-user/headless-sbc.md`: Already correct (no changes needed)

### Files Modified/Created
1. **Server:**
   - `server/src/services/configsLibrary.ts` - Manifest loading, read-only enforcement, conversion
   - `server/src/routes/configs.ts` - Response shape updates
   - `server/src/configPaths.ts` - Already correct (CONFIG_DIR)
   - `server/src/services/__tests__/configsLibrary.test.ts` - New tests for MVP-27

2. **Client:**
   - `client/src/pages/PresetsPage.svelte` - AutoEQ toggle, progressive rendering, keyboard nav
   - `client/src/pages/PresetsPage.test.ts` - New tests for MVP-27
   - `client/src/lib/api.ts` - Updated response types

3. **Shared:**
   - `shared/eqPresetSchema.ts` - New EqPresetV1 schema definition

4. **Tools:**
   - `tools/import-autoeq.ts` - AutoEQ import script with manifest generation
   - `tools/autoeqParser.ts` - ParametricEQ.txt parser
   - `tools/__tests__/autoeqParser.test.ts` - Parser unit tests
   - `tools/__tests__/import-autoeq.manifest.test.ts` - Manifest generation tests
   - `tools/README.md` - Updated with import-autoeq documentation

5. **Root:**
   - `package.json` - Added `test:tools` and `import:autoeq` scripts

6. **Documentation:**
   - All 7 developer + power-user docs updated per above

### Test Results
- **Before fixes:** 4 tests failing (server + tools)
- **After fixes:** All tests passing
  - Server: 77 tests
  - Client: All passing
  - Tools: 17 tests
- **Total:** 240+ tests across entire suite

### Key Decisions Made
- ✅ **Manifest optimization:** O(1) fast-path for AutoEQ cold-start
- ✅ **Read-only enforcement:** Server-side 403 protection for AutoEQ presets
- ✅ **Progressive rendering:** 200-item batches for smooth large-list UX
- ✅ **Two-phase filtering:** AutoEQ toggle + search query for clear mental model
- ✅ **Runtime conversion:** EqPresetV1 → PipelineConfig maintains client compatibility

---

**Previous: Documentation Overhaul (Persona-Based)** (2026-02-04)

### Overview
Created comprehensive production-ready documentation organized by three distinct personas, replacing old narrative-style docs.

### Documentation Structure
```
/docs
  /end-user          # For end users who just want to use the EQ
  /developer         # For OSS developers who want to understand/modify code
  /power-user        # For deployers running on headless SBCs
```

### Files Created/Updated
1. **End User docs:**
   - `docs/end-user/overview.md` - What CamillaEQ does and doesn't do
   - `docs/end-user/quick-start.md` - Step-by-step installation and first connection
   - `docs/end-user/spectrum-analyzer.md` - What spectrum shows, data sources, limitations
   - `docs/end-user/troubleshooting.md` - Common issues and solutions

2. **Developer docs:**
   - `docs/developer/architecture.md` - High-level system design and constraints
   - `docs/developer/runtime-topology.md` - Process relationships and data flow
   - `docs/developer/data-flow.md` - Request/response patterns for all three paths
   - `docs/developer/frontend.md` - Client architecture, stores, rendering layers
   - `docs/developer/backend.md` - Server responsibilities, endpoints, services
   - `docs/developer/state-and-persistence.md` - State ownership and sync model
   - `docs/developer/extension-points.md` - How to extend the system safely

3. **Power User docs:**
   - `docs/power-user/deployment-models.md` - Dev vs production deployment patterns
   - `docs/power-user/linux-services.md` - systemd service setup with examples
   - `docs/power-user/headless-sbc.md` - Running on Raspberry Pi and similar
   - `docs/power-user/recovery-and-backups.md` - Backup strategies and recovery procedures

4. **README.md:** Complete rewrite with persona-specific navigation

### Key Principles
- **As-built accuracy:** Documentation reflects actual implementation, not aspirational designs
- **Persona separation:** Each doc explicitly states who it's for and what it doesn't cover
- **Actionable content:** Users can install, run, debug, and extend using only these docs
- **No history duplication:** Git is source of truth for project history

---

**Previous: Test Suite Fixes** (2026-02-04)

### Overview
Fixed 4 failing client tests across 3 modules by correcting implementation logic and test expectations.

### Issues Fixed

**1. camillaEqMapping - Bypassed filter blocks** (`client/src/lib/camillaEqMapping.ts`)
- **Problem:** Bypassed Filter steps were included in EQ page filter list
- **Root cause:** Filter list building didn't skip bypassed steps
- **Fix:** Skip bypassed Filter steps entirely when building `refNames` array
- **Rationale:** When a Filter block is bypassed, it's out of signal path - users cannot unmute individual filters within a bypassed block
- **Test updated:** "should exclude filters when all relevant steps are bypassed"

**2. knownTypes - Non-Biquad filter editability** (`client/src/lib/knownTypes.ts`)
- **Problem:** `isKnownEditableFilter()` returned true for Delay filters
- **Root cause:** Logic fell through to `isEditableFilterKind()` which returned true for Delay
- **Fix:** Made function explicitly return false for all non-Biquad filters
- **Rationale:** Only Biquad filters with known subtypes are currently editable in EQ UI
- **Test fixed:** "should return false for non-Biquad filters"

**3. pipelineProcessorEdit - Parameter rounding** (`client/src/lib/pipelineProcessorEdit.ts`)
- **Problem:** Tests expected 2-decimal precision but code used 1-decimal
- **Root cause:** Rounding formula used `* 10 / 10` instead of `* 100 / 100`
- **Fix:** Changed all processor parameters to 2-decimal rounding consistently
- **Parameters affected:** attack, release, threshold, factor, makeup_gain, attenuation
- **Rationale:** Preserves user precision for common values like 0.05s attack time
- **Tests updated:** All rounding test expectations changed to 2-decimal values

### Test Results
- **Before fixes:** 4 tests failing
- **After fixes:** All 385 tests passing (33 test files, 2 intentionally skipped)
- **Test suites:** 6 server suites + 27 client suites

### Files Modified
1. `client/src/lib/camillaEqMapping.ts` - Skip bypassed steps in filter list building
2. `client/src/lib/knownTypes.ts` - Explicit false return for non-Biquad filters
3. `client/src/lib/pipelineProcessorEdit.ts` - 2-decimal rounding for all parameters
4. `client/src/lib/__tests__/pipelineProcessorEdit.test.ts` - Updated 8 test expectations
5. `client/src/lib/__tests__/camillaEqMapping.test.ts` - Updated 1 test assertion

## Decisions Made
- ✅ **Documentation approach:** Persona-based organization (End User / Developer / Power User)
- ✅ **Bypassed filters:** Excluded from EQ page entirely (not just shown as disabled)
- ✅ **Parameter rounding:** 2-decimal precision for all processor parameters
- ✅ **Editable filters:** Only Biquad filters with known subtypes (Delay/Gain/etc. not editable)
- ✅ **AutoEQ integration:** Manifest-optimized, read-only, progressive UI rendering
- ✅ **Preset format:** EqPresetV1 for AutoEQ, PipelineConfig for user presets (both supported)

## Open Questions
None at this stage.

## Current Risks
None identified.

## Next Steps
- Future enhancements per backlog
- User feedback integration
- Consider AutoEQ library updates (re-run import script)

## Context References
- **`docs/`** - Complete persona-based documentation (updated for MVP-27)
- **`server/data/configs/autoeq/`** - 800+ imported AutoEQ presets
- **`shared/eqPresetSchema.ts`** - EqPresetV1 canonical schema
- **`tools/import-autoeq.ts`** - AutoEQ import tooling
- `memory-bank/` - All context documents
