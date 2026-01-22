# Active Context

## Current Focus
**Implementation planning complete** - Sequential MVP roadmap established with risk mitigation strategy.

## Current Milestone
**MVP-0: Repo + Dev Environment Baseline (Scaffolding)**

Establishing monorepo structure, build tooling, and development workflow.

## Immediate Next Steps

### 1. Create Monorepo Structure
- Initialize root `package.json` with workspaces for `server/` and `client/`
- Add root scripts: `dev`, `build`, `test`
- Create `.env.example` with port and WebSocket URL configuration

### 2. Server Setup (`server/`)
- Initialize `package.json` with: `fastify`, `pino`, `dotenv`, TypeScript tooling
- Create `tsconfig.json` for Node.js
- Create `src/index.ts` - Fastify bootstrap with `/health` placeholder
- Create `src/logger.ts` - Pino configuration

### 3. Client Setup (`client/`)
- Initialize `package.json` with: `vite`, `svelte`, `typescript`, testing tools
- Create `vite.config.ts` and `tsconfig.json` for browser/ESM
- Create `src/App.svelte` - Placeholder with "CamillaEQ" text
- Create `src/main.ts` - Entry point

### 4. Validate Development Workflow
- Run `npm install` to install all dependencies
- Run `npm run dev` - verify both server and client start
- Verify HMR works for client changes
- Create placeholder tests to validate test runner

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
