# Active Context

## Current Focus
**MVP-0 through MVP-4 complete** - Backend foundation + WebSocket client + EQ Editor layout all implemented. Ready for curve rendering.

## Current Milestone
**MVP-5: SVG EQ Curve Rendering (Sum + Per-Band)**

Prove the SVG rendering pipeline and DSP math before adding interaction.

## Immediate Next Steps

### 1. Create Curve Rendering Module
- Create `client/src/ui/rendering/EqSvgRenderer.ts`
- Functions:
  - `generateCurvePath(filters, freqMin, freqMax, numPoints): string` - SVG path `d` attribute
  - `updateSumCurve(svgElement, path)` - Modifies existing `<path>` element
  - `updatePerBandCurve(svgElement, bandIndex, path)` - Incremental update
- Scaling utilities (already have `freqToX` in EqPage, need `gainToY`)

### 2. Implement DSP Math for Filter Response
- Create `client/src/dsp/filterResponse.ts`
- Calculate frequency response for:
  - Peaking (bell) filter
  - Low shelf
  - High shelf
  - Low pass (basic, later iterate for accuracy)
  - High pass (basic, later iterate for accuracy)
- Sum responses for combined curve

### 3. Integrate Curves into EqPage
- Wire curve path generation into existing `.curves` SVG group in `EqPage.svelte`
- Render sum curve (white `--sum-curve`, stroke-width 2.25)
- Optional: per-band curves (band-tinted `--band-dim`, stroke-width 1.25)
- Add toggle to show/hide per-band curves (already have checkbox in viz options)
- Curves update when mock band data changes

### 4. Unit Tests
- Test log frequency mapping edge cases
- Test gain-to-Y mapping
- Test curve path generation returns stable output for known filter configs
- Verify incremental SVG updates (attributes change, not tree rebuild)

## Decisions Made
- ✅ **Frontend framework:** Svelte (ADR-003)
- ✅ **Monorepo:** Single repo with workspaces
- ✅ **Testing:** Jest (backend) + Vitest (frontend) + Playwright (E2E, deferred)
- ✅ **Layout pattern:** 4-zone grid with shared right-side column (44px) for axis labels

## Open Questions
- **DSP math accuracy:** Start with basic filter response approximations or implement exact CamillaDSP formulas from the start?
- **Curve sampling rate:** How many points to sample for smooth curves without performance hit?

## Current Risks
- **SVG performance at high point count** - Need to validate rendering doesn't lag on low-power device

## Risk Mitigation Strategy (per implementation plan)
- **MVP-5 (current):** Validate SVG rendering performance before adding interaction
- **MVP-6:** Prove bidirectional sync before real uploads
- **MVP-7:** Validate Canvas performance in isolation

## Next Milestones (after MVP-5)
1. **MVP-6:** Interactive tokens + bidirectional sync to right panel controls
2. **MVP-7:** Canvas spectrum renderer with mode toggles (pre/post/off)
3. **MVP-8:** Real CamillaDSP integration + upload policy

## Context References
- **`docs/implementation-plan.md`** - Sequential MVP roadmap (NEW - authoritative)
- `docs/design-spec.md` - Implementation specification
- `docs/api-contract-camillaDSP.md` - CamillaDSP protocol contract
- `docs/reference/camillaDSP.js` - Reference implementation
- `docs/reference/filter.js` - Reference implementation
- `memory-bank/decisions.md` - ADR-001 through ADR-006
- `memory-bank/` - All context documents
