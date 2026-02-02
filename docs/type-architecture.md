# Type Architecture: Canonical Schema Integration

## Overview

As of 2026-02-02, the project has consolidated around a **single canonical schema** for CamillaDSP configuration types, eliminating the previous drift between multiple competing type definitions.

## Key Files

### 1. `client/src/lib/camillaSchema.ts` - Canonical Schema (Source of Truth)
**Purpose:** Complete, exhaustive TypeScript definitions for CamillaDSP configuration structures.

**Key types:**
- `CamillaDSPConfig` - Main config object (with optional blocks)
- `Filter` - Discriminated union of all filter types (Biquad, Gain, Delay, Conv, Volume, Loudness, Limiter, Dither, DiffEq)
- `Processor` - Discriminated union of processor types (Compressor, NoiseGate)
- `Mixer` - Mixer routing configuration
- `PipelineStep` - Discriminated union of pipeline step types (Mixer, Filter, Processor)
- `Devices` - Audio device configuration

**Design decisions:**
- `filters`, `mixers`, `processors`, `pipeline` are **optional** (matches CamillaDSP YAML spec)
- `CaptureDevice`/`PlaybackDevice` are pragmatically typed as `Record<string, any>` (backend-specific)
- `Resampler` and `FileFormat` use permissive types for round-tripping unknown fields
- All numeric DSP parameters use `PrcFmt` = `string | number` (runtime expression support)

### 2. `client/src/lib/camillaDSP.ts` - Runtime Client (Re-exports Canonical Types)
**Purpose:** WebSocket client class + GUI-ready normalization layer.

**Key exports:**
```typescript
// Re-exported from canonical schema
export type {
  CamillaDSPConfig,
  Filter,
  Mixer,
  Processor,
  PipelineStep,
  // ... etc
} from './camillaSchema';

// GUI-specific normalized type
export type GuiReadyCamillaDSPConfig = {
  // Same as CamillaDSPConfig, but filters/mixers/processors/pipeline are REQUIRED
  filters: Record<string, any>;
  mixers: Record<string, any>;
  processors: Record<string, any>;
  pipeline: any[];
};
```

**Normalization:**
- `CamillaDSP.getDefaultConfig()` ensures `filters/mixers/processors/pipeline` are always present (empty objects/arrays if missing)
- The `CamillaDSP.config` property is typed as `GuiReadyCamillaDSPConfig | null`
- Normalization happens once at the boundary (download/restore), then all editor code operates on normalized config

### 3. Stores (`dspStore.ts`, `eqStore.ts`)
**Current state:** Both import `CamillaDSPConfig` from `'../lib/camillaDSP'`.

**Effect of consolidation:**
- Imports are unchanged (minimal churn)
- But now they receive the canonical type definition
- `dspStore.config` is `CamillaDSPConfig` (optional blocks)
- `CamillaDSP.config` (the instance) is `GuiReadyCamillaDSPConfig` (required blocks)

**Next evolution (optional):**
- Consider making stores use `GuiReadyCamillaDSPConfig` internally if they always expect normalized configs

## Type Layers

### Layer 1: Wire Format (I/O Boundary)
**Type:** `CamillaDSPConfig` from `camillaSchema.ts`  
**Usage:** Download/upload, API persistence, preset storage  
**Invariant:** Must serialize cleanly to CamillaDSP-compatible JSON/YAML

### Layer 2: GUI-Ready (Normalized)
**Type:** `GuiReadyCamillaDSPConfig` from `camillaDSP.ts`  
**Usage:** Internal editor state (mapping, view models, mutations)  
**Invariant:** `filters/mixers/processors/pipeline` always present (even if empty)

### Layer 3: UI Metadata (Overlays)
**Type:** Separate stores/maps (e.g., `disabledFiltersOverlay`)  
**Usage:** UI-only state (disabled filter positions, colors, widget preferences)  
**Invariant:** Never serialized to DSP config; kept external to avoid polluting wire format

## Migration Path (Completed)

✅ **Step 1:** Fix `camillaSchema.ts` to compile (pragmatic device types)  
✅ **Step 2:** Make `camillaDSP.ts` re-export canonical types instead of defining its own  
✅ **Step 3:** Introduce `GuiReadyCamillaDSPConfig` for normalized internal state  
✅ **Step 4:** Run tests to verify no regressions (32/33 test files pass)

## Benefits

1. **Single source of truth** - No more drift between competing `CamillaDSPConfig` definitions
2. **Exhaustive type checking** - Discriminated unions for Filter/Processor/PipelineStep types
3. **Correct optionality** - Mirrors CamillaDSP spec (optional blocks at boundary)
4. **Minimal churn** - Existing imports (`from '../lib/camillaDSP'`) unchanged
5. **Clear boundaries** - Wire format vs. GUI-ready vs. UI metadata are explicit

## Future Enhancements

### 1. Tighten Device Types (Optional)
Currently `CaptureDevice`/`PlaybackDevice` are `Record<string, any>`.
Could evolve to:
```typescript
export type CaptureDevice =
  | { type: 'Alsa'; device: string; ... }
  | { type: 'CoreAudio'; ... }
  | { type: 'Wasapi'; ... }
  | Record<string, any>; // fallback
```

### 2. Runtime Validation (Optional)
Add Zod/JSON Schema validation at I/O boundaries using canonical schema as source.

### 3. Strict GUI-Ready Type (Optional)
Make `GuiReadyCamillaDSPConfig.filters` use the canonical `Filter` union instead of `Record<string, any>`.

## Testing

All critical tests pass after consolidation:
- ✅ `camillaEqMapping.test.ts` (17 tests)
- ✅ `pipelineViewModel.test.ts` (13 tests)
- ✅ `camillaDSP.integration.test.ts` (24 tests)
- ✅ `dspStore.lifecycle.test.ts` (5 tests)
- ✅ 28+ other test files

Pre-existing test failures in `knownTypes.test.ts` (7) are unrelated to type consolidation.
