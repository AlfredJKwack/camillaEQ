# Active Context

## Current Focus
**v0.1.1 Documentation Updates + Hosted Demo** (2026-02-07/08) - Connection guidance, hosted demo integration, and deployment documentation for public exposure.

## Recently Completed

**v0.1.1 Documentation Updates** (2026-02-07/08)

### Overview
Updated documentation and README to reflect production deployment features added in recent commits:
- `/api/settings` endpoint for server-provided connection defaults
- `SERVER_READ_ONLY` mode for safer public exposure
- Hosted demo at `http://camillaeq.his.house/#/connect`
- CamillaDSP device configuration wizard tool

### Documentation Updates
1. **End-user docs:**
   - `quick-start.md` - Added note about server-provided defaults (auto-fill on first load)
   - `troubleshooting.md` - New section: "Cannot Save Preset (Read-Only Mode)" with symptoms/solutions

2. **Developer docs:**
   - `architecture.md` - Added `/api/settings` to API inventory, documented connection defaults + read-only mode
   - `backend.md` - Added `/api/settings` route docs, expanded environment variables section
   - `runtime-topology.md` - Added `/api/settings` to backend HTTP API endpoints

3. **Power-user docs:**
   - `linux-services.md` - Added env var docs (`CAMILLA_*_WS_URL`, `SERVER_READ_ONLY`), public exposure configuration section
   - `deployment-models.md` - New "Public vs LAN Deployment" section with security guidance
   - `headless-sbc.md` - Added "CamillaDSP Device Configuration" section documenting wizard tool

4. **README.md:**
   - New "Try It in Your Browser" section at top (hosted demo + connection instructions)
   - Restructured "Try It Now" section with three options (hosted, local, mock)
   - Updated version to v0.1.1
   - Removed "salesy" marketing tone (user feedback)

### Implementation Details
- **`GET /api/settings`** returns `{ camillaControlWsUrl, camillaSpectrumWsUrl }` from env vars
- **`SERVER_READ_ONLY=true`** blocks write operations to `/api/*` via Fastify preHandler hook
- Client fetches `/api/settings` on first load when localStorage empty (zero-config connection)
- Hosted demo preconfigured with mock CamillaDSP (control + spectrum ports)

### Key Principles
- Connection defaults optional (env vars, not required)
- Read-only mode for public exposure (WebSocket control still works)
- Documentation reflects actual deployed features (not aspirational)

---

**Documentation Overhaul (Persona-Based)** (2026-02-04)

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

**Test Suite Fixes** (2026-02-04)

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
- ✅ **Connection defaults:** Server-provided via `/api/settings` (optional env vars)
- ✅ **Read-only mode:** `SERVER_READ_ONLY=true` blocks `/api/*` writes for public exposure
- ✅ **Hosted demo:** `camillaeq.his.house` with preconfigured mock CamillaDSP

## Open Questions
- **Versioning housekeeping:** `CHANGELOG.md` currently only lists v0.1.0, but README shows v0.1.1. Need to backfill CHANGELOG entry for 0.1.1 release notes (deployment features + docs).

## Current Risks
None identified.

## Next Steps
- Future enhancements per backlog
- User feedback integration

## Context References
- **`docs/`** - Complete persona-based documentation
- **`docs/implementation-plan.md`** - Sequential MVP roadmap (authoritative)
- **`docs/current-architecture.md`** - As-built architecture
- `memory-bank/` - All context documents
