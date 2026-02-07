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