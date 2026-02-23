# Frontend Architecture

**Intended audience:** OSS developers working on the client.

**This document does not cover:** Backend implementation or CamillaDSP internals.

---

## Technology Stack

**Framework:** Svelte 4
**Language:** TypeScript
**Build tool:** Vite
**Test framework:** Vitest

**Rationale:**
- Svelte: Low runtime overhead, reactive by default, minimal abstraction
- TypeScript: Type safety for DSP config (complex nested structures)
- Vite: Fast dev server, HMR, modern build pipeline

---

## Directory Structure

```
client/src/
├── main.ts                 # Entry point
├── App.svelte             # Root component, routing
├── vite-env.d.ts          # Vite type declarations
│
├── pages/                 # Top-level pages (routed)
│   ├── ConnectPage.svelte
│   ├── EqPage.svelte
│   ├── PresetsPage.svelte
│   └── PipelinePage.svelte
│
│   └── eq/                 # EQ page sub-components (keeps EqPage small)
│       ├── left/           # Plot + left panel
│       ├── right/          # Right side band list + master band
│       ├── spectrum/       # Spectrum polling + canvas visualization controller
│       ├── vizOptions/     # Visualization options bar + layout manager
│       └── plot/           # Plot math helpers (freq ↔ x, gain ↔ y)
│
├── components/            # Reusable UI components
│   ├── Nav.svelte
│   ├── KnobDial.svelte
│   ├── FilterTypePicker.svelte
│   └── pipeline/          # Pipeline editor components
│       ├── FilterBlock.svelte
│       ├── MixerBlock.svelte
│       └── ProcessorBlock.svelte
│
├── state/                 # Global stores (Svelte stores)
│   ├── dspStore.ts        # DSP connection, config
│   ├── eqStore.ts         # EQ band state
│   ├── pipelineEditor.ts  # Pipeline upload helper
│   └── appVersionStore.ts # App version
│
├── lib/                   # Business logic (non-UI)
│   ├── camillaDSP.ts      # WebSocket client
│   ├── api.ts             # HTTP client (presets)
│   ├── router.ts          # Hash router
│   ├── camillaTypes.ts    # Type definitions
│   ├── camillaEqMapping.ts     # EQ band ↔ DSP config
│   ├── pipelineConfigMapping.ts # Preset format conversion
│   ├── pipelineViewModel.ts    # Pipeline → UI blocks
│   ├── pipelineBlockEdit.ts    # Pipeline mutations
│   ├── filterEnablement.ts     # Filter disable/enable
│   ├── disabledFiltersOverlay.ts # Disabled filter localStorage persistence
│   ├── vizOptionsPersistence.ts  # Viz-options localStorage persistence
│   └── knownTypes.ts           # Filter/processor type registry
│
├── dsp/                   # DSP math (pure functions)
│   ├── filterResponse.ts  # Biquad magnitude response
│   ├── spectrumParser.ts  # Parse DSP spectrum data
│   ├── spectrumAnalyzer.ts # Temporal averaging (STA/LTA/Peak)
│   └── fractionalOctaveSmoothing.ts # Spatial smoothing
│
├── ui/                    # Rendering (Canvas/SVG)
│   ├── rendering/
│   │   ├── EqSvgRenderer.ts           # EQ curves (SVG)
│   │   ├── SpectrumCanvasRenderer.ts  # Spectrum overlay (Canvas)
│   │   └── canvasLayers/              # Pluggable layers
│   │       ├── SpectrumAnalyzerLayer.ts
│   │       ├── SpectrumHeatmapLayer.ts
│   │       └── SpectrumAreaLayer.ts
│   └── tokens/
│       └── EqTokensLayer.svelte  # Draggable EQ tokens (DOM)
│
└── styles/
    └── theme.css          # CSS custom properties
```

Notes:
- `EqPage.svelte` is primarily composition/layout now; most UI logic is in `pages/eq/**`.
- Visualization options (spectrum mode, smoothing, heatmap, token visuals) live in `pages/eq/vizOptions/vizOptionsStore.ts`.

---

## Routing

**Implementation:** Hash-based routing (`lib/router.ts`)

**Routes:**
- `/connect` - DSP connection setup
- `/eq` - EQ editor (primary UI)
- `/presets` - Preset library
- `/pipeline` - Pipeline editor (advanced)

**Default behavior:**
- If no route specified:
  - If `localStorage` has DSP server → `/eq`
  - Otherwise → `/connect`

**Navigation:**
- `router.navigate('/eq')` - Programmatic
- `<a href="#/eq">` - Declarative (but rarely used)

**Active route tracking:**
- `router` store exports current route
- `isActive(route)` derived store for nav highlighting

---

## State Management

### Global Stores (Svelte Stores)

**dspStore.ts**
- **Type:** Writable + derived stores
- **Owns:** CamillaDSP instance, connection state, volume, config
- **Lifecycle:** Singleton, lives for app lifetime
- **Key functions:**
  - `connect()` - Establish DSP connection
  - `disconnect()` - Close sockets
  - `autoConnectFromLocalStorage()` - Auto-connect on app start
  - `setVolume()` - Debounced volume control

**eqStore.ts**
- **Type:** Writable store
- **Owns:** EQ band array (frequency, gain, Q, type, enabled)
- **Lifecycle:** Re-initialized on config load/preset load
- **Key functions:**
  - `initializeFromConfig()` - Extract bands from DSP config
  - `setBandFreq()` / `setBandGain()` / `setBandQ()` - Optimistic updates (with clamping)
  - Debounced upload with convergence happens internally (upload → re-download → sync)
  - `selectBand()` - Track selected band index (UI focus mode)
  - `startSoloEditSession(bandIndex)` - Begin solo preview: uploads a reduced config (active band only), sets `soloActiveBandIndex`
  - `endSoloEditSession()` - Restore full config, clear `soloActiveBandIndex`, persist recovery cache
- **Exported readable:** `soloActiveBandIndex` (`number | null`) — consumed by `EqTokensLayer` to apply dimming to non-active tokens during a solo session

**pipelineEditor.ts**
- **Type:** Helper functions + callback
- **Owns:** Upload state (idle/pending/success/error)
- **Key functions:**
  - `commitPipelineConfigChange()` - Debounced pipeline upload
  - `setPipelineUploadStatusCallback()` - UI status updates

---

### Local Component State

**Use Svelte `let` for:**
- Transient UI state (hover, drag, focus)
- Component-local selections
- Animation state

**Do not use stores for:**
- Per-component temporary state
- Render-only derived values

---

## Data Models

### EQ Band (eqStore)
```typescript
interface EqBand {
  id: string;              // Stable ID (Filter01, Filter02, etc.)
  index: number;           // Band order number (0-9)
  freq: number;            // Center frequency (Hz)
  gain: number;            // Gain (dB, only for Peaking/Shelf)
  q: number;               // Q factor (bandwidth)
  type: BiquadType;        // Peaking, Highpass, Lowpass, etc.
  enabled: boolean;        // Whether band is active
  
  // UI-only state (not persisted)
  focused: boolean;
  dragging: boolean;
}
```

### Pipeline Block (pipelineViewModel)
```typescript
type PipelineBlockVm = FilterBlockVm | MixerBlockVm | ProcessorBlockVm;

interface FilterBlockVm {
  kind: 'filter';
  stepIndex: number;       // Position in pipeline
  blockId: string;         // Stable UI identity
  channels: number[];      // Channel routing
  bypassed: boolean;       // Pipeline-level bypass
  filters: FilterInfo[];   // Filter list (active + disabled)
}
```

---

## Rendering Architecture

### Two-Path Rendering

**SVG Path (EQ Curves)**
- Generated via `EqSvgRenderer.ts`
- Produces SVG `<path>` elements (DOM)
- Re-rendered on band changes (~1-10 Hz burst)
- Allows CSS styling, animations, focus effects

**Canvas Path (Spectrum Overlay)**
- Rendered via `SpectrumCanvasRenderer.ts`
- Direct pixel drawing (~10 Hz continuous)
- No DOM overhead
- DPR-aware scaling for retina displays

---

### SVG Rendering Pipeline
```
eqStore.ts
    │
    ├─► $bands updates
    │
    ├─► derived stores recompute
    │   - sumCurvePath
    │   - perBandCurvePaths
    │
    ▼
EqPlotArea.svelte
    │
    └─► Bind the generated SVG path strings to <path> elements
```

Implementation detail:
- Path generation is done by `ui/rendering/EqSvgRenderer.ts` (pure functions).

---

### Canvas Rendering Pipeline
```
EqPlotArea.svelte
    │
    ├─► onMount(): createSpectrumVizController({ canvas, getDsp, getPlotSize, ... })
    │
    ├─► reactive statements push config into controller:
    │   - spectrumMode (pre/post)
    │   - analyzer visibility (STA/LTA/Peak)
    │   - smoothing mode
    │   - heatmap config
    │
    └─► controller polling loop (setInterval)
        │
        ├─► dsp.getSpectrumData()
        ├─► parseSpectrumData()
        ├─► optional fractional-octave smoothing
        ├─► SpectrumAnalyzer.update() (STA/LTA/Peak)
        ├─► update canvas layers (analyzer lines + heatmap)
        ├─► SpectrumCanvasRenderer.render()
        └─► stale detection: fade canvas if no data >500ms
```

**Performance constraints:**
- No allocations in render loop
- Reuse typed arrays for bin data
- Canvas operations are batched (path drawing)

---

## WebSocket Client (camillaDSP.ts)

### Lifecycle Management

**connect()**
- Opens control + spectrum sockets
- Waits for both 'open' events (with timeout)
- Downloads initial config
- Sets up lifecycle callbacks

**disconnect()**
- Closes both sockets
- Cancels all pending requests
- Clears config cache

**Request queue:**
- Per-socket `SocketRequestQueue`
- Serializes requests (one in-flight at a time)
- Timeout protection (5s control, 2s spectrum)
- Abort on disconnect

---

### Callback Architecture

```typescript
// Lifecycle events (socket state changes)
onSocketLifecycleEvent?: (event: SocketLifecycleEvent) => void;

// DSP operation success/failure
onDspSuccess?: (operation: string, result: any) => void;
onDspFailure?: (operation: string, error: Error) => void;
```

**Used by dspStore to:**
- Track connection state
- Log failures for diagnostics
- Trigger UI updates

---

## HTTP Client (api.ts)

**Functions:**
- `getConfigs()` - List presets
- `getConfigById(id)` - Load preset
- `putConfig(id, data)` - Save preset
- `getLatestState()` - Get recovery cache
- `putLatestState(config)` - Update recovery cache
- `getAppVersion()` - Get backend version

**Error handling:**
- Throws on non-2xx responses
- Includes response body in error
- Caller handles errors (try/catch)

---

## Type Architecture

### CamillaDSP Config (camillaTypes.ts)
**Canonical format** received from `GetConfigJson`:
```typescript
interface CamillaDSPConfig {
  devices: DevicesBlock;
  filters: Record<string, FilterDefinition>;
  mixers: Record<string, MixerDefinition>;
  processors?: Record<string, ProcessorDefinition>;
  pipeline: PipelineStep[];
}
```

### Pipeline Config (pipelineConfigMapping.ts)
**On-disk preset format**:
```typescript
interface PipelineConfig {
  configName: string;
  filterArray: Array<Record<string, any>>; // Legacy
  
  // Extended format:
  filters?: Record<string, any>;
  mixers?: Record<string, any>;
  processors?: Record<string, any>;
  pipeline?: any[];
}
```

**Conversion:**
- `pipelineConfigToCamillaDSP()` - Preset → DSP config
- `camillaDSPToPipelineConfig()` - DSP config → Preset
- Devices never stored (always from current DSP config)

---

## Validation Boundaries

### Client-Side Validation (Before Upload)

**Config validation (`camillaDSP.validateConfig()`)**:
- All pipeline Filter steps reference existing filters
- All pipeline Mixer steps reference existing mixers
- All pipeline Processor steps reference existing processors
- Returns boolean (true = valid)

**Mixer routing validation (`mixerRoutingValidation.ts`)**:
- Each destination has ≥1 source
- Source channels within mixer input range
- Destination channels within mixer output range
- Returns detailed errors per destination

**Parameter clamping (`eqParamClamp.ts`)**:
- Frequency: 10 Hz - 24 kHz
- Q: 0.1 - 20
- Gain: -30 dB - +30 dB
- Applied before upload

---

### Server-Side Validation (CamillaDSP)
- Final authority on config validity
- May reject configs client considers valid
- Client must handle rejection and re-sync

---

## Performance Guidelines

### High-Frequency Path (10 Hz)
**Do:**
- Use canvas rendering
- Reuse allocated buffers
- Batch draw operations

**Do NOT:**
- Mutate DOM
- Create objects in loop
- Trigger Svelte reactivity in render loop

---

### Interactive Path (1-10 Hz burst)
**Do:**
- Use optimistic updates
- Debounce uploads (200ms)
- Show loading states

**Do NOT:**
- Block UI on network operations
- Skip convergence step after upload

---

## Testing Strategy

### Unit Tests
- DSP math (filterResponse, spectrumAnalyzer)
- Type utilities (camillaTypes, knownTypes)
- Business logic (camillaEqMapping, pipelineBlockEdit)

### Integration Tests
- CamillaDSP client lifecycle
- EQ upload convergence
- Preset load/save flow

### Component Tests
- Page behavior (EqPage, PipelinePage)
- User interactions (drag, click, keyboard)

**Run tests:** `npm test` (Vitest)

---

## Extension Points

### Add New Visualization Layer
1. Implement `CanvasVisualizationLayer` interface
2. Register in `SpectrumCanvasRenderer`
3. Add UI toggle + store wiring in `pages/eq/vizOptions/*` (VizOptions bar + vizOptionsStore)

### Add New Filter Type
1. Add to `knownTypes.ts` (`isKnownEditableFilter()`)
2. Add parameter editor in `FilterBlock.svelte`
3. Add icon in `FilterIcons.svelte`

### Add New Pipeline Block Type
1. Extend `PipelineBlockVm` union
2. Add view model builder in `pipelineViewModel.ts`
3. Add component in `components/pipeline/`

---

## Next Steps

- [Backend](backend.md) - Server implementation
- [State and Persistence](state-and-persistence.md) - State ownership model
- [Extension Points](extension-points.md) - Detailed extension guidance
- [Data Flow](data-flow.md) - Control and data flows
