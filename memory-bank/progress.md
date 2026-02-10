# Project Progress

## Completed Milestones
- [x] **M0: Memory bank initialized** (2026-01-22)
- [x] **MVP-0 through MVP-26** (2026-01-22 through 2026-02-03)
  - See detailed history in git commits and previous memory-bank versions
  - Full EQ editor, Pipeline editor, spectrum analyzer, presets, DSP info display

- [x] **Documentation Overhaul (Persona-Based)** (2026-02-04)
  - Created production-ready documentation for three distinct personas
  - End User: overview, quick-start, spectrum-analyzer, troubleshooting
  - Developer: architecture, runtime-topology, data-flow, frontend, backend, state-and-persistence, extension-points
  - Power User: deployment-models, linux-services, headless-sbc, recovery-and-backups
  - Updated README.md with persona-specific navigation
  - All documentation reflects as-built implementation (not aspirational)

- [x] **Test Suite Fixes** (2026-02-04)
  - Fixed camillaEqMapping bypassed filter block handling
    - Bypassed Filter steps now correctly excluded from EQ page (user cannot unmute individual filters in bypassed block)
  - Fixed knownTypes Delay filter test
    - Now correctly returns false for non-Biquad filters in isKnownEditableFilter()
  - Updated processor parameter rounding to 2 decimals consistently
    - Changed from 1-decimal to 2-decimal precision for attack/release/threshold/factor/attenuation
    - Preserves user precision (e.g., 0.05s attack time)
  - All 385 tests passing (33 test files, 2 skipped)

- [x] **MVP-27: AutoEQ Library Integration** (2026-02-11)
  - Integrated 800+ headphone/IEM EQ profiles from AutoEQ database
  - Core implementation:
    - EqPresetV1 schema with device metadata (manufacturer, model, variant, category)
    - Runtime conversion: EqPresetV1 → PipelineConfig for client compatibility
    - Read-only enforcement: 403 error when attempting to overwrite AutoEQ presets
    - Stored in `server/data/configs/autoeq/<category>/` (committed to repo)
  - Performance optimization:
    - Manifest file (`autoeq/index.json`) with pre-computed metadata
    - Fast-path loading: O(1) manifest read vs O(n) recursive filesystem scan
    - Fallback to full scan if manifest missing/invalid
  - Client UI enhancements:
    - AutoEQ toggle button with count display
    - Progressive rendering: 200-item batches via requestAnimationFrame
    - Keyboard navigation with auto-expand beyond rendered items
    - AutoEQ badge visual indicator
    - CSS-only hover (no mouseenter handlers)
  - Import tooling:
    - `tools/import-autoeq.ts`: Build-time script with sparse git checkout
    - `tools/autoeqParser.ts`: ParametricEQ.txt → EqPresetV1 converter
    - Deterministic output: sorted, normalized, idempotent
    - Automatic manifest generation during import
  - Test coverage:
    - Server: 77 tests (manifest fast-path, fallback, read-only, conversion)
    - Client: Progressive rendering, AutoEQ toggle, keyboard nav
    - Tools: 17 tests (parser, manifest generation)
    - All tests passing (240+ total)
  - Documentation updates:
    - Updated 7 developer + power-user docs with AutoEQ details
    - API response shapes, env vars, backup procedures, disk usage
    - All docs now reflect MVP-27 implementation

## Current Status (2026-02-11)
**Phase:** MVP-27 complete with full test coverage and documentation

**Latest work:**
- AutoEQ preset library integrated with manifest optimization
- Read-only enforcement and runtime format conversion
- Progressive UI rendering for large preset lists
- Comprehensive test coverage (server, client, tools)
- Documentation updated across all personas

## Known Issues
None at this stage.

## Backlog
Items deferred to future iterations:
- Multi-channel pipeline editor enhancements
- Advanced filter types beyond core set
- Client-side log forwarding to backend
- Accessibility audit and improvements
- Mobile/touch optimization
- Performance profiling tools
- AutoEQ library updates (re-run import script when AutoEQ releases new data)

## Notes
All work must align with the core constraints from design specification:
- LAN-only, no cloud dependencies
- Optimized for low-power devices (Pi Zero-class hardware)
- Deterministic, predictable behavior
- Visual refinement handled browser-side (Canvas/SVG)
- Backend is file store, NOT source of truth (CamillaDSP service is authoritative)
- Browser connects directly to CamillaDSP WebSocket service (no proxying)
