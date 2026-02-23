## [0.1.5] - 2026-03-08

### Added

- **Solo while editing** (Token Visuals group in the Visualization Options bar):
  - The new **Solo** toggle enables a temporary single-band preview mode: when selected, all other bands are temporarily removed from the DSP pipeline so you can hear the effect of one filter in isolation.
  - Muting the active soloed band also ends the session cleanly before the mute is applied.
  - When editing in solo mode all other bands become disabled (grayed out) and the soloed band is highlighted in the band grid.
  - The Solo preference (on/off) is persisted in `localStorage` alongside other viz-options.

### Fixed

- **Band mute/unmute order stability for 3+ bands** (`filterEnablement.ts`):
  - Muting a 3rd or subsequent band could record an incorrect original position in the overlay (compressed-list index compared to original-space overlay indices), causing the band-grid order to shift visibly.
  - Re-enabling bands in any order other than mute order could insert them at wrong positions (ignored still-disabled gaps ahead of the restored filter), further reordering the band grid.
  - Both `disableFilterEverywhere` and `enableFilterEverywhere` now reconstruct the full ordered name list before doing any index arithmetic, ensuring the pipeline order is always preserved regardless of how many bands are muted and in what order they are unmuted.
  - 7 regression tests added covering 3-band and 5-band mute/unmute scenarios.

### Changed

- `vizOptionsPersistence.ts`: Added `soloWhileEditing` boolean to the persisted viz-options schema (default `false`).

---

## [0.1.4] - 2026-02-22

### Added

- __Collapsible Visualization Options bar__ under the EQ plot:
  - Progressive disclosure groups with compact “collapsed” state indicators.
  - Responsive layout behavior (auto-collapse when space is constrained).
  - Scroll/drag support when the options overflow.

### Changed

- __EQ page refactor__ (no functional change intended):
  - `EqPage.svelte` decomposed into focused sub-components under `client/src/pages/eq/**`.
  - Plot math extracted into `client/src/pages/eq/plot/eqPlotMath.ts`.
  - Visualization options moved into `client/src/pages/eq/vizOptions/` with `vizLayoutManager.ts`.
  - Spectrum overlay engine factored into `client/src/pages/eq/spectrum/spectrumVizController.ts`.
  - Overlay UI extracted into `client/src/pages/eq/EqOverlays.svelte` + `client/src/state/eqUiOverlayStore.ts`.

- __Developer documentation__ updated to reflect the new EQ page structure and spectrum rendering ownership:
  - `docs/end-user/troubleshooting.md`
  - `docs/developer/frontend.md`
  - `docs/developer/data-flow.md`

---

## [0.1.3] - 2026-02-19

### Added

- __Heatmap overlay visualization__ on the EQ plot:
  - Displays spectrum as vertical orange lines with amplitude represented by opacity and brightness.
  - Provides dense, continuous frequency representation that complements the histogram analyzer curves.
  - Three mask modes: **Top** (above histogram), **Bottom** (below histogram), **Full** (no masking).
  - Heatmap settings popover (⚙ button) with:
    - **High Precision** mode: slower update rate (250ms vs 100ms), longer integration time for stable display.
    - **Advanced tuning controls**: Contrast (opacity gamma), Gain (brightness boost), Gate (noise threshold), Max Alpha (opacity ceiling).

- __Visualization options persistence__ (`localStorage`):
  - All EQ visualization settings now persist across browser sessions:
    - Spectrum mode (pre/post)
    - Smoothing mode (off, 1/12, 1/6, 1/3 octave)
    - Analyzer series toggles (STA/LTA/Peak)
    - EQ view options (per-band curves, bandwidth markers, band fill opacity)
    - Heatmap settings (enabled, mask mode, high precision, visual tuning parameters)
  - Settings validated and clamped on load (version 1 schema with migration support).
  - Storage key: `camillaEQ.vizOptions`

### Changed

- Heatmap and analyzer overlays operate independently:
  - Heatmap can be enabled without analyzer curves, and vice versa.
  - Spectrum polling runs when *either* is enabled.
  - High Precision mode adjusts both poll interval and analyzer time constants.

- Developer documentation updated:
  - `docs/developer/state-and-persistence.md`: Added Layer 4 subsection for viz-options persistence (storage keys, lifecycle, validation).
  - `docs/developer/frontend.md`: Added `vizOptionsPersistence.ts` to module directory listing.
  - End-user spectrum analyzer docs updated with heatmap usage guidance.

### Notes
- Heatmap is a real-time overlay, not a time-history spectrogram (no ring buffer or scrolling rows).
- STA/LTA/Peak analyzer series remain available alongside the heatmap.

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