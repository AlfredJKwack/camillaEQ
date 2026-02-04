# Overview

**Intended audience:** End users who want a graphical equalizer interface to control their CamillaDSP installation. 

**This document does not cover:** Developer concepts, deployment, or system administration.

---

## What CamillaEQ Does

CamillaEQ is a **web-based graphical equalizer interface** for CamillaDSP. It provides:

1. **Interactive EQ editing** with visual feedback (frequency response curves)
2. **Real-time spectrum analyzer overlay** showing audio signal levels
3. **Preset management** to save and load EQ configurations
4. **Pipeline editor** to view and modify the CamillaDSP signal processing chain

---

## What CamillaEQ Does NOT Do

- **Audio processing:** CamillaEQ does not process audio. CamillaDSP does all DSP.
- **Audio routing:** CamillaDSP handles all audio input/output.
- **FFT analysis:** The spectrum display shows filterbank outputs from CamillaDSP, not a traditional FFT.

---

## System Components

### CamillaDSP (Required)
The audio processing engine. Must be running and accessible via WebSocket.

**Two WebSocket endpoints required:**
- **Control port:** Commands (config upload, volume, state queries)
- **Spectrum port:** Spectrum data for the analyzer overlay

### CamillaEQ Server (This Application)
A Node.js web server that:
- Serves the web interface
- Persists EQ settings and presets to disk

### Your Browser
The user interface runs entirely in your browser. It connects directly to CamillaDSP's WebSocket endpoints (no backend proxying).

---

## Connection States

### Connected
Both control and spectrum WebSockets are open. Full functionality available.

### Degraded
Control WebSocket is open, spectrum WebSocket is closed.

**What works:**
- EQ editing
- Config uploads
- Volume control
- Preset save/load

**What does not work:**
- Spectrum analyzer overlay

### Error / Disconnected
Control WebSocket is closed. EQ editing is disabled until reconnected.

---

## Mental Model

```
┌─────────────────────┐
│   Your Browser      │
│  (CamillaEQ UI)     │
└──────┬──────────────┘
       │
       ├─── WebSocket ──→ CamillaDSP Control Port (commands)
       ├─── WebSocket ──→ CamillaDSP Spectrum Port (data)
       └─── HTTP ───────→ CamillaEQ Server (save presets)
```

**Data flow:**
1. You adjust EQ in the browser
2. Browser sends new config to CamillaDSP (control WebSocket)
3. CamillaDSP applies the changes and confirms
4. Browser optionally saves the config to server (preset persistence)

**Spectrum flow:**
1. Browser polls CamillaDSP every 100ms (`GetPlaybackSignalPeak` command)
2. CamillaDSP returns per-bin peak levels in dBFS
3. Browser renders levels on canvas overlay

---

## Next Steps

- [Quick Start](quick-start.md) - Install and connect CamillaEQ
- [Spectrum Analyzer](spectrum-analyzer.md) - Set up and understand the spectrum display
- [Troubleshooting](troubleshooting.md) - Fix common issues
