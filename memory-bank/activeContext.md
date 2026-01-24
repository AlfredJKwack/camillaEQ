# Active Context

## Current Focus
**MVP-0 through MVP-5 complete** - Backend + WebSocket client + EQ layout + curve rendering all implemented. Ready for user interaction.

## Current Milestone
**MVP-6: Interactive Tokens + Bidirectional Sync**

Implement drag interaction and synchronization between tokens, faders, and dials.

## Immediate Next Steps

### 1. Implement State Management
- Create `client/src/state/eqStore.ts` or use Svelte stores
- Single source of truth for band parameters (freq, gain, q, enabled, type)
- Derived values: token positions, curve paths
- Updates propagate to all UI elements reactively

### 2. Make Tokens Interactive
- Add drag handlers to band tokens in EqPage
- Mouse down → capture initial position and band index
- Mouse move → calculate new freq/gain from coordinates (inverse of `freqToX`/`gainToY`)
- Constrain to graph bounds (20-20000 Hz, ±24 dB)
- Mouse up → commit changes to store
- Update cursor styles (grab/grabbing)

### 3. Make Right Panel Controls Functional
- **Gain fader:** Click/drag to adjust, update store on change
- **Mute button:** Toggle band enabled state
- **Frequency dial:** Update on interaction (KnobDial already exists)
- **Q dial:** Update on interaction
- All controls read from and write to shared store

### 4. Implement Bidirectional Sync
- Token drag → store update → right panel reflects change
- Right panel change → store update → token moves, curve updates
- Mute → band excluded from sum curve
- Ensure no circular update loops

### 5. Add Q Adjustment via Mouse Wheel
- Wheel event on token → adjust Q parameter
- Up = increase Q (narrower band)
- Down = decrease Q (wider band)
- Constrain to reasonable Q range (0.1 - 10?)

### 6. Unit Tests
- Parameter clamping (freq, gain, Q within bounds)
- Coordinate-to-parameter conversion (inverse mapping)
- Store updates propagate correctly

## Decisions Made
- ✅ **Frontend framework:** Svelte (ADR-003)
- ✅ **Monorepo:** Single repo with workspaces
- ✅ **Testing:** Jest (backend) + Vitest (frontend) + Playwright (E2E, deferred)
- ✅ **Layout pattern:** 4-zone grid with shared right-side column (44px) for axis labels
- ✅ **Curve rendering:** RBJ biquad formulas, 256 sample points, reactive SVG paths
- ✅ **EQ graph semantics:** Filter bank response only (excludes preamp/output gain)

## Open Questions
- **State management:** Use simple Svelte stores or create custom store with validation?
- **Drag constraints:** Should freq/gain snap to grid or be continuous?
- **Q range:** What are sensible min/max Q values for user adjustment?

## Current Risks
- **Interaction performance** - Need to ensure drag updates don't cause lag with curve recalculation

## Risk Mitigation Strategy (per implementation plan)
- **MVP-6 (current):** Prove bidirectional sync and interaction performance before real WS uploads
- **MVP-7:** Validate Canvas performance in isolation
- **MVP-8:** Add upload debouncing to avoid overwhelming CamillaDSP with rapid updates

## Next Milestones (after MVP-6)
1. **MVP-7:** Canvas spectrum renderer with mode toggles (pre/post/off)
2. **MVP-8:** Real CamillaDSP integration + upload policy
3. **MVP-9:** Config persistence roundtrip

## Context References
- **`docs/implementation-plan.md`** - Sequential MVP roadmap (NEW - authoritative)
- `docs/design-spec.md` - Implementation specification
- `docs/api-contract-camillaDSP.md` - CamillaDSP protocol contract
- `docs/reference/camillaDSP.js` - Reference implementation
- `docs/reference/filter.js` - Reference implementation
- `memory-bank/decisions.md` - ADR-001 through ADR-006
- `memory-bank/` - All context documents
