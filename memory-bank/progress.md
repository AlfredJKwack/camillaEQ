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

- [x] **v0.1.1 Documentation + Deployment Features** (2026-02-07/08)
  - **Backend additions:**
    - `GET /api/settings` endpoint (returns CamillaDSP connection defaults from env vars)
    - `SERVER_READ_ONLY=true` mode (blocks write operations to `/api/*`)
    - Environment variables: `CAMILLA_CONTROL_WS_URL`, `CAMILLA_SPECTRUM_WS_URL`
  - **Hosted demo:**
    - Deployed at `http://camillaeq.his.house/#/connect`
    - Preconfigured mock CamillaDSP (control + spectrum)
    - Zero-config connection (just click Connect)
  - **Documentation updates:**
    - README: "Try It in Your Browser" section at top, restructured "Try It Now"
    - End-user docs: connection guidance, read-only mode troubleshooting
    - Developer docs: `/api/settings` API docs, env var documentation
    - Power-user docs: public deployment guidance, read-only configuration
  - **Tools:**
    - CamillaDSP device configuration wizard documented (`tools/README.md`)

## Current Status (2026-02-08)
**Phase:** v0.1.1 documentation updates complete

**Latest work:**
- Hosted demo integration (`camillaeq.his.house/#/connect`)
- Connection defaults via `/api/settings` endpoint
- Read-only server mode for public deployments
- Documentation updates across all three personas (end-user, developer, power-user)
- README restructured with hosted demo quick-start
- CamillaDSP device wizard tool documented

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

## Notes
All work must align with the core constraints from design specification:
- LAN-only, no cloud dependencies
- Optimized for low-power devices (Pi Zero-class hardware)
- Deterministic, predictable behavior
- Visual refinement handled browser-side (Canvas/SVG)
- Backend is file store, NOT source of truth (CamillaDSP service is authoritative)
- Browser connects directly to CamillaDSP WebSocket service (no proxying)
