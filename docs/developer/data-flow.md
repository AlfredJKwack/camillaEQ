# Data Flow

**Intended audience:** OSS developers understanding control and data flow.

**This document does not cover:** UI implementation details.

---

## Connection Flow

```
User clicks "Connect"
    │
    ▼
dspStore.connect(server, controlPort, spectrumPort)
    │
    ├─► Create new CamillaDSP instance
    │
    ├─► dspInstance.connect()
    │   │
    │   ├─► Open control WebSocket (ws://server:controlPort)
    │   │   └─► Wait for 'open' event (max 5s timeout)
    │   │
    │   └─► Open spectrum WebSocket (ws://server:spectrumPort)
    │       └─► Wait for 'open' event (max 5s timeout, optional)
    │
    ├─► If both sockets open:
    │   │
    │   ├─► Send GetVersion command
    │   ├─► Send GetConfigJson command
    │   │   └─► Store config in dspInstance.config
    │   │
    │   └─► Initialize eqStore from downloaded config
    │       └─► Extract bands via extractEqBandsFromConfig()
    │
    ├─► If control opens, spectrum fails:
    │   └─► Enter "degraded" mode (EQ works, no spectrum)
    │
    └─► If control fails:
        └─► Connection error, optionally auto-reconnect
```

---

## Config Download Flow

```
dspInstance.uploadConfig() or connect()
    │
    ▼
Send GetConfigJson command
    │
    ▼
Receive CamillaDSP config JSON
    │
    ├─► Normalize pipeline steps (v2/v3 compat)
    │   └─► normalizePipelineStep() for each step
    │
    ├─► Store in dspInstance.config
    │
    └─► Return config to caller
        │
        └─► Caller updates UI state (eqStore, dspConfig store)
```

---

## EQ Edit Flow (Interactive Path)

```
User drags token / adjusts knob
    │
    ▼
Update eqStore band state (optimistic)
    │
    ▼
Debounce timer starts (200ms)
    │
    │ (User continues editing → timer resets)
    │
    ▼
Timer expires → trigger upload
    │
    ▼
eqStore.uploadToDS() (convergence model)
    │
    ├─► Build CamillaDSP config from bands
    │   │
    │   ├─► Get current DSP config as template
    │   ├─► Replace filter definitions (Biquad)
    │   ├─► Replace pipeline Filter step names
    │   └─► Preserve mixers, processors, devices
    │
    ├─► Validate config
    │   └─► dspInstance.validateConfig()
    │       └─► Check all pipeline refs exist
    │
    ├─► Send SetConfigJson command
    │   └─► Wait for "Ok" response
    │
    ├─► Send GetConfigJson command (re-download)
    │   └─► Get confirmed config from DSP
    │
    ├─► Extract bands from confirmed config
    │   └─► extractEqBandsFromConfig()
    │
    ├─► Update eqStore with confirmed bands
    │   └─► Preserve UI-only state (focused, dragging)
    │
    └─► Best-effort persistence to backend
        └─► PUT /api/state/latest (non-fatal if fails)
```

**Convergence invariant:**
- UI state always reflects what DSP confirmed, not what we sent
- If DSP rejects/modifies config, UI syncs to DSP truth
- If upload fails, UI reverts to last-known-good (via re-download)

---

## Spectrum Data Flow (Realtime Path)

```
Spectrum polling loop (~10 Hz)
    │
    ▼
dspInstance.getSpectrumData()
    │
    ├─► Send GetPlaybackSignalPeak command
    │   └─► Wait for response (max 2s timeout)
    │
    ▼
Receive dBFS array from DSP
    │
    ├─► Parse via parseSpectrumData()
    │   │
    │   ├─► Validate: must be array of ≥3 numbers
    │   └─► Return { bins, timestamp }
    │
    ▼
SpectrumAnalyzer.update(bins)
    │
    ├─► Update temporal averages (in dB domain)
    │   │
    │   ├─► STA: exponential moving average (τ=0.8s)
    │   ├─► LTA: exponential moving average (τ=8s)
    │   └─► Peak: hold for 2s, decay at 12 dB/s
    │
    ▼
EqPlotArea.svelte drives canvas rendering
    │
    ├─► onMount(): createSpectrumVizController({ canvas, getDsp, getPlotSize, ... })
    │
    ├─► reactive config updates:
    │   - spectrumMode (pre/post)
    │   - analyzer visibility (STA/LTA/Peak)
    │   - smoothingMode
    │   - heatmap config
    │
    └─► controller polling loop (setInterval)
        │
        ├─► Check if data is stale (>500ms old)
        │   └─► If stale, fade to 30% opacity
        │
        ├─► Apply fractional-octave smoothing (if enabled)
        │   └─► Per-bin weighted average across neighbors
        │
        ├─► Render enabled analyzer/heatmap layers
        │   ├─► SpectrumAnalyzerLayer.render() (STA/LTA/Peak)
        │   └─► SpectrumHeatmapLayer.render() (optional)
        │
        └─► SpectrumCanvasRenderer.render()
```

**No-allocation rule:**
- Reuse spectrum analyzer state arrays
- Reuse smoothing buffers
- No object creation in 10 Hz loop

---

## Preset Save Flow

```
User clicks "Save Current" on Presets page
    │
    ▼
Get current DSP config from dspStore
    │
    ▼
Convert to pipeline-config format
    │
    ├─► Extract filters (Biquad only)
    ├─► Extract mixers
    ├─► Extract processors
    ├─► Extract pipeline
    └─► Omit devices (never persisted)
    │
    ▼
User enters preset name
    │
    ▼
PUT /api/configs/:id
    │
    ├─► Generate kebab-case ID from name
    ├─► Server checks: is ID read-only?
    │   ├─► If AutoEQ preset: 403 Forbidden
    │   └─► If user preset or new: proceed
    ├─► Write to server/data/configs/:id.json
    │   └─► Atomic write (temp file → rename)
    │
    └─► Return { success: true }
        │
        └─► Refresh preset list in UI
```

---

## Preset Load Flow

```
User clicks "Load" on preset
    │
    ▼
GET /api/configs/:id
    │
    ├─► Read from server/data/configs/:id.json
    └─► Return pipeline-config JSON
    │
    ▼
Convert pipeline-config → CamillaDSP config
    │
    ├─► If extended format (has pipeline):
    │   └─► Use filters/mixers/processors/pipeline directly
    │
    ├─► If legacy format (filterArray only):
    │   └─► Convert filterArray → filters + pipeline
    │
    └─► Merge with current DSP config devices
        └─► Devices always come from current config (never stored)
    │
    ▼
Upload to DSP (same as EQ edit flow)
    │
    ├─► SetConfigJson
    ├─► GetConfigJson (re-download)
    ├─► Initialize eqStore from confirmed config
    └─► Persist to /api/state/latest
```

---

## Pipeline Reorder Flow

```
User drags pipeline block
    │
    ▼
PipelinePage detects reorder
    │
    ├─► Take snapshot of current config
    │
    ├─► Apply reorder via reorderPipeline()
    │   │
    │   ├─► Remove step from old index
    │   ├─► Insert step at new index
    │   └─► Update disabled filter overlay keys
    │
    ├─► Validate new config
    │   └─► dspInstance.validateConfig()
    │
    ├─► Optimistically update dspConfig store
    │
    ├─► Trigger debounced upload (200ms)
    │   │
    │   ├─► SetConfigJson
    │   ├─► GetConfigJson (re-download)
    │   ├─► Update dspConfig store with confirmed config
    │   ├─► Re-initialize eqStore (sync band order numbers)
    │   └─► Persist to /api/state/latest
    │
    └─► On error: revert to snapshot
```

---

## Volume Control Flow

```
User adjusts volume slider
    │
    ▼
dspStore.setVolume(newVolume) (optimistic update)
    │
    ▼
Debounce timer starts (100ms)
    │
    ▼
Timer expires → send SetVolume command
    │
    ├─► Send SetVolume command to control socket
    │   └─► Wait for "Ok" response
    │
    └─► On error: revert to last-known-good
        └─► Send GetVolume to re-sync
```

---

## Auto-Reconnect Flow

```
Connection lost (socket 'close' event)
    │
    ▼
dspStore detects disconnection
    │
    ├─► Update connectionState to 'error'
    │
    └─► If autoReconnect enabled:
        │
        ├─► Attempt #1 (after 2s delay)
        │   └─► connect()
        │
        ├─► If fails, attempt #2 (after 4s delay)
        │   └─► connect()
        │
        ├─► If fails, attempt #3 (after 8s delay)
        │   └─► connect()
        │
        ├─► If fails, attempt #4 (after 16s delay)
        │   └─► connect()
        │
        └─► If fails, attempt #5 (after 32s delay)
            └─► connect()
            └─► If fails, give up (user must retry)
```

---

## Failure Recovery Strategies

### Upload Failure (SetConfigJson rejected)
1. Log failure to dspStore.failures
2. Attempt GetConfigJson to sync UI to DSP truth
3. If GetConfigJson fails, keep optimistic UI state
4. Show error banner to user

### Download Failure (GetConfigJson timeout)
1. Keep existing UI state (optimistic)
2. Show warning to user
3. Next upload will attempt re-download

### Persistence Failure (PUT /api/state/latest fails)
1. Log warning to console
2. Continue (non-fatal)
3. UI remains functional
4. Recovery cache may be stale on next reconnect

### Spectrum Socket Failure
1. Enter degraded mode (control works, no spectrum)
2. Stop spectrum polling loop
3. Hide spectrum overlay
4. User can continue EQ editing

---

## State Synchronization Points

### After Config Upload
- DSP config re-downloaded from CamillaDSP
- eqStore re-initialized from confirmed config
- Backend persistence attempted (best-effort)

### After Preset Load
- Config uploaded to CamillaDSP
- DSP config re-downloaded for confirmation
- eqStore re-initialized
- Backend persistence attempted

### After Pipeline Edit
- Config uploaded to CamillaDSP
- DSP config re-downloaded
- eqStore re-initialized (sync band order)
- Backend persistence attempted

**Invariant:** UI always reflects DSP ground truth after convergence.

---

## Next Steps

- [State and Persistence](state-and-persistence.md) - Detailed state ownership model
- [Frontend](frontend.md) - Client implementation details
- [Backend](backend.md) - Server implementation details
- [Runtime Topology](runtime-topology.md) - Process diagram
