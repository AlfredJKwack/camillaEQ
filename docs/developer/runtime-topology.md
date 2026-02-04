# Runtime Topology

**Intended audience:** OSS developers needing to understand the runtime architecture.

**This document does not cover:** Build-time architecture or deployment.

---

## Process Diagram

```
┌────────────────────────────────────────────────────────────┐
│                         Browser                            │
│  ┌───────────────────────────────────────────────────────┐ │
│  │         CamillaEQ Frontend (Svelte/TS)                │ │
│  │                                                       │ │
│  │  ┌──────────┐  ┌──────────┐  ┌────────────────────┐   │ │
│  │  │ EqPage   │  │Pipeline  │  │ ConnectPage        │   │ │
│  │  │          │  │Page      │  │                    │   │ │
│  │  └────┬─────┘  └────┬─────┘  └──────┬─────────────┘   │ │
│  │       │             │                │                │ │
│  │       └─────────────┴────────────────┘                │ │
│  │                     │                                 │ │
│  │              ┌──────▼────────┐                        │ │
│  │              │   dspStore    │                        │ │
│  │              │   eqStore     │                        │ │
│  │              └──────┬────────┘                        │ │
│  │                     │                                 │ │
│  │              ┌──────▼────────┐                        │ │
│  │              │ CamillaDSP.ts │                        │ │
│  │              │  (WS client)  │                        │ │
│  │              └───┬───────┬───┘                        │ │
│  └──────────────────│───────│────────────────────────────┘ │
│                     │       │                              │
│               ┌─────┘       └─────┐                        │
│               │  WebSocket        │  WebSocket             │
│               │  (control)        │  (spectrum)            │
└───────────────┼───────────────────┼────────────────────────┘
                │                   │
                │                   │
         ┌──────▼─────┐      ┌──────▼─────┐
         │ CamillaDSP │      │ CamillaDSP │
         │  :1234     │      │  :1235     │
         │ (control)  │      │ (spectrum) │
         └────────────┘      └────────────┘
              │
              │ Audio I/O
              ▼
         ┌────────────┐
         │ ALSA/JACK/ │
         │ PulseAudio │
         └────────────┘


         Separate process (HTTP only):

         ┌────────────────────────────┐
         │  CamillaEQ Backend Server  │
         │      (Node.js/Fastify)     │
         │                            │
         │  /api/configs/*            │
         │  /api/state/latest         │
         │  /health                   │
         └────────────────────────────┘
                ▲
                │ HTTP REST
                │
         ┌──────┴─────────┐
         │    Browser     │
         │  (fetch API)   │
         └────────────────┘
```

---

## Socket Inventory

### Control WebSocket (Browser → CamillaDSP :1234)
**Purpose:** Config management, volume control, device queries

**Commands sent:**
- `GetVersion` - DSP version string
- `GetState` - DSP state (Running, Paused, etc.)
- `GetConfigJson` - Download current config
- `SetConfigJson` - Upload new config
- `GetVolume` - Current volume level
- `SetVolume` - Change volume
- `GetCaptureDevices` - List capture devices
- `GetPlaybackDevices` - List playback devices

**Response format:**
```json
{
  "GetVersion": {
    "result": "Ok",
    "value": "2.0.3"
  }
}
```

**Lifecycle:**
- Opened on user clicking "Connect"
- Closed on disconnect or navigation away
- Auto-reconnect if enabled (5 attempts, 2s/4s/8s/16s/32s backoff)

**Request serialization:**
- One request in-flight at a time per socket (`SocketRequestQueue`)
- Timeout: 5 seconds
- Abort on disconnect (rejects all pending/in-flight promises)

---

### Spectrum WebSocket (Browser → CamillaDSP :1235)
**Purpose:** Real-time spectrum data polling

**Commands sent:**
- `GetPlaybackSignalPeak` - Get current spectrum bins (dBFS array)

**Response format:**
```json
{
  "GetPlaybackSignalPeak": {
    "result": "Ok",
    "value": [-80.5, -76.2, -72.1, ...]
  }
}
```

**Polling rate:** ~10 Hz (100ms interval)

**Lifecycle:**
- Opened on user clicking "Connect"
- Optional (degraded mode if unavailable)
- No auto-reconnect (control socket drives reconnect)

**Request serialization:**
- One request in-flight at a time (`SocketRequestQueue`)
- Timeout: 2 seconds (shorter than control)
- Polling stops if socket errors

---

### Backend HTTP API (Browser → CamillaEQ Server :3000)
**Purpose:** Preset library, recovery cache

**Endpoints:**

`GET /api/configs`
- Returns list of presets
- Response: `{ configs: [{ id, name, createdAt, updatedAt }, ...] }`

`GET /api/configs/:id`
- Returns preset JSON (pipeline-config format)
- Response: `PipelineConfig` object

`PUT /api/configs/:id`
- Saves preset to `server/data/configs/:id.json`
- Body: `PipelineConfig` object
- Creates parent directories if needed

`GET /api/state/latest`
- Returns last-applied DSP state (full CamillaDSP config)
- Used for recovery on reconnect

`PUT /api/state/latest`
- Saves last-applied DSP state to `server/data/latest_dsp_state.json`
- Body: `CamillaDSPConfig` object

`GET /api/version`
- Returns backend version
- Response: `{ version: string }`

`GET /health`
- Health check endpoint
- Response: `{ status: "ok" }`

---

## Why Two WebSocket Connections?

### Separation of Concerns
- Config operations (SetConfigJson) can take 100-500ms
- Spectrum polling needs consistent 10 Hz rate
- Without separation, config uploads would block spectrum updates

### Degraded Mode Support
- If spectrum socket fails, EQ editing still works
- UI shows "Degraded (Spectrum Unavailable)" status
- User can continue using EQ, presets, volume control

### Independent Lifecycle
- Control socket drives reconnection logic
- Spectrum socket is optional enhancement
- Control socket availability determines overall "connected" state

---

## Why Backend Is Not a Proxy

### Design Decision
**CamillaEQ server does NOT proxy WebSocket connections.**

**Rationale:**
1. **Simplicity:** Direct browser-to-DSP connections eliminate a network hop
2. **Failure isolation:** Backend crashes don't affect DSP connection
3. **Latency:** No additional round-trip for spectrum polling
4. **Scalability:** Backend doesn't handle high-frequency spectrum traffic

**Tradeoff:**
- Browser must have network access to CamillaDSP
- CORS not applicable (WebSocket, not HTTP)
- Works fine on LAN (primary deployment)

---

## Process Relationships

### Development Mode
**Two processes:**
1. Vite dev server (port 5173) - Frontend with hot reload
2. Node.js backend (port 3000) - API + static file fallback

**Frontend proxies API calls to backend** (configured in `vite.config.ts`).

---

### Production Mode
**One process:**
- Node.js backend (port 3000) - API + serves built frontend

**Frontend is pre-built** (`client/dist/`) and served as static files.

---

## Network Requirements

### Browser → CamillaDSP
- WebSocket access to CamillaDSP ports (default: 1234, 1235)
- Typically same LAN subnet
- No TLS (plaintext WebSocket)

### Browser → CamillaEQ Server
- HTTP access to backend port (default: 3000)
- Can be different machine than CamillaDSP
- No TLS in default config (add via reverse proxy if needed)

---

## Failure Modes

### CamillaDSP Control Socket Down
- Connection status: "Error" (red)
- No EQ editing, no presets, no volume control
- Auto-reconnect attempts (if enabled)

### CamillaDSP Spectrum Socket Down
- Connection status: "Degraded" (yellow)
- EQ editing works, spectrum overlay disabled
- No auto-reconnect (user must reconnect manually)

### Backend Server Down
- Presets page fails to load list
- Save preset operations fail
- EQ editing still works (DSP connection independent)

### All Systems Down
- UI loads (if cached)
- Shows "Not Connected" state
- User can retry connection

---

## Next Steps

- [Data Flow](data-flow.md) - Control and data flow diagrams
- [Architecture](architecture.md) - Module responsibilities
- [Frontend](frontend.md) - Client architecture details
- [Backend](backend.md) - Server architecture details
