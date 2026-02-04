# Architecture

**Intended audience:** OSS developers contributing to or extending CamillaEQ.

**This document does not cover:** End-user setup, deployment, or system administration.

---

## High-Level Responsibilities

### CamillaEQ Server (Node.js/Fastify)
**Does:**
- Serves the web UI (static files in production)
- Persists EQ presets to disk (`/api/configs/*`)
- Provides write-through recovery cache for last-applied DSP state (`/api/state/latest`)
- Exposes version/health endpoints

**Does NOT:**
- Proxy CamillaDSP WebSocket connections
- Process audio
- Participate in the realtime spectrum path

**Key files:**
- `server/src/index.ts` - Application entry point
- `server/src/app.ts` - Fastify app setup, middleware, error handlers
- `server/src/routes/*.ts` - REST endpoint handlers
- `server/src/services/configStore.ts` - Atomic config persistence
- `server/src/services/configsLibrary.ts` - Preset library management

---

### CamillaEQ Client (Svelte/TypeScript)
**Does:**
- Connects directly to CamillaDSP via two WebSocket connections
- Renders EQ controls, spectrum overlay, pipeline editor
- Manages UI state (bands, mixer, pipeline)
- Uploads config changes to CamillaDSP with convergence model (upload → re-download → sync)
- Persists presets to backend server (best-effort)

**Does NOT:**
- Process audio
- Run DSP algorithms (except UI-only smoothing/averaging of spectrum data)
- Maintain persistent connection to backend (REST only)

**Key modules:**
- `client/src/state/` - Global stores (DSP session, EQ bands, pipeline editor)
- `client/src/lib/camillaDSP.ts` - CamillaDSP WebSocket client
- `client/src/pages/` - Top-level pages (Connect, EQ, Presets, Pipeline)
- `client/src/dsp/` - DSP math (filter response, spectrum parsing, temporal averaging)
- `client/src/ui/rendering/` - Canvas/SVG renderers

---

## Path Separation

### Realtime Path (High-Frequency)
**Frequency:** ~10 Hz (spectrum polling)

**Components:**
- Browser → CamillaDSP spectrum WebSocket: `GetPlaybackSignalPeak` command
- `client/src/dsp/spectrumParser.ts` - Parse response (dBFS array)
- `client/src/dsp/spectrumAnalyzer.ts` - Temporal averaging (STA/LTA/Peak)
- `client/src/dsp/fractionalOctaveSmoothing.ts` - Spatial smoothing
- `client/src/ui/rendering/SpectrumCanvasRenderer.ts` - Canvas redraw

**Constraints:**
- No DOM mutations
- No allocations in hot loop (reuse arrays where possible)
- Canvas-only rendering

---

### Interactive Path (User-Triggered)
**Frequency:** Human interaction (~1-10 Hz burst)

**Components:**
- User drags token / adjusts knob
- `client/src/state/eqStore.ts` - Update band state
- Debounced upload (200ms) → `camillaDSP.uploadConfig()`
- `SetConfigJson` command sent to control WebSocket
- CamillaDSP confirms → `GetConfigJson` re-download → UI convergence

**Constraints:**
- Optimistic UI updates OK (with convergence)
- Validation before upload (fail fast)
- Best-effort persistence to backend

---

## Architectural Boundaries

### Frontend ↔ CamillaDSP
**Protocol:** WebSocket (direct, no proxy)

**Control socket:**
- Commands: `GetConfigJson`, `SetConfigJson`, `GetVolume`, `SetVolume`, `GetVersion`, `GetState`
- Used for: Config management, volume control, metadata queries

**Spectrum socket:**
- Commands: `GetPlaybackSignalPeak`
- Used for: Real-time spectrum data polling

**Rationale for two sockets:**
- Separation of concerns: config operations don't block spectrum polling
- Allows degraded mode (control works, spectrum unavailable)

---

### Frontend ↔ Backend
**Protocol:** HTTP REST

**Endpoints:**
- `GET /api/configs` - List presets
- `GET /api/configs/:id` - Load preset
- `PUT /api/configs/:id` - Save preset
- `GET /api/state/latest` - Get last-applied DSP state
- `PUT /api/state/latest` - Save last-applied DSP state
- `GET /api/version` - Get server version
- `GET /health` - Health check

**Rationale:**
- Backend is not in the realtime path
- REST is sufficient for non-realtime operations
- Presets are human-triggered, infrequent

---

## Module Responsibilities

### State Management (`client/src/state/`)

**dspStore.ts**
- Owns singleton `CamillaDSP` instance
- Connection lifecycle (connect, disconnect, auto-reconnect)
- Global DSP config (`dspConfig` store)
- Volume control (debounced `SetVolume`)
- Failure tracking (last 50 failures for diagnostics)

**eqStore.ts**
- Owns EQ band UI state (frequency, gain, Q, type, enabled)
- Single source of truth for EQ editor
- Debounced upload (200ms) with convergence:
  - Upload → `SetConfigJson` → `GetConfigJson` → extract bands → sync UI
- Best-effort persistence to `/api/state/latest`

**pipelineEditor.ts**
- Pipeline upload helper (validation + debounced upload)
- Status callback for UI feedback
- Re-initializes `eqStore` after pipeline changes (sync band order)

---

### DSP Client (`client/src/lib/camillaDSP.ts`)

**Responsibilities:**
- WebSocket lifecycle management (connect, disconnect)
- Per-socket request queues (`SocketRequestQueue`)
- Timeout protection (5s control, 2s spectrum)
- Config upload/download with validation
- Lifecycle event callbacks (`onSocketLifecycleEvent`, `onDspSuccess`, `onDspFailure`)

**Key methods:**
- `connect(server, controlPort, spectrumPort)` - Establish both sockets
- `uploadConfig()` - `SetConfigJson` + `GetConfigJson` re-download
- `getSpectrumData()` - `GetPlaybackSignalPeak` on spectrum socket
- `validateConfig()` - Check pipeline references exist

---

### DSP Math (`client/src/dsp/`)

**filterResponse.ts**
- RBJ biquad filter response calculation (7 filter types)
- Magnitude response at N frequency points

**spectrumParser.ts**
- Parse `GetPlaybackSignalPeak` response (array of dBFS values)
- Validate: must be ≥3 numeric values (rejects stereo-only)

**spectrumAnalyzer.ts**
- Temporal averaging in dB domain:
  - STA (short-term average, τ=0.8s)
  - LTA (long-term average, τ=8s)
  - Peak hold (hold=2s, decay=12 dB/s)

**fractionalOctaveSmoothing.ts**
- Spatial smoothing (1/12, 1/6, 1/3 octave)
- Per-bin weighted average across neighboring bins

---

### Rendering (`client/src/ui/rendering/`)

**EqSvgRenderer.ts**
- Generates SVG path data for EQ curves
- Sum curve + per-band curves
- Focus mode visualization (band fill, bandwidth markers)

**SpectrumCanvasRenderer.ts**
- Canvas-based spectrum rendering (~10 Hz)
- Pluggable layer architecture (`CanvasVisualizationLayer`)
- DPR-aware scaling
- Stale data detection (fade to 30% if no data >500ms)

**canvasLayers/SpectrumAnalyzerLayer.ts**
- Renders STA/LTA/Peak series as lines
- Color-coded for pre/post modes
- Opacity and line width per series

---

### Backend Services (`server/src/services/`)

**configStore.ts**
- Atomic file writes (write temp → rename)
- Read/write single config file (`data/config.json` or `data/latest_dsp_state.json`)
- Size limits (1MB max)
- JSON validation

**configsLibrary.ts**
- Preset library management (`data/configs/*.json`)
- List/get/save operations
- Auto-generates kebab-case IDs from filenames
- Reads `configName` from JSON for display

**mockCamillaDSP.ts**
- Fake CamillaDSP instance for testing
- Returns realistic spectrum data (256 bins)
- Implements control + spectrum WebSocket protocol

---

## Data Models

### CamillaDSP Config (Canonical Format)
**Schema:** `client/src/lib/camillaSchema.ts`

**Shape:**
```typescript
{
  devices: { samplerate, chunksize, capture, playback },
  filters: Record<string, FilterDefinition>,
  mixers: Record<string, MixerDefinition>,
  processors: Record<string, ProcessorDefinition>,
  pipeline: PipelineStep[]
}
```

**Pipeline steps:**
- `{ type: 'Filter', channels: number[], names: string[] }`
- `{ type: 'Mixer', name: string }`
- `{ type: 'Processor', name: string }` (or custom type)

---

### Pipeline Config (On-Disk Preset Format)
**Schema:** `client/src/lib/pipelineConfigMapping.ts`

**Legacy format (EQ-only):**
```typescript
{
  configName: string,
  filterArray: Array<{ FilterName: { freq, gain, q, type } }>,
  accessKey?: string
}
```

**Extended format (full pipeline):**
```typescript
{
  configName: string,
  filterArray: [], // can be empty
  filters: Record<string, any>,
  mixers: Record<string, any>,
  processors: Record<string, any>,
  pipeline: PipelineStep[],
  title?: string,
  description?: string
}
```

**Note:** Devices are **never stored** in presets. They always come from the current DSP config or a template.

---

## Extension Points

For detailed extension guidance, see [extension-points.md](extension-points.md).

**Safe extensions:**
- New visualization layers (`CanvasVisualizationLayer` interface)
- New filter types (extend `knownTypes.ts` + parameter editors)
- New pipeline block operations (follow `pipelineBlockEdit.ts` patterns)

**Unsafe extensions:**
- Backend proxying of spectrum WebSocket (breaks degraded mode)
- DOM mutations in spectrum rendering loop (causes jank)
- Skipping convergence step after config uploads (causes UI/DSP drift)

---

## Next Steps

- [Runtime Topology](runtime-topology.md) - Process diagram and socket inventory
- [Data Flow](data-flow.md) - Control and data flow diagrams
- [Frontend](frontend.md) - Detailed client architecture
- [Backend](backend.md) - Detailed server architecture
- [State and Persistence](state-and-persistence.md) - State ownership model
- [Extension Points](extension-points.md) - Safe extension patterns
