# Salvage Specification: `camillaDSP` and `filter` (from camillaNode)

This document describes two salvageable modules—`docs/reference/camillaDSP.js` and `docs/reference/filter.js`—as **implementation-driven specifications** that a new application can re-implement while remaining behaviorally compatible.

It is written at the level of **public API contracts**, **data models**, and **side effects** (WebSocket I/O, config mutation, DOM element creation).

---

## 1) Module: `camillaDSP` (client-side DSP/session + config manager)

### 1.1 Purpose and Responsibilities
`camillaDSP` is a browser-side class that:

1. Establishes two WebSocket connections to a CamillaDSP-compatible backend:
   - **DSP control** socket (`ws`) for config/state/volume/etc.
   - **Spectrum/metrics** socket (`ws_spectrum`) for realtime playback signal metrics.
2. Downloads, normalizes, mutates, validates, and uploads DSP configurations.
3. Manages **filters** within a config, including:
   - Creating default configs
   - Adding/removing filters
   - Assigning filters to per-channel pipelines
   - Split/merge operations between single-channel and multi-channel representations
4. Provides convenience controls over common DSP concepts:
   - balance (via mixer gains)
   - tone controls (sub-bass…treble via special filters)
   - crossfeed (via mixer mapping)
5. Can convert config filters into a text representation (Equalizer APO-style output).

### 1.2 Runtime Context / Dependencies
- Runs in a **browser** (uses `window.localStorage`, `WebSocket`, DOM console).
- Depends on `/src/filter.js` module (imported as `filter`), but mainly as a helper for wrapping filter JSON.

### 1.3 Core State (Fields)
These are the class’s observable state variables.

#### Connection fields
- `ws: WebSocket` — control socket.
- `ws_spectrum: WebSocket` — spectrum socket.
- `server: string`
- `port: string|number`
- `spectrumPort: string|number`
- `connected: boolean = false`
- `spectrum_connected: boolean = false`

#### Configuration fields
- `config: CamillaDSPConfig` — in-memory config object representing the DSP pipeline.

#### Constants / presets
- Tone center frequencies:
  - `subBassFreq=50`, `bassFreq=200`, `midsFreq=1000`, `upperMidsFreq=3000`, `trebleFreq=8000`
- Built-in filter JSON snippets:
  - `DCProtectionFilter` — biquad highpass @ 5 Hz
  - `Limiter` — limiter with `clip_limit=-3`
- Built-in mixer and pipeline defaults:
  - `defaultMixer` — `recombine` 2-in/2-out mapping with crossfeed sources muted by default.
  - `defaultPipeline` — `[Mixer(recombine), Filter(channel 0), Filter(channel 1)]`

### 1.4 Data Model: `CamillaDSPConfig`
The class assumes CamillaDSP “JSON config” structure (as returned by `GetConfigJson`).

Minimal shape required by this implementation:

```ts
type CamillaDSPConfig = {
  devices: {
    capture: { channels: number; [k: string]: any };
    playback: { channels: number; [k: string]: any };
    [k: string]: any;
  };

  filters: Record<string, FilterDefinition>;
  mixers: Record<string, MixerDefinition>;
  pipeline: PipelineStep[];
  processors?: Record<string, any>; // class creates/ensures this exists
};

type FilterDefinition = {
  type: string; // e.g. "Biquad", "Gain", "Limiter", ...
  description?: string;
  parameters: Record<string, any>; // depends on filter type
};

type MixerDefinition = {
  description?: string;
  channels: { in: number; out: number };
  mapping: Array<{
    dest: number;
    sources: Array<{
      channel: number;
      gain: number;
      inverted: boolean;
      mute: boolean;
      scale: "dB" | "linear" | string;
    }>;
    mute: boolean;
  }>;
};

type PipelineStep =
  | { type: "Mixer"; name: string; description?: string; bypassed?: boolean }
  | { type: "Filter"; channel: number; names: string[]; description?: string; bypassed?: boolean }
  | { type: string; [k: string]: any };
```

### 1.5 Public API (Methods) and Contracts

#### `constructor()`
- Returns `this`.

#### `async connect(server?, port?, spectrumPort?) : Promise<boolean>`
**Behavior**
1. If `server` is undefined, attempts to load `server`, `port`, `spectrumPort` from `window.localStorage`.
2. If still undefined, returns `false`.
3. Connects to control socket via `connectToDSP(server, port)`.
4. If successful, connects to spectrum socket via `connectToDSP(server, spectrumPort)`.
5. Calls `initAfterConnection()`.
6. Sets internal flags: `connected`, `spectrum_connected`.

**Outputs**
- `true` if both sockets (or at least the control socket per current code path) and initialization succeed.

**Side effects**
- Updates `this.ws`, `this.ws_spectrum`, `this.server`, `this.port`, `this.spectrumPort`, `this.config`.

**Errors**
- Catches and logs connection errors; returns `false` on failure.

#### `async initAfterConnection() : Promise<boolean>`
- Downloads config from DSP (`downloadConfig()`)
- Normalizes it via `getDefaultConfig(this.config)`

#### `connectToDSP(server, port) : Promise<[true, WebSocket] | rejects>`
- Opens a browser WebSocket to `ws://{server}:{port}`.
- Resolves when socket `open` fires.
- Rejects on `error`.

> Spec note: in a re-implementation, explicitly remove event listeners after resolve/reject to avoid dangling handlers.

---

## 1.6 DSP WebSocket Protocol (Message/Response Handling)

### Incoming message format
The code assumes all DSP responses are JSON of the form:

```json
{
  "CommandName": {
    "result": "Ok" | "Error" | string,
    "value": <any>
  }
}
```

### `static handleDSPMessage(m: MessageEvent): [boolean, any]`
- Parses `m.data` JSON.
- Extracts first key as the response command.
- Returns `[true, value]` when `result === 'Ok'`; otherwise `[false, value]`.
- Special-cases `GetConfigJson` to JSON.parse `value`.

Supported commands explicitly handled:
- `GetVersion`
- `GetConfigJson`
- `SetConfigJson`
- `GetState`
- `GetPlaybackSignalPeak`
- `GetPlaybackSignalRms`
- `GetPlaybackSignalPeakSinceLast`
- `SetUpdateInterval`
- `GetClippedSamples`
- `GetVolume`
- `SetVolume`
- `GetCaptureRate`
- `GetProcessingLoad`
- `ResetClippedSamples`

Any other commands:
- Logs “Unhandled message…” but still returns Ok/error semantics.

### `sendDSPMessage(message): Promise<any>`
**Input**
- `message` may be:
  - a string command name (e.g., `"GetConfigJson"`)
  - an object with a single key, which is treated as the command name when matching responses (e.g., `{ "SetConfigJson": "..." }`)

**Behavior**
- Attaches a `message` event listener.
- On each received message:
  - parses JSON
  - compares response command to requested command
  - resolves/rejects based on `handleDSPMessage`
- Sends `JSON.stringify(message)`.

> Spec note: the current code does **not remove** the listener (commented out). A compatible re-implementation should remove it to avoid memory leaks and multiple resolves.

### `sendSpectrumMessage(message: string): Promise<any>`
Like `sendDSPMessage` but uses `ws_spectrum` and *does attempt* to remove the listener (though the `this` binding inside callback is not the WebSocket—this is fragile).

---

## 1.7 Configuration I/O API

### `uploadConfig() : Promise<boolean> | false`
- Validates config via `validateConfig()`.
- Calls `cleanFilters()` to coerce parameter types (boolean/number conversions).
- Sends `SetConfigJson` with `JSON.stringify(this.config)`.
- Resolves `true` on success.

### `downloadConfig() : Promise<boolean>`
- Sends `GetConfigJson`.
- Stores response into `this.config`.

### `validateConfig() : boolean`
Validation rules enforced:
1. Every `pipeline` step of type `Mixer` must reference an existing key in `config.mixers`.
2. Every filter name referenced in any `pipeline` step of type `Filter` must exist in `config.filters`.

---

## 1.8 Filter Management API (Config mutation)

### `createFilter(filterName, channelNo) : filter`
- Instantiates a `filter` wrapper class using existing `config.filters[filterName]`.
- Assigns `newFilter.DSP = this`, `newFilter.channel = channelNo`.
- Returns the filter instance.

### `createNewFilter(filterObject, channelNo) : filter`
- Adds filter JSON to config via `addFilter(filterObject, channelNo)`.
- Wraps it in a `filter` instance via `createFilter`.

### `clearFilters()`
- Iterates all filters.
- Removes each from all channel pipelines.
- If a filter ends up not referenced in any pipeline, it is deleted from `config.filters` (via `removeFilterFromChannelPipeline`).

### `addFilters(filterList, channel?)`
- Adds multiple filters either:
  - to a specific `channel`, or
  - to **all channels** if `channel` is undefined.

### `addFilterToAllChannels(filterJSON)`
- Adds a filter and references it in each channel’s filter pipeline step.

### `addFilter(filterJSON, channelNo)`
- Merges filter(s) into `config.filters`.
- Adds the filter name into the specified channel’s pipeline.

### `addFilterToChannelPipeline(filterJSON, channelNo)`
- Finds pipeline step `{type:'Filter', channel: channelNo}`.
- Ensures filter name exists in its `names[]`.

### `removeFilterFromChannelPipeline(filterName, channelNo)`
- Removes `filterName` from channel pipeline `names[]`.
- If the filter name is now unused across all channel pipelines, deletes it from `config.filters`.

### `removeFilter(filterName)`
- Removes filter from all channel pipelines.

### `isFilterInPipeline(filterNameOrObject) : boolean`
- Returns whether the filter name appears in any channel pipeline.

### `getDefaultFilter() : Record<string, FilterDefinition>`
- Creates a new filter with a generated name (`F` + time suffix).
- Default definition is a Peaking biquad at 3146 Hz, 0 dB, Q=1.41.

### `getDefaultConfig(config) : CamillaDSPConfig`
Normalization logic:
- `devices` always preserved.
- If incoming config has `filters` with entries: preserve `filters`, `mixers`, `pipeline`.
- Else create a default config with:
  - empty filters
  - `defaultMixer`
  - `defaultPipeline`
- Always ensures `processors={}`.

---

## 1.9 Multi-channel vs Single-channel representation
This class supports two structural interpretations:

- **Merged/single-channel** representation: the same filter names appear in all channels.
- **Split** representation: channel-specific filters use suffixed names like `"<base>__c0"`, `"<base>__c1"`.

### `splitFiltersToChannels()`
- Clears `config.filters` and resets `pipeline` to `defaultPipeline`.
- For each original filter:
  - If name starts with `__` or name is `Gain`: add unchanged to all channels.
  - Else: duplicate per channel using `filterName + "__c" + channel` and add to that channel.

### `mergeFilters() : boolean`
- Resets filters/pipeline to defaults.
- Reads channel 0 pipeline filter names and uses it as “source of truth”.
- For each filter in channel 0:
  - If starts with `__`: add same filter to all channels.
  - Else:
    - derive base name `filterName.split("_")[0]` (implementation assumes `_c0`-style; note split vs actual `__c0` is inconsistent)
    - add base filter to all channels using channel0 definition
    - remove the channel-specific ones
- Returns `validateConfig()`.

### `isSingleChannel() : boolean`
- Compares each adjacent channel pipeline’s `names` list for equality (same length and same elements).

> Spec note: A re-implementation may want to formalize and fix the suffix format (`__c0` vs `_c0`) but should maintain backward compatibility with existing saved configs.

---

## 1.10 Mixer-based features

### `setBalance(bal: number)` / `getBalance() : number`
- Uses `config.mixers.recombine.mapping`.
- Applies balance by setting gain on the primary source:
  - mapping[0].sources[0].gain = -bal
  - mapping[1].sources[0].gain = +bal

### `setCrossfeed(crossfeedVal: number)` / `getCrossfeed(): number`
- Uses `recombine.mapping[*].sources[1]`.
- If `crossfeedVal <= -15`:
  - mutes crossfeed sources on both channels.
- Else:
  - unmutes and sets `gain=crossfeedVal`.

---

## 1.11 Tone Controls
Tone is implemented as **special filter entries** in `config.filters` with fixed names:
- `__subBass`, `__bass`, `__mids`, `__upperMids`, `__treble`

### `setTone(subBass, bass, mids, upperMids, treble)`
- If `__subBass` does not exist yet:
  - creates all five filters (biquad Peaking by default)
  - adds to all channels
  - converts `__subBass` to `Lowshelf`
  - converts `__treble` to `Highshelf`
- Else updates `parameters.gain` fields.

### `static createPeakFilterJSON(freq, gain, q)`
- Returns biquad Peaking filter definition.

---

## 1.12 Spectrum / Metrics API

### `async getSpectrumData() : Promise<any>`
- Sends `GetPlaybackSignalPeak` to `ws_spectrum`.
- Returns the parsed `value`.

---

## 1.13 Configuration Utilities

### `convertConfigToText() : string`
- Sorts filters by `parameters.freq`.
- Produces a string similar to Equalizer APO “Filter N:” format.
- Special-case: Gain filter becomes `Preamp: X dB`.
- Skips filters whose names start with `__`.
- Uses:
  - `PK` for Peaking
  - `LSC` for Lowshelf
  - `HSC` for Highshelf
  - `OFF` when gain is 0 else `ON`

### `getFilterListByFreq() : string[]`
- Returns filter names sorted by `.parameters.freq`.

### `linearizeConfig() : Array<Array<any>>`
Produces a per-channel linear representation of the pipeline:
- Determines channel count as max of:
  - capture/playback channels
  - mixer in/out channels
- Builds `channels[i]` arrays as:
  - `{type:'input', device:capture}`
  - mixer mapping entries as `{type:'mixer', sources:[...]}` for destination channels
  - filter entries as `{type:'filter', [filterName]: filterDef}` appended to channel pipeline
  - `{type:'output', device:playback}`

### `getChannelCount() : number`
- Uses mixer in/out counts and devices’ channel counts.

### `getChannelFiltersList(channelNo) : string[]`
- Returns `names[]` for the pipeline step `{type:'Filter', channel: channelNo}`.

### `cleanFilters()`
Coerces filter parameter values to proper runtime types:
- Converts string booleans ("true"/"false", "on"/"off") to booleans.
- Converts numeric strings to numbers.
- Leaves null values as-is.

---

## 2) Module: `filter` (filter wrapper + editor UI factory)

### 2.1 Purpose and Responsibilities
`filter` is a wrapper around a single CamillaDSP filter definition. It is responsible for:

1. Managing a `filterJSON` object of shape `{ [filterName]: FilterDefinition }`.
2. Reading from and writing to a `camillaDSP` instance’s config (`DSP.config`).
3. Applying parameter changes with type/subtype switching logic.
4. Generating a **DOM element collection** (name/type/subtype/parameter inputs + add/remove buttons) for UI editors.

### 2.2 Runtime Context / Dependencies
- Runs in a browser (uses `document.createElement`, DOM events).
- Expects to be given a `camillaDSP` instance as `DSP`.

### 2.3 Enumerations: `Types`
Supported filter “types” (top-level `FilterDefinition.type`) used by the UI:
- `Gain`, `Volume`, `Loudness`, `Delay`, `Conv`, `Biquad`, `Dither`, `Limiter`

### 2.4 Core State (Fields)
- `DSP: camillaDSP` — owning controller used to mutate config and upload.
- `basic: boolean = false` — UI restriction flag (only allow a subset of options).
- `filterJSON: Record<string, FilterDefinition>` — *single-entry* map holding the filter’s definition.
- `elementCollection: Record<string, HTMLElement>` — a structured set of DOM nodes created by `createElementCollection()`.

### 2.5 Construction
#### `constructor(dsp: camillaDSP)`
- Stores `dsp` into `this.DSP`.
- Generates a name: `"F" + Date.now().substring(6)`.
- Calls `setName()`.

> Spec note: In `camillaDSP.createFilter(filterName, channelNo)` the class is instantiated with `(filterName, filterBody)` instead of `(dsp)`. A clean re-implementation should harmonize the constructor signature; for compatibility you may support both overloads.

Recommended compatible overloads:
```ts
constructor(dsp: camillaDSP);
constructor(filterName: string, filterDef: FilterDefinition);
```

### 2.6 Filter Identity & Metadata
- `getName() : string` — returns the single key in `filterJSON`.
- `setName(name: string)` — renames the key while preserving body.
- `getDescription() : string`
- `getType() : string` — top-level type (e.g., `Biquad`).
- `getSubType() : string` — subtype stored in `parameters.type` (used for Biquad, Conv, etc.).

### 2.7 Parameter Read/Write API

#### `setFilterParameter(parameter: string, value: any)`
This is the main mutation entrypoint.

**Normalization**
- `parameter` is normalized to `paramName = lowercased, spaces→underscores`.
- `"frequency"` is mapped to `"freq"`.

**Special cases**
- `name`: renames the filter key.
- `description`: updates `.description`.
- `type`:
  - sets `.type`.
  - obtains allowed subtypes (`getFilterSubTypes()`)
  - sets subtype to first option.
- `subtype`:
  - rebuilds `.parameters` from scratch based on `getFilterParams()` for the new type/subtype.
  - preserves old parameter values when the same param exists.
  - chooses defaults for numeric params (`q=1.41`, `freq=100`, else 0).

**Default case**
- Writes `parameters[paramName]=value`, with string "true"/"false" coerced to boolean.

**Side effect**
- Calls `this.loadToDSP()` immediately after any mutation (updates DSP config in-memory).

#### `getFilterParameter(parameter: string) : any`
- Mirrors the same name normalization.
- Returns name/description/type/subtype or `parameters[paramName]`.

#### `getParameters() : Record<string, any>`
- Returns parameter object.

### 2.8 DSP Sync API

#### `async loadFromDSP(filterName: string)`
- Loads filter definition from `this.DSP.config.filters[filterName]` into `this.filterJSON`.

#### `loadToDSP(channel?: number)`
- If `channel` is undefined: writes the filter to **all channels** via `DSP.addFilterToAllChannels(this.filterJSON)`.
- Else writes to a specific channel via `DSP.addFilter(this.filterJSON, channel)`.

#### `async uploadToDSP()`
- Calls `this.DSP.uploadConfig()`.

---

## 2.9 UI Factory API (DOM)
The filter class also acts as a view-model that can produce editor elements.

### `createElementCollection(basic?: boolean)`
**Output**
Populates `this.elementCollection` with:
- `filter`: back-reference to this filter instance
- `filterName: <input>`
- `filterDesc: <input>`
- `filterType: <select>`
- `filterSubType: <select>`
- `peqParams: <div>` containing param label + editor pairs
- `addButton: <div>` with add icon
- `removeButton: <div>` with remove icon

**Add/Remove buttons events**
- `addButton` dispatches an `addNewFilter` event on the closest `.peqElement` ancestor.
- `removeButton` dispatches a `removeFilter` event on the closest `.peqElement` ancestor.

### `createTypeElement()`
- Populates `<select>` with `Types` keys.
- If `basic===true`, restricts to `Biquad` only.
- On change:
  - updates filter type in JSON
  - rebuilds subtype element and parameters
  - dispatches `updated` event on parent container
  - uploads to DSP

### `createSubTypeElement()`
- For `Biquad` returns subtypes (see below).
- For `Conv` returns `[Raw, Wav, Values]`.
- In basic mode, restrict to `[Highshelf, Lowshelf, Peaking]`.
- On change:
  - updates subtype in JSON
  - rebuilds parameters
  - dispatches `updated`
  - uploads to DSP

### `createParamsElement()`
- Builds editor controls based on `getFilterParams()`.
- Parameter types:
  - `num` → text input with wheel/drag adjustments
  - `bool` → checkbox
  - `text` → text input
  - `array` → text input
  - enum array/object → select

**Numeric editor interactions**
- Wheel: increases/decreases by an adaptive step based on current value.
- Drag: pointer down/move adjusts in steps based on vertical movement.
- Double-click resets value to `0`.

On any parameter change:
- calls `setFilterParameter` with checkbox support
- dispatches `updated` on parent container
- uploads config to DSP

---

## 2.10 Filter Type/Subtype Parameter Schema
`filter.getFilterParams()` defines which parameters exist for each type/subtype. This is effectively the **schema** used by the UI and by subtype switching.

### Subtypes (`getFilterSubTypes()`)
- For `Biquad`:
  - `["Free","Highpass","Lowpass","Peaking","Highshelf","Lowshelf","Allpass","Bandpass","LinkwitzTransform"]`
- For `Conv`:
  - `["Raw","Wav","Values"]`
- Otherwise:
  - `[]`

### Parameter lists (`getFilterParams()`)
The function returns an ordered list of parameter descriptors, e.g. `{ "Frequency": "num" }`.

- `Gain`:
  - Gain (num), Inverted (bool), Mute (bool), Scale ([dB, linear])
- `Volume`:
  - Ramp Time (num), Fader ([Aux1..Aux4])
- `Loudness`:
  - Fader ([Main, Aux1..Aux4]), Reference Level (num), High Boost (num), Low Boost (num), Attenuate Mid (bool)
- `Delay`:
  - Delay (num), Unit ([ms, mm, samples]), Subsample (bool)
- `Conv`:
  - Raw: Filename (text), Skip bytes lines (num), Read bytes lines (num)
  - Wav: Filename (text), channel (num)
  - Values: values (array)
- `Biquad`:
  - Free: a1,a2,b0,b1,b2 (num)
  - Highpass/Lowpass/Bandpass/Allpass: Frequency (num), Q (num)
  - Peaking/Highshelf/Lowshelf: Frequency (num), Gain (num), Q (num)
  - LinkwitzTransform: Freq Act (num), Q Act (num), Freq Target (num), Q Target (num)
  - Tilt: Gain (num) *(note: subtype is not currently returned by getFilterSubTypes, but present in param schema)*
- `Dither`:
  - Type ([None, Flat, Highpass, Fweigthed441, Shibata48]), Bits ([16])
- `Limiter`:
  - Soft Clip (bool), Clip Limit (num)

---

## 3) Integration Notes for a New Application
If you want to salvage these as a stable spec for a new codebase, I recommend treating them as **two layers**:

1. **DSP Client + Config Domain** (`camillaDSP`):
   - owns config state
   - owns WebSocket protocol
   - owns config mutation + validation

2. **Filter Model + UI** (`filter`):
   - represents a single filter and parameter schema
   - optionally provides DOM editor UI factories

In a modern re-implementation you might split the UI factory portion from the domain model, but the behavior described above is the compatibility target.

### Compatibility pitfalls (worth specifying explicitly)
- `sendDSPMessage` attaches listeners and does not remove them. A new implementation should remove listeners to avoid leaks while still matching response correlation behavior.
- `camillaDSP.createFilter()` currently instantiates `filter` with unexpected constructor args. If you re-implement, support both construction styles or unify the call sites.
- `mergeFilters()` assumes a channel suffix format inconsistent with `splitFiltersToChannels()` (`_c0` vs `__c0`). If your new app will ingest older configs, define and support both.

---

## 4) Deliverable: What to copy into a new spec
If your new application spec needs a clean “interface definition”, the stable surface area is:

### `ICamillaDSPClient`
- `connect(server?, port?, spectrumPort?): Promise<boolean>`
- `downloadConfig(): Promise<boolean>`
- `uploadConfig(): Promise<boolean>`
- `validateConfig(): boolean`
- filter mutation operations: `addFilter`, `removeFilter`, `splitFiltersToChannels`, `mergeFilters`, `isSingleChannel`, etc.
- convenience controls: `setTone`, `setBalance`, `setCrossfeed`
- metrics: `getSpectrumData`

### `IFilter`
- identity/meta: `getName/setName/getDescription/getType/getSubType`
- parameters: `getFilterParameter/setFilterParameter/getParameters`
- DSP sync: `loadFromDSP/loadToDSP/uploadToDSP`
- optional UI: `createElementCollection`

---

This document is not authoritative when it comes to the filter class. It remains open to change and subject to other specifications in that regard. Specifically choices with regards to DOM element factories inside `filter` or splitting those things up. The purpose is primarily to illustrate a potential usage pattern of the primary class, camillaDSP

---

## As-Built Implementation Notes (CamillaEQ)

The actual implementation in CamillaEQ (`client/src/lib/camillaDSP.ts`) extends the salvage spec with several enhancements:

### Request Queue & Timeout Management
- **Per-socket queues:** All commands queued and processed serially (one in-flight at a time per socket)
- **Timeout protection:** Configurable timeouts (default: 5s control, 2s spectrum)
- **Abort handling:** Socket closure or disconnect immediately aborts all pending/in-flight requests
- **Implementation:** `SocketRequestQueue` class manages queue + timeout per socket

### Lifecycle Event Callbacks
Beyond the salvage spec's message handling, the as-built implementation adds:

```typescript
onSocketLifecycleEvent?: (event: SocketLifecycleEvent) => void;
onDspSuccess?: (info: DspEventInfo) => void;
onDspFailure?: (info: DspEventInfo) => void;
```

**Purpose:**
- Event-driven monitoring of socket health (open/close/error)
- Success/failure tracking for all DSP commands on both sockets
- Enables UI to show degraded state and log failures for diagnostics

**Lifecycle events include:**
- `socket: 'control' | 'spectrum'`
- `type: 'open' | 'close' | 'error'`
- `message: string` (optional error/close reason)
- `timestampMs: number`

**DspEvent info includes:**
- `timestampMs: number`
- `socket: 'control' | 'spectrum'`
- `command: string` (e.g., "GetConfigJson")
- `request: string` (stringified request)
- `response: any` (parsed response or error)

### Transport Failure Logging
The as-built implementation logs failures even when requests never reach CamillaDSP:
- `"spectrum WebSocket not connected"` when calling `getSpectrumData()` on closed socket
- Request timeout errors (5s/2s)
- Request aborts due to socket closure

This differs from the salvage spec which only handles parsed DSP responses.

### Spectrum Readiness
`getSpectrumData()` behavior:
- **Returns `null`** when spectrum socket is not open (graceful degradation)
- **Throws error** only on actual protocol/parse failures
- Allows EQ editing to continue when spectrum unavailable

### CamillaDSP v3.0 Compatibility
- `uploadConfig()` no longer calls `Reload` after `SetConfigJson`
- CamillaDSP v3 applies config changes immediately on `SetConfigJson`
- Calling `Reload` in v3 would revert to disk config (breaking uploads)

### Additional Protocol Methods
The as-built implementation adds methods not in the salvage spec:
- `getVersion()` - Read CamillaDSP version string
- `getAvailableCaptureDevices(backend)` - List capture devices for backend
- `getAvailablePlaybackDevices(backend)` - List playback devices for backend
- `getConfigYaml(socket)` - Read config as YAML from control or spectrum
- `getConfigTitle(socket)` - Read config title from control or spectrum
- `getConfigDescription(socket)` - Read config description from control or spectrum

### Socket State Queries
```typescript
isControlSocketOpen(): boolean
isSpectrumSocketOpen(): boolean
```

Used to derive connection state (connected/degraded/error) and determine if spectrum polling should occur.

### Memory Leak Fix
Unlike the salvage spec note, the as-built implementation properly removes WebSocket event listeners after promise resolution/rejection (no listener accumulation).
