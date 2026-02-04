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