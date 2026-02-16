## [0.1.2] - 2026-02-16

### Added

- __AutoEQ import tooling (build-time)__ via `tools/import-autoeq.ts`, including a parser + manifest generation and supporting tests. This enables importing AutoEQ profiles into the local `data/configs` library.
- AutoEQ preset/schema support (`shared/eqPresetSchema.ts`) and server-side library enhancements to detect and list imported AutoEQ configurations.
- __Ready-to-run release artifacts__ (single-process runtime): GitHub Actions workflow (`.github/workflows/release.yml`) builds server + UI and publishes a runtime-only `.tar.gz` on version tags (`v*`).
- Local release assembly + validation script: `npm run release:local` (mirrors CI build/release steps, generates runtime-only package.json/lock, and runs a smoke test).
- Runtime Node.js version enforcement (`>=18.0.0 <25.0.0`) with dedicated unit tests.

### Changed

- __Build pipeline__ now produces a deterministic runtime layout:

  - build client → `client/dist`
  - copy UI assets → `server/dist/client`
  - build server → `server/dist/index.js`
  - production server serves the UI from the compiled output.

- Client test script now defaults to non-watch mode (`vitest run`) to avoid hanging CI.

- Deployment and architecture docs updated to reflect the new release/runtime model and AutoEQ import behavior.

### Fixed

- Release/runtime startup: UI is served correctly from the single Node process (static serving + SPA fallback) and API routes are protected from static shadowing.

---

## [0.1.1] - 2026-02-07

### Added
- Public-deployment support via systemd + environment-file configuration.
- Read-only server mode (`SERVER_READ_ONLY=true`) that blocks write operations to `/api/*` for safer public exposure.
- `GET /api/settings` endpoint to expose CamillaDSP WebSocket defaults (`CAMILLA_CONTROL_WS_URL`, `CAMILLA_SPECTRUM_WS_URL`).
- Connect page auto-defaults to server-provided WS settings when localStorage is empty.
- Caddy reverse-proxy examples, including HTTP-only mode (for `ws://` mixed-content compatibility) and read-only deployment guidance.
- CamillaDSP device configuration wizard (`tools/camilladsp-device-wizard.mjs`) for macOS (CoreAudio) and Linux (ALSA), with optional hardware probing and `camilladsp --check` validation.
- New favicon + additional branding/demo assets.

### Changed
- Development env loading: server now loads `server/.env` (preferred) or repo-root `.env` when `NODE_ENV != production`.
- Updated default/local-dev connection settings and minor navigation/Connect-page UX refinements.

### Fixed
- CI flake: Vitest `EADDRINUSE` port collisions by switching WebSocket test servers to ephemeral ports.
- Client build packaging: static "eye candy" assets now reliably included in production build output.
- systemd docs/service/env examples aligned and clarified.

---

## [0.1.0] - 2026-02-04

### Added
- Interactive EQ editor with draggable tokens and live frequency-response rendering.
- Support for 7 biquad filter types: Peaking, LowShelf, HighShelf, HighPass, LowPass, BandPass, Notch.
- Spectrum analyzer overlay (~10 Hz) with Pre/Post source selection, STA/LTA averaging, peak hold, and fractional-octave smoothing.
- Pipeline editor for viewing/editing Filter/Mixer/Processor steps, including filter reordering and mixer routing edits with validation.
- Preset library (server-side persistence) and latest-state recovery cache.
- Connection lifecycle model (connected/degraded/error), auto-reconnect with backoff, and diagnostics export.
- Persona-based documentation under /docs (end-user, developer, power-user).

### Notes
- Browser connects directly to CamillaDSP WebSockets (control + spectrum). The CamillaEQ backend does not proxy DSP WebSockets.
- Spectrum analyzer is not an FFT; it displays filterbank-derived peak levels from CamillaDSP.

### Known limitations
- No authentication (trusted LAN only).
- No multi-tab coordination (last write wins).