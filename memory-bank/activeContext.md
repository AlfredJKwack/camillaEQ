# Active Context

## Current Focus
**MVP-0 through MVP-6 complete** - Full interactive EQ editor with bidirectional sync implemented and tested.

## Current Milestone
**MVP-7: Canvas Spectrum Renderer with Mode Toggles**

Implement high-frequency spectrum visualization with Canvas rendering.

## Immediate Next Steps

### 1. Create Canvas Rendering Module
- Create `client/src/ui/rendering/SpectrumCanvasRenderer.ts`
- `init(canvas, width, height)` - Set up 2D context
- `render(spectrumData, mode)` - Draw vertical bars
- `clear()` - Clear canvas
- Use `requestAnimationFrame` for smooth 10Hz updates

### 2. Implement Spectrum Data Parsing
- Create `client/src/dsp/spectrumParser.ts`
- Parse WebSocket spectrum frames from mockCamillaDSP
- Normalize magnitude values to dB scale
- Bin frequencies to match graph's log scale

### 3. Integrate Canvas Layer in EqPage
- Position canvas behind SVG layer (z-index)
- Overlay on EQ graph without blocking interactions
- Connect to mock WebSocket spectrum data stream
- Handle resize events (ResizeObserver)

### 4. Implement Mode Toggles
- Wire up existing spectrum mode buttons (off/pre/post)
- Store mode in eqStore or local component state
- Change bar color based on mode (pre = blue, post = green)
- Hide/show canvas based on "off" state

### 5. Add Freeze/Fade Behavior
- Track last frame timestamp
- If >500ms elapsed, fade out or show "stale" indicator
- Optional: Display dropped frame counter (debug mode)

### 6. Performance Testing
- Measure frame rate under continuous updates
- Verify 10Hz target on low-power hardware simulation
- Check CPU usage doesn't interfere with UI responsiveness

## Decisions Made
- ✅ **Frontend framework:** Svelte (ADR-003)
- ✅ **Monorepo:** Single repo with workspaces
- ✅ **Testing:** Jest (backend) + Vitest (frontend) + Playwright (E2E, deferred)
- ✅ **Layout pattern:** 4-zone grid with shared right-side column (44px) for axis labels
- ✅ **Curve rendering:** RBJ biquad formulas, 256 sample points, reactive SVG paths
- ✅ **EQ graph semantics:** Filter bank response only (excludes preamp/output gain)

## Open Questions
- **Spectrum data format:** Binary vs JSON for spectrum frames?
- **Canvas resolution:** Match CSS pixels or use higher DPR for retina displays?
- **Frame dropping strategy:** Skip frames or queue/interpolate?

## Current Risks
- **Canvas performance** - 10Hz updates with full redraw may impact low-power devices

## Risk Mitigation Strategy (per implementation plan)
- **MVP-7 (current):** Validate Canvas performance in isolation before adding complexity
- **MVP-8:** Add upload debouncing to avoid overwhelming CamillaDSP with rapid updates
- **MVP-9:** Prove full persistence roundtrip before considering production-ready

## Next Milestones (after MVP-7)
1. **MVP-8:** Real CamillaDSP integration + upload policy (debounced config uploads)
2. **MVP-9:** Config persistence roundtrip (load/save via backend)

## Context References
- **`docs/implementation-plan.md`** - Sequential MVP roadmap (NEW - authoritative)
- `docs/design-spec.md` - Implementation specification
- `docs/api-contract-camillaDSP.md` - CamillaDSP protocol contract
- `docs/reference/camillaDSP.js` - Reference implementation
- `docs/reference/filter.js` - Reference implementation
- `memory-bank/decisions.md` - ADR-001 through ADR-006
- `memory-bank/` - All context documents
