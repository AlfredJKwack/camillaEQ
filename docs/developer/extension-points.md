# Extension Points

**Intended audience:** OSS developers extending or modifying CamillaEQ.

**This document does not cover:** Bug fixes or minor improvements.

---

## Safe Extension Patterns

### Add New Visualization Layer (Canvas)

**Use case:** New spectrum overlay (e.g., spectrogram, waterfall)

**Steps:**
1. Implement `CanvasVisualizationLayer` interface:
   ```typescript
   interface CanvasVisualizationLayer {
     draw(ctx: CanvasRenderingContext2D, state: RenderState): void;
   }
   ```

2. Register in `SpectrumCanvasRenderer`:
   ```typescript
   // In client/src/ui/rendering/SpectrumCanvasRenderer.ts
   this.layers.push(new MyNewLayer());
   ```

3. Add UI toggle in `EqPage.svelte`:
   ```svelte
   <label>
     <input type="checkbox" bind:checked={showMyLayer} />
     My New Layer
   </label>
   ```

**Constraints:**
- No DOM mutations in `draw()`
- No allocations in hot loop (reuse buffers)
- Use typed arrays for numeric data

---

### Add New Filter Type Support

**Use case:** Support new biquad subtype (e.g., Linkwitz-Riley)

**Steps:**
1. Add to known types (`client/src/lib/knownTypes.ts`):
   ```typescript
   export function isKnownEditableFilter(filter: FilterDefinition): boolean {
     if (filter.type === 'Biquad') {
       const type = filter.parameters.type?.toLowerCase();
       return ['peaking', 'highpass', 'lowpass', /* ... */, 'linkwitzriley'].includes(type);
     }
     // ...
   }
   ```

2. Add parameter editor in `FilterBlock.svelte`:
   ```svelte
   {#if filter.biquadType === 'LinkwitzRiley'}
     <!-- Add parameter controls -->
   {/if}
   ```

3. Add icon in `FilterIcons.svelte`:
   ```svelte
   {#if iconType === 'LinkwitzRiley'}
     <path d="..." />
   {/if}
   ```

4. Add filter response calculation in `filterResponse.ts`:
   ```typescript
   case 'LinkwitzRiley':
     // RBJ equations for LR filter
     break;
   ```

**Validation:**
- Test with mock DSP config
- Verify round-trip (upload → download → extract)

---

### Add New Pipeline Block Type

**Use case:** Support new CamillaDSP block (e.g., Compressor)

**Steps:**
1. Extend `PipelineBlockVm` union (`client/src/lib/pipelineViewModel.ts`):
   ```typescript
   export interface CompressorBlockVm {
     kind: 'compressor';
     stepIndex: number;
     blockId: string;
     // ... compressor-specific fields
   }
   
   export type PipelineBlockVm = FilterBlockVm | MixerBlockVm | CompressorBlockVm;
   ```

2. Add view model builder:
   ```typescript
   function buildCompressorBlockVm(
     step: PipelineStepNormalized,
     stepIndex: number,
     blockId: string,
     config: CamillaDSPConfig
   ): CompressorBlockVm {
     // Extract compressor data from config
   }
   ```

3. Add component (`client/src/components/pipeline/CompressorBlock.svelte`):
   ```svelte
   <script lang="ts">
     export let block: CompressorBlockVm;
     // ... component logic
   </script>
   ```

4. Add to `PipelinePage.svelte`:
   ```svelte
   {:else if block.kind === 'compressor'}
     <CompressorBlock {block} />
   {/if}
   ```

**Testing:**
- Unit test view model builder
- Integration test with mock DSP

---

### Add New REST Endpoint

**Use case:** Export config as YAML, list available audio devices

**Steps:**
1. Create route handler (`server/src/routes/myEndpoint.ts`):
   ```typescript
   export default async function myEndpointRoutes(fastify: FastifyInstance) {
     fastify.get('/api/my-endpoint', async (request, reply) => {
       // Handler logic
       return { data: '...' };
     });
   }
   ```

2. Register in `server/src/app.ts`:
   ```typescript
   import myEndpointRoutes from './routes/myEndpoint.js';
   
   app.register(myEndpointRoutes);
   ```

3. Add client function (`client/src/lib/api.ts`):
   ```typescript
   export async function getMyData(): Promise<MyData> {
     const res = await fetch('/api/my-endpoint');
     if (!res.ok) throw new Error('Failed to fetch');
     return res.json();
   }
   ```

4. Add tests (`server/src/__tests__/routes.test.ts`):
   ```typescript
   test('GET /api/my-endpoint returns data', async () => {
     const response = await app.inject({
       method: 'GET',
       url: '/api/my-endpoint',
     });
     expect(response.statusCode).toBe(200);
   });
   ```

---

## Unsafe Patterns (Do Not Do This)

### ❌ Proxy DSP WebSocket Through Backend

**Why not:**
- Adds latency to realtime spectrum path
- Backend becomes single point of failure for DSP connection
- No benefit (browser can connect directly on LAN)

**Breaks:**
- Degraded mode (control works, spectrum down)
- Failure isolation (backend crash doesn't kill DSP connection)

**If you must:**
- Only proxy control socket (never spectrum)
- Add reconnection logic in proxy
- Document tradeoffs

---

### ❌ Mutate DOM in Spectrum Render Loop

**Why not:**
- DOM mutations trigger layout recalc (~16ms)
- Spectrum renders at 10 Hz, budget is 100ms
- Causes visible jank

**Breaks:**
- Smooth animation
- Frame budget

**If you must:**
- Use canvas rendering only
- Batch DOM updates outside render loop

---

### ❌ Skip Convergence After Config Upload

**Why not:**
- DSP may reject config (UI shows stale state)
- DSP may modify config (clamp parameters)
- External tools may have changed config

**Breaks:**
- State synchronization
- UI/DSP drift

**Never skip:**
- The `GetConfigJson` re-download step
- The `extractEqBandsFromConfig()` re-extraction

---

### ❌ Store Devices in Presets

**Why not:**
- Device names are machine-specific (hw:0 ≠ hw:1)
- Breaks portability across systems
- Causes audio routing errors

**Breaks:**
- Preset sharing
- Multi-machine deployment

**Always:**
- Omit `devices` section from saved presets
- Merge with current DSP config devices on load

---

### ❌ Allocate Objects in 10 Hz Loop

**Why not:**
- Triggers frequent GC pauses
- Causes frame drops

**Examples of bad patterns:**
```typescript
// ❌ Bad: allocates array every frame
function render() {
  const bins = new Array(256); // Allocates!
  // ...
}

// ✅ Good: reuse buffer
const bins = new Array(256);
function render() {
  // Reuse bins array
}
```

---

### ❌ Block UI on Network Operations

**Why not:**
- Network can timeout (5s+)
- User expects instant feedback

**Always:**
- Use optimistic updates
- Show loading states
- Handle errors gracefully

**Example:**
```typescript
// ❌ Bad: blocks UI
const result = await dsp.uploadConfig();
updateUI(result);

// ✅ Good: optimistic
updateUI(optimisticState);
try {
  const result = await dsp.uploadConfig();
  updateUI(result); // Converge
} catch (error) {
  revertUI(previousState);
  showError(error);
}
```

---

### ❌ Assume Single-Tab Usage

**Why not:**
- Users may open multiple tabs
- Last-write-wins causes confusion

**Known issue:**
- Multi-tab coordination not implemented

**If you must support:**
- Add BroadcastChannel coordination
- Or localStorage event listeners
- Or document single-tab limitation

---

### ❌ Ignore Validation Errors

**Why not:**
- Invalid configs crash CamillaDSP
- Orphaned pipeline references cause errors

**Always:**
- Validate before upload (`validateConfig()`)
- Check mixer routing (`validateMixerRouting()`)
- Handle rejection gracefully

---

## Performance Budgets

### Spectrum Path (10 Hz)
- **Budget:** 100ms per frame
- **Breakdown:**
  - WebSocket request: ~5ms
  - Parse + averaging: ~5ms
  - Smoothing: ~5ms
  - Canvas render: ~10ms
  - **Slack:** 75ms

**If exceeded:**
- Profile with DevTools
- Check for DOM mutations
- Check for allocations

---

### EQ Edit Path (Burst)
- **Budget:** 200ms debounce → instant upload
- **Breakdown:**
  - Build config: ~5ms
  - Validate: ~5ms
  - Upload: ~50-200ms (network)
  - Re-download: ~50-200ms (network)
  - Extract: ~5ms

**If exceeded:**
- Check config size (large filters)
- Check network latency

---

## Testing Requirements

### For New Features

**Server tests (Jest):**
- Route/integration tests via `fastify.inject()` (no real network required)
- Service unit tests for persistence + utilities (`configStore`, `configsLibrary`, `shellExec`)
- Cross-cutting behavior tests (e.g., `SERVER_READ_ONLY` enforcement at route layer)

**Client unit tests (Vitest):**
- Pure functions (filterResponse, spectrumParser, clamping, mapping)
- Type utilities (camillaTypes, knownTypes)
- Business logic (camillaEqMapping, pipelineBlockEdit, validators)

**Client integration tests (Vitest, in-process):**
- WebSocket lifecycle with in-process mock (`ws.WebSocketServer`)
  - Control + spectrum dual-socket lifecycle
  - Degraded mode transitions
  - Request queue, timeouts, cleanup
- Convergence model (upload → re-download → sync)
- Store behavior tests (`dspStore`, `eqStore`)

**HTTP client tests (Vitest):**
- Mock `fetch()` for REST calls (`/api/configs`, `/api/state/latest`, `/api/settings`)

**Component behavior tests (Vitest):**
- UI/component behavior where meaningful
- Keep most correctness in non-UI modules

**Run tests:**
- `npm test` (runs both server + client test suites)
- GitHub CI must pass before merge is accepted

---

### For Bug Fixes

**Regression test:**
- Add test that reproduces bug
- Verify fix resolves test
- Ensure no new failures

---

## Documentation Requirements

### For New Features

**Update:**
- User docs if user-facing (`docs/end-user/`)
- Developer docs if architectural (`docs/developer/`)
- Inline code comments for complex logic

**Format:**
- Markdown
- Code examples
- Concrete, not speculative

---

### For Breaking Changes

**Document:**
- What breaks
- Why it breaks
- Migration path
- Deprecation timeline

---

## Code Review Checklist

### Before Submitting PR

**Functionality:**
- [ ] Feature works end-to-end
- [ ] Handles errors gracefully
- [ ] No console errors

**Tests:**
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] New tests added for new code

**Performance:**
- [ ] No allocations in hot loops
- [ ] No blocking operations
- [ ] Debouncing for high-frequency events

**State:**
- [ ] Convergence model followed
- [ ] Optimistic updates + rollback
- [ ] Validation before upload

**Documentation:**
- [ ] Inline comments for complex logic
- [ ] README updated if needed
- [ ] Type definitions accurate

---

## Migration Patterns

### Deprecating a Feature

1. Mark as deprecated in code comments
2. Add console warning when used
3. Document migration path
4. Wait 1-2 releases
5. Remove deprecated code

**Example:**
```typescript
/**
 * @deprecated Use `newFunction()` instead. Will be removed in v2.0.
 */
export function oldFunction() {
  console.warn('oldFunction is deprecated, use newFunction');
  return newFunction();
}
```

---

### Breaking Changes

**Version bump:**
- Patch: Bug fixes, no breaking changes
- Minor: New features, backward compatible
- Major: Breaking changes

**Communication:**
- Changelog entry
- Migration guide
- GitHub release notes

---

## Common Pitfalls

### Type Narrowing in Pipeline Steps

**Problem:** CamillaDSP v2 vs v3 pipeline format differences

**Solution:** Use `normalizePipelineStep()` everywhere

```typescript
// ❌ Bad: assumes v3 format
const channels = step.channels;

// ✅ Good: normalized
const normalized = normalizePipelineStep(step);
const channels = normalized.channels;
```

---

### Filter Enablement State

**Problem:** Disabled filters stored in localStorage, not DSP

**Solution:** Always check both sources

```typescript
// Check if filter is active in DSP config
const isActive = step.names.includes(filterName);

// Check if filter is disabled in overlay
const isDisabled = getDisabledFilterLocations(filterName).length > 0;
```

---

### Preset Device Handling

**Problem:** Devices are machine-specific

**Solution:** Always use current DSP devices

```typescript
// ❌ Bad: uses preset devices
const config = presetData;

// ✅ Good: merges with current
const config = pipelineConfigToCamillaDSP(
  presetData,
  currentDspConfig // Uses currentDspConfig.devices
);
```

---

## Next Steps

- [Architecture](architecture.md) - Module responsibilities
- [State and Persistence](state-and-persistence.md) - State model
- [Data Flow](data-flow.md) - Control flows
- [Frontend](frontend.md) - Client architecture
- [Backend](backend.md) - Server architecture
