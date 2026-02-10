# State and Persistence

**Intended audience:** OSS developers understanding state ownership and persistence model.

**This document does not cover:** UI implementation or deployment.

---

## State Ownership Model

### Single Source of Truth Principle

**CamillaDSP is the ground truth for audio configuration.**

All UI state must eventually converge to what CamillaDSP confirms.

---

## State Layers

### Layer 1: CamillaDSP (Ground Truth)
**Location:** CamillaDSP process memory + active audio pipeline

**State:**
- Device configuration (capture/playback)
- Filter definitions (all types)
- Mixer definitions
- Processor definitions
- Pipeline routing
- Volume level
- Spectrum data (real-time)

**Persistence:** CamillaDSP responsibility (not CamillaEQ)

**Access:** WebSocket API only

---

### Layer 2: dspStore (Runtime Session)
**Location:** `client/src/state/dspStore.ts` (browser memory)

**State:**
- CamillaDSP instance (singleton)
- Connection state (connecting/connected/degraded/error)
- DSP config (`dspConfig` store) - downloaded from DSP
- Volume level (synced with DSP)
- Failure log (last 50 failures)

**Lifecycle:** Lives for browser session

**Persistence:** None (ephemeral)

**Convergence:**
- Downloads config on connect
- Re-downloads after every upload (confirms DSP accepted changes)

---

### Layer 3: eqStore (EQ Editor State)
**Location:** `client/src/state/eqStore.ts` (browser memory)

**State:**
- EQ bands array (frequency, gain, Q, type, enabled)
- Focused band (UI-only)
- Dragging state (UI-only)

**Lifecycle:** Re-initialized on:
- Connection established
- Preset loaded
- Pipeline reordered (band order numbers change)

**Persistence:** None (derived from DSP config)

**Convergence:**
- Extracts bands from DSP config via `extractEqBandsFromConfig()`
- After upload, re-downloads DSP config and re-extracts
- Preserves UI-only state (focused, dragging) across re-initialization

---

### Layer 4: localStorage (Browser Persistence)
**Location:** Browser localStorage API

**State:**
- DSP connection settings (server, ports)
- Auto-reconnect preference
- Disabled filters overlay (per-step disabled filter indices)

**Lifecycle:** Survives browser reload, cleared by user/browser

**Persistence:** Automatic (browser storage)

**Use cases:**
- Auto-reconnect on page load
- Restore disabled filter state across sessions

**Note:** This is UI-only state, not authoritative for DSP config

---

### Layer 5: Backend (Recovery Cache)
**Location:** `server/data/latest_dsp_state.json`

**State:**
- Last-applied full CamillaDSP config

**Lifecycle:** Updated on every successful config upload

**Persistence:** Disk (survives server restart)

**Use cases:**
- Recovery after browser crash/reload
- Avoid starting from empty config
- Debugging (inspect last-known-good config)

**Convergence:**
- Write-through on upload (best-effort)
- Read on reconnect (if DSP config empty)

---

### Layer 6: Backend (Preset Library)
**Location:** `server/data/configs/*.json`

**State:**
- User-saved presets (pipeline-config format)
- AutoEQ library presets (EqPresetV1 format, read-only)

**Lifecycle:**
- User presets: explicit user action (save/delete)
- AutoEQ presets: imported via `npm run import:autoeq` (build-time only)

**Persistence:** Disk (survives server restart)

**Use cases:**
- Load known-good configurations
- Share configurations across devices
- Access professional EQ profiles from AutoEQ database

**AutoEQ Library:**
- Located in `server/data/configs/autoeq/<category>/`
- Pre-imported headphone/IEM profiles from [AutoEQ project](https://github.com/jaakkopasanen/AutoEq)
- Marked as `readOnly: true` (cannot be overwritten via API)
- Format: EqPresetV1 (converted to PipelineConfig on load)
- Manifest file (`autoeq/index.json`) enables fast cold-start

**Note:** Devices section is **never** stored in presets

---

## State Synchronization

### Upload-Download Convergence Model

**Every config upload follows this pattern:**

```
1. User edits EQ band
2. Update eqStore (optimistic)
3. Debounce timer (200ms)
4. Build DSP config from eqStore
5. Validate locally
6. Send SetConfigJson to DSP
7. DSP responds "Ok" or "Error"
8. Send GetConfigJson to re-download
9. Extract bands from confirmed config
10. Update eqStore with confirmed bands
11. Persist to backend recovery cache (best-effort)
```

**Invariant:** eqStore always reflects what DSP confirmed, not what we sent.

**Rationale:**
- DSP may reject config (validation failure)
- DSP may modify config (e.g., clamp parameters)
- DSP may have been changed by external tool

---

## Failure Recovery

### Upload Fails (SetConfigJson rejected)
```
1. Log failure to dspStore.failures
2. Attempt GetConfigJson to sync to DSP truth
3. If GetConfigJson fails:
   - Keep optimistic UI state
   - Show error banner
4. If GetConfigJson succeeds:
   - Revert UI to DSP truth
   - Show error banner
```

### Download Fails (GetConfigJson timeout)
```
1. Keep existing UI state (optimistic)
2. Show warning banner
3. Next upload will retry download
```

### Backend Persistence Fails
```
1. Log warning to console
2. Continue (non-fatal)
3. UI remains functional
4. Recovery cache may be stale
```

### Connection Lost
```
1. Update connectionState to 'error'
2. Clear spectrum polling loop
3. If auto-reconnect enabled:
   - Exponential backoff (2s, 4s, 8s, 16s, 32s)
   - Max 5 attempts
4. If reconnect succeeds:
   - Download config from DSP
   - Re-initialize eqStore
```

---

## Disabled Filters Overlay

### Problem
CamillaDSP only stores **active** filters in pipeline steps.  
When user disables a filter in CamillaEQ, it must be removed from the pipeline.  
But we need to remember **where** it was, so re-enabling puts it back in the right position.

### Solution
**localStorage overlay** tracks disabled filter locations per pipeline step.

**Key:** `disabledFiltersOverlay`

**Value:** JSON object
```json
{
  "Filter01": [
    { "stepKey": "channels:0|stepIndex:0", "index": 2 }
  ],
  "Filter03": [
    { "stepKey": "channels:0,1|stepIndex:1", "index": 0 }
  ]
}
```

**Step key format:** `channels:<ch1,ch2,...>|stepIndex:<i>`

**Rationale:**
- Step identity must survive pipeline reorders
- Channels + index is stable enough for this use case

**Lifecycle:**
- Updated when filter disabled (removes from pipeline, adds to overlay)
- Updated when filter enabled (removes from overlay, restores to pipeline)
- Updated when pipeline reordered (remap step keys)
- Cleared when filter deleted
- Cleared when step deleted

---

## Persistence Consistency

### Write-Through Pattern

**Used for:** Recovery cache (`/api/state/latest`)

**Flow:**
```
1. User edits config
2. Upload to DSP
3. DSP confirms
4. Write-through to backend (async, non-blocking)
5. If write fails, log warning (non-fatal)
```

**Guarantees:**
- Best-effort persistence
- Failure does not block UI
- Recovery cache may lag behind DSP truth

---

### Explicit Save Pattern

**Used for:** Presets (`/api/configs/:id`)

**Flow:**
```
1. User clicks "Save Current"
2. Get current DSP config
3. Convert to pipeline-config format
4. PUT to backend
5. If save fails, show error banner
6. If save succeeds, refresh preset list
```

**Guarantees:**
- User is aware of save action
- Failure is visible to user
- No automatic retries

---

## State Invalidation

### When DSP Config Changes Externally
**Scenario:** User edits DSP config via other tool (e.g., pyCamillaDSP)

**Detection:** Not automatic (no polling)

**Recovery:**
1. User notices UI drift
2. Clicks "Reconnect" or reloads page
3. GetConfigJson downloads fresh config
4. UI re-initializes from fresh config

**Future:** Could add periodic config polling (not implemented)

---

### When Backend Restarts
**Impact:** None on frontend (stateless HTTP)

**Recovery:**
- Preset library reloaded on next request
- Recovery cache reloaded on next request
- No re-initialization needed

---

### When Browser Reloads
**Impact:** All runtime state lost (dspStore, eqStore)

**Recovery:**
1. If auto-reconnect enabled:
   - Reconnect to DSP
   - Download config
   - Initialize eqStore
2. If auto-reconnect disabled:
   - Show "Not Connected" state
   - User must manually reconnect

---

## Concurrency

### No Multi-Tab Coordination
**Current state:** Multiple tabs can connect independently

**Behavior:**
- Each tab has separate DSP session
- Each tab uploads independently
- Last-write-wins to DSP
- Recovery cache reflects last upload from any tab

**Known issue:** Tabs can overwrite each other

**Mitigation:** Not addressed (rare use case)

---

### Request Serialization
**Per-socket:** Requests queued, one in-flight at a time

**Rationale:**
- CamillaDSP WebSocket is request-response
- Concurrent requests on same socket cause collisions
- Queue ensures ordered, reliable delivery

---

## Data Retention

### Runtime State
**Lifetime:** Browser session

**Cleared by:**
- Browser tab close
- Page reload (unless localStorage preserved)
- Explicit disconnect

---

### localStorage State
**Lifetime:** Indefinite (user/browser controlled)

**Cleared by:**
- User clears browser data
- Browser eviction (storage quota)
- Explicit `localStorage.clear()` call

**Size limit:** ~5-10 MB per origin (browser-dependent)

---

### Backend Recovery Cache
**Lifetime:** Until overwritten or server data dir deleted

**Cleared by:**
- New upload (overwrites)
- Explicit file deletion
- Server data dir cleanup

---

### Backend Presets
**Lifetime:** Until explicitly deleted

**Cleared by:**
- User deletes preset (via UI or filesystem)
- Server data dir cleanup

---

## Testing State Convergence

### Unit Tests
**What:** Convergence logic (`eqStore.uploadToDSP()`)

**Verify:**
- Upload → re-download cycle
- UI syncs to DSP truth
- Preserves UI-only state

**Location:** `client/src/state/eqStore.test.ts`

---

### Integration Tests
**What:** Full upload cycle with mock DSP

**Verify:**
- Config validation
- Optimistic updates
- Rollback on failure

**Location:** `client/src/lib/__tests__/camillaDSP.integration.test.ts`

---

## Best Practices

### Do
- Always re-download after upload
- Treat DSP as ground truth
- Handle partial failures gracefully
- Log failures for diagnostics

### Do Not
- Skip convergence step ("trust the upload")
- Block UI on persistence failures
- Assume localStorage is reliable
- Assume single-tab usage

---

## Next Steps

- [Extension Points](extension-points.md) - Safe modification patterns
- [Data Flow](data-flow.md) - Control flow diagrams
- [Architecture](architecture.md) - Module responsibilities
