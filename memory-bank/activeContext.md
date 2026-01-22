# Active Context

## Current Focus
**MVP-0, MVP-1, and MVP-2 complete** - Backend foundation and config persistence operational. Ready for mock WebSocket service to de-risk real CamillaDSP integration.

## Current Milestone
**MVP-3: Mock WebSocket Service + Client WS Plumbing**

Critical risk reduction: prove WebSocket connection/reconnection logic before touching real CamillaDSP hardware.

## Immediate Next Steps

### 1. Create Mock WebSocket Services
- Create `server/src/services/mockCamillaDSP.ts`
  - Mock control WebSocket (port configurable, default 3146)
  - Mock spectrum WebSocket (port configurable, default 6413)
- Implement basic protocol responses:
  - `GetConfig` → return sample config
  - `SetConfig` → accept and store config
  - `GetState` → return "Running" / "Paused"
  - Spectrum data generation (mock sine waves or noise)

### 2. Client CamillaDSP Module
- Create `client/src/lib/camillaDSP.ts`
- WebSocket connection manager:
  - `connect()` / `disconnect()`
  - Exponential backoff reconnection (1s, 2s, 4s, 8s, max 30s)
  - State machine: disconnected → connecting → connected → error
  - Event emitter for state changes

### 3. ConnectionStatus UI Component
- Create `client/src/components/ConnectionStatus.svelte`
- Display connection state (disconnected, connecting, connected, error)
- Show reconnection countdown
- Manual reconnect button

### 4. E2E Tests (Playwright)
- Test connection lifecycle
- Test reconnection on disconnect
- Test config upload/download
- Test spectrum data reception

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
