# Active Context

## Current Focus
**MVP-0, MVP-1, MVP-2, and MVP-3 complete** - Backend + client foundation established with working WebSocket client module. Ready for UI implementation.

## Current Milestone
**MVP-4: EQ Editor Layout (Static) + Band Theming Contract**

Lock down UI structure and CSS contracts before adding interaction logic.

## Immediate Next Steps

### 1. Create EQ Editor Page Structure
- Create `client/src/pages/EqEditor.svelte`
- Main panel:
  - Top: Band index indicators (C1-C9 labels)
  - Row 2: Frequency region labels (SUB, BASS, LOW MID, etc.)
  - Row 3: Main equalizer graph area (placeholder SVG)
  - Row 4: Frequency scale indicators (20, 50, 100, etc.)
  - Row 5: Visualization options bar (toggles for spectrum/curves)
- Right panel:
  - N band columns (start with 5, test with 12)
  - Each column: filter type icon, slope icon, fader, mute button, freq/Q controls

### 2. Implement CSS Theme System
- Create `client/src/styles/theme.css`
- Global theme variables (backgrounds, text, grid, curves)
- Band color palette (10 hues: `--band-1` through `--band-10`)
- Band theming contract using color-mix:
  - `--band-color`, `--band-ink`, `--band-dim`, `--band-muted`, `--band-outline`
- State modifiers: `[data-enabled]`, `[data-selected]`

### 3. Create Filter Icons
- Create `client/src/components/icons/`
- SVG components for each filter type (LPF, HPF, Peaking, Shelf, etc.)
- Stroke-only, using `currentColor`
- Exactly as specified in design-spec

### 4. Visual Tests
- Playwright snapshot tests:
  - 5 bands rendered with distinct colors
  - 12 bands rendered (layout remains functional)
  - Band columns have correct CSS custom properties

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
