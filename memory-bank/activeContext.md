# Active Context

## Current Focus
**MVP-0 and MVP-1 complete** - Backend foundation established with error handling, logging, and testing infrastructure. Ready for config persistence implementation.

## Current Milestone
**MVP-2: Config Persistence API (File I/O)**

Implementing deterministic config storage without CamillaDSP dependency.

## Immediate Next Steps

### 1. Create Config Storage Service
- Create `server/src/services/configStore.ts`
- Implement atomic write operations (write to temp, then rename)
- Default config location: `./data/config.json`
- Handle file I/O errors gracefully

### 2. Add Config Endpoints
- Implement `GET /api/config` - returns current config file contents
- Implement `PUT /api/config` - validates and persists config
  - Validate: payload size limit (1MB)
  - Validate: JSON parse succeeds
  - Validate: basic shape checks (not full DSP validation yet)

### 3. Add Config-Specific Error Codes
Already defined in `server/src/types/errors.ts`:
- `ERR_CONFIG_NOT_FOUND`
- `ERR_CONFIG_INVALID_JSON`
- `ERR_CONFIG_TOO_LARGE`
- `ERR_CONFIG_WRITE_FAILED`

### 4. Write Tests
- Unit/integration tests using temp directory
- Test atomic write behavior (interrupted write doesn't corrupt)
- Test error cases (invalid JSON, missing file, etc.)

## Decisions Made (see ADR-003)
- ✅ **Frontend framework:** Svelte (confirmed)
- ✅ **Monorepo:** Single repo with workspaces (implicit in plan)
- ✅ **Testing:** Jest (backend) + Vitest (frontend) + Playwright (E2E)

## Open Questions
- **Deployment target specifics:** Which exact device(s) to optimize for? (Pi Zero, Orange Pi Zero 2W, other?)
- **CamillaDSP service availability:** Do you have an existing CamillaDSP WebSocket service running for testing, or should we create mock first?
- **CI/CD:** Do you want GitHub Actions or similar CI setup from the start?

## Current Risks
- **None at MVP-0 stage** - scaffolding is low-risk

## Risk Mitigation Strategy (per implementation plan)
- **MVP-3:** Mock WebSocket service before touching real CamillaDSP
- **MVP-4:** Lock down CSS/layout contracts early (hardest to change later)
- **MVP-5:** Validate SVG rendering performance before adding interaction
- **MVP-6:** Prove bidirectional sync before real uploads
- **MVP-7:** Validate Canvas performance in isolation

## Next Milestones (after MVP-0)
1. **MVP-1:** Backend REST foundation + hardening (health, version, logging, shell-out utilities)
2. **MVP-2:** Config persistence API (file I/O without WS dependency)
3. **MVP-3:** Mock WS service + client WS plumbing (critical risk reduction)

## Context References
- **`docs/implementation-plan.md`** - Sequential MVP roadmap (NEW - authoritative)
- `docs/design-spec.md` - Implementation specification
- `docs/api-contract-camillaDSP.md` - CamillaDSP protocol contract
- `docs/reference/camillaDSP.js` - Reference implementation
- `docs/reference/filter.js` - Reference implementation
- `memory-bank/decisions.md` - ADR-001 through ADR-006
- `memory-bank/` - All context documents
