# Active Context

## Current Focus
**MVP-16 completed** - Spectrum analyzer with STA/LTA/Peak + fractional-octave smoothing. Next milestone: MVP-17 (Update to latest CamillaDSP).

## Recently Completed
**MVP-16: Averaged Spectrum + Peak Hold** (2026-01-30)

### Delivered in MVP-16:
- ✅ Temporal averaging engine with STA (τ=0.8s), LTA (τ=8s), Peak hold (2s hold, 12 dB/s decay)
- ✅ Fractional-octave smoothing (Off / 1/12 / 1/6 / 1/3 octave)
- ✅ Multi-series canvas rendering layer (SpectrumAnalyzerLayer)
- ✅ Coherent overlay enablement model (overlay ON when any of STA/LTA/PEAK enabled)
- ✅ UI controls: 2×2 analyzer grid + smoothing dropdown + reset button
- ✅ Reactive polling (starts/stops based on overlayEnabled state)
- ✅ All 140 tests passing

## Recent Work

### MVP-16 Implementation Details (2026-01-30)

**Temporal Averaging (dB domain):**
- STA: Short-term average with 0.8s time constant, default ON
- LTA: Long-term average with 8s time constant, default OFF  
- Peak: Maximum per-bin with 2s hold + 12 dB/s decay
- Uses actual dt between frames (clamped to 150ms max)

**Fractional-Octave Smoothing:**
- Applied to raw dB bins before analyzer state update
- Options: Off / 1/12 / 1/6 (default) / 1/3 octave
- Proper log-frequency spacing for filterbank smoothing

**Overlay Enablement Model:**
- Overlay enabled = any of STA/LTA/PEAK toggled ON
- Pre/Post selector chooses source (dims when overlay disabled)
- Polling automatically starts/stops based on state
- Canvas clears when overlay disabled

**UI Controls:**
- 2×2 analyzer grid: STA / LTA / PEAK / Reset (uniform 32px height)
- Smoothing dropdown in viz options
- Reset button (↺) resets STA/LTA to current live values

**Files Created:**
- `client/src/dsp/spectrumAnalyzer.ts` - Temporal averaging engine
- `client/src/dsp/fractionalOctaveSmoothing.ts` - Spatial smoothing
- `client/src/ui/rendering/canvasLayers/SpectrumAnalyzerLayer.ts` - Multi-series renderer

**Files Modified:**
- `client/src/pages/EqPage.svelte` - UI controls + reactive polling logic
- `client/src/ui/rendering/SpectrumCanvasRenderer.ts` - Layer orchestration

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

## Open Questions
- **Upload debounce timing:** 200ms current - validated as good balance
- **CamillaDSP spectrum Q:** Current default Q=18 - recommend Q=12-16 for smoother display (documented in current-architecture.md)

## Current Risks
- **CamillaDSP overload** - Mitigated with 200ms upload debounce
- **Network latency** - Optimistic UI updates, write-through persistence

## Risk Mitigation Strategy (per implementation plan)
- ✅ **MVP-16 validated:** Temporal averaging performance confirmed (no frame drops at 10Hz)
- ✅ **Fractional-octave smoothing:** Improves readability without lag
- ✅ **Overlay model:** Coherent and predictable state management

## Next Milestones
1. **MVP-17:** Update to latest CamillaDSP (v3 protocol changes, volume limits, failure messages)
2. **Future:** Multi-channel pipeline editor, advanced features

## Context References
- **`docs/implementation-plan.md`** - Sequential MVP roadmap (authoritative)
- **`docs/current-architecture.md`** - As-built architecture + CamillaDSP spectrum interdependencies
- `docs/design-spec.md` - Implementation specification
- `docs/api-contract-camillaDSP.md` - CamillaDSP protocol contract
- `memory-bank/decisions.md` - ADR-001 through ADR-007
- `memory-bank/` - All context documents
