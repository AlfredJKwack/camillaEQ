Below is my **code audit report** (non-security; also excluding perf/scalability and dependency-health per your non-goals). Scope covered: `client/src/*`, `server/src/*`, `tools/*.js` plus the specified docs (product context + CamillaDSP websocket/readme).

---

# CamillaEQ Code Audit Report

## Executive summary

- **Overall architecture** is small and understandable: Svelte client does the heavy lifting; server persists JSON configs and provides a small REST API. This aligns with the product context’s “low-footprint server” goal.
- **Reliability risks** center around WebSocket request/response correlation (client), background intervals/listeners (client), and schema validation/typing gaps (client+server). These are mostly **fixable without big refactors**.
- **Tests exist** (server has meaningful unit tests for storage + shell exec; client has DSP integration tests + DSP/math unit tests), but UI tests are mostly structural/placeholder.
- **Observability**: server is reasonably strong (structured Pino logging + request IDs). Client mostly uses `console.*` and lacks structured “event” logging/diagnostics hooks.

---

## Architecture & Design

### Finding A1 — Mixed concerns in `server/src/index.ts` (routing, logging, lifecycle)
- **Severity:** Medium
- **Description:** `server/src/index.ts` contains framework config, request/response logging hooks, error handling, route definitions, and service wiring. This is fine at MVP scale, but growth will cause “index.ts as god file”.
- **Evidence:** `server/src/index.ts` contains Fastify instantiation, hooks, error handler, and all API routes.
- **Impact:** Harder to evolve (e.g., adding auth, additional routers, middleware). Raises risk of accidental changes affecting unrelated endpoints.
- **Recommendation:** Split into modules:
  - `server/src/app.ts` (Fastify instance + hooks + error handling)
  - `server/src/routes/*.ts` (route registration)
  - `server/src/index.ts` (boot only)

---

### Finding A2 — Client does heavy “domain mapping” inline (no explicit boundary)
- **Severity:** Medium
- **Description:** The client’s “domain logic” (EQ band extraction + application + clamping) is spread across `eqStore.ts`, `camillaEqMapping.ts`, and rendering code. This is expected, but there’s no explicit boundary between:
  1) “CamillaDSP config protocol”
  2) “EQ domain model”
  3) UI state + rendering
- **Evidence:**
  - Mapping logic: `client/src/lib/camillaEqMapping.ts` (`extractEqBandsFromConfig`, `applyEqBandsToConfig`).
  - UI store logic + persistence behavior: `client/src/state/eqStore.ts`.
- **Impact:** As EQ features expand (more filter types, per-channel editing, pipeline edits), the coupling makes changes riskier.
- **Recommendation:** Keep it simple but enforce a boundary:
  - treat `camillaEqMapping.ts` as the only module allowed to interpret CamillaDSP filter structures.
  - keep store actions “pure” where possible and move HTTP persistence (`fetch('/api/state/latest')`) behind a small `client/src/lib/api.ts`.

---

### Finding A3 — Spectrum analyzer design is intentionally “hacky” but coupled to config semantics
- **Severity:** Low
- **Description:** The spectrum is implemented as a 256-bandpass filterbank (“poor man’s FFT”). This matches the docs, but the UI is now coupled to the presence/behavior of that special spectrum pipeline.
- **Evidence:**
  - `tools/build-camillaDSP-spectrum-yml.js` generates 256 filters + mixer + pipeline.
  - Client polls `GetPlaybackSignalPeak` from the spectrum socket: `client/src/lib/camillaDSP.ts#getSpectrumData`.
- **Impact:** Troubleshooting becomes harder when the user’s CamillaDSP config doesn’t align with the expected spectrum pipeline.
- **Recommendation:** Add explicit UX + runtime checks:
  - At connect-time, detect if spectrum socket returns the expected bin count (256) and warn with actionable help.
  - Store “spectrum supported” flag in `dspState`.

---

## Correctness & Reliability

### Finding R1 — WebSocket request/response correlation is unsafe under concurrency
- **Severity:** High
- **Status:** ✅ **Resolved** (2026-01-30)
- **Description:** `sendDSPMessage` and `sendSpectrumMessage` attach a `message` listener per request and resolve once a response with matching command name arrives. This fails when:
  - two requests for the same command are in-flight (second caller may "steal" the first response)
  - responses arrive out of order
  - a response never arrives (listener remains until a matching response appears)
- **Evidence:** `client/src/lib/camillaDSP.ts`:
  - `sendDSPMessage(...)`: matches only `responseCommand !== commandName` and then removes listener.
  - no per-request correlation ID exists; command name is the only discriminator.
- **Impact:** Can cause wrong UI state updates, hung promises, and "heisenbugs" when user interaction triggers overlapping calls (e.g., fast volume changes, reconnect flows).
- **Recommendation:** Implement a small request queue/mutex per socket OR add a correlation mechanism:
  - simplest: **serialize requests** per socket (one in-flight at a time). Given embedded + UI usage, this is often enough.
  - add a **timeout** per request to reject and remove listener.
- **Resolution:**
  - Implemented `SocketRequestQueue` class (`client/src/lib/requestQueue.ts`) that serializes requests per socket
  - Updated `CamillaDSP` class to use separate queues for control and spectrum sockets
  - All requests now processed serially (one in-flight at a time per socket)
  - Comprehensive tests added (`client/src/lib/__tests__/camillaDSP.requestSafety.test.ts`)

---

### Finding R2 — Missing timeouts on client WebSocket requests
- **Severity:** Medium
- **Status:** ✅ **Resolved** (2026-01-30)
- **Description:** If CamillaDSP is stalled/unresponsive, `sendDSPMessage` promises may never resolve/reject.
- **Evidence:** `client/src/lib/camillaDSP.ts#sendDSPMessage` and `#sendSpectrumMessage` have no timeout logic.
- **Impact:** UI can become stuck in pending states; memory leak risk from retained closures.
- **Recommendation:** Add per-call timeout (e.g., 2–5s) with listener cleanup.
- **Resolution:**
  - Added configurable timeout support via `CamillaDSPOptions` (controlTimeoutMs, spectrumTimeoutMs)
  - Default: 5000ms for control socket, 2000ms for spectrum socket
  - Each request includes timeout handler that cleans up listeners and rejects promise
  - Tests verify timeout behavior and cleanup

---

### Finding R3 — Potential ResizeObserver leak in EQ page
- **Severity:** Medium
- **Status:** ✅ **Resolved** (2026-01-30)
- **Description:** `EqPage.svelte` creates a `ResizeObserver` in a reactive `$:` block, but does not disconnect/unobserve. Reactive blocks can re-run, potentially registering multiple observers.
- **Evidence:** `client/src/pages/EqPage.svelte`:
  - `$: if (plotElement) { const observer = new ResizeObserver(...); observer.observe(plotElement); }`
  - no `observer.disconnect()` in `onDestroy` and no guard to create it only once.
- **Impact:** Memory leak + redundant callbacks leading to jank over long sessions.
- **Recommendation:** Create the observer once in `onMount` and `disconnect()` in `onDestroy`, or use a guard variable.
- **Resolution:**
  - Moved `ResizeObserver` creation from reactive block to `onMount`
  - Added proper cleanup with `resizeObserver.disconnect()` in `onDestroy`
  - Observer now created once and properly disposed

---

### Finding R4 — Interval-based spectrum polling lacks cancellation when connection changes
- **Severity:** Medium
- **Status:** ✅ **Resolved** (2026-01-30)
- **Description:** Polling starts based on `overlayEnabled && isConnected && !spectrumPollingInterval`, and stops only when `!overlayEnabled`. If the socket disconnects while overlay is enabled, polling may continue running and throw repeatedly.
- **Evidence:** `client/src/pages/EqPage.svelte` reactive block controlling polling.
- **Impact:** Console noise, wasted CPU, and possibly repeated exception paths.
- **Recommendation:** Include connection state in the stop condition. If `!isConnected`, clear the interval.
- **Resolution:**
  - Updated reactive block in `EqPage.svelte` to stop polling when `!overlayEnabled || !isConnected`
  - Polling now stops immediately when connection is lost, even if overlay remains enabled
  - Includes logging to track polling state changes

---

### Finding R5 — Server endpoints accept unvalidated JSON bodies
- **Severity:** Medium
- **Status:** ✅ **Resolved** (2026-01-30)
- **Description:** `server.put('/api/config')`, `/api/state/latest`, and `/api/configs/:id` accept `request.body` and persist it without schema validation.
- **Evidence:** `server/src/index.ts`:
  - `await configStore.writeConfig(request.body)`
  - `await configsLibrary.saveConfig(id, request.body as PipelineConfig)`
- **Impact:** Bad payloads can poison stored state, causing later failures in the UI or restore flows.
- **Recommendation:** Use Fastify JSON schema validation for these routes.
  - Minimal version: validate "shape exists" + size limit (already enforced in storage) + required keys.
- **Resolution:**
  - Added Fastify schema validation to `PUT /api/config`, `PUT /api/state/latest`, and `PUT /api/configs/:id`
  - Config endpoints require: `devices`, `filters`, `mixers`, `pipeline` (array)
  - Library endpoint requires: `configName` (string), `filterArray` (array)
  - Invalid payloads now rejected with 400 validation error

---

### Finding R6 — Inconsistent CamillaDSP pipeline schema handling (v2 vs v3) is partially handled
- **Severity:** Medium
- **Status:** ✅ **Resolved** (2026-01-30)
- **Description:** You support both `channel: number` (v2 style) and `channels: number[]` (v3 style) in some places, but not consistently.
- **Evidence:**
  - `client/src/lib/camillaEqMapping.ts` handles both for reference channel detection and channel tracking.
  - `client/src/lib/camillaDSP.ts` defines pipeline step type union where Filter uses `channels: number[]`.
  - The mock uses `channel: 0` in several places (`server/src/services/mockCamillaDSP.ts`), which diverges from the client’s typed expectation.
- **Impact:** Edge cases where mapping or validation fails depending on which schema the DSP returns; tests may hide it due to mocking.
- **Recommendation:** Normalize config on download:
  - convert any v2 `channel` into v3 `channels: [channel]` in one place (client).
  - align mock + integration tests with that normalization.
- **Resolution:**
  - Removed all v2 (`channel: number`) support - v3-only (`channels: number[]`)
  - Updated `camillaEqMapping.ts` to expect only v3 format
  - Updated mock to emit v3 format in both YAML and JSON
  - All tests pass with v3-only schema

---

### Finding R7 — EQ “enabled” state is stored via `params.bypassed` (filter-level) only
- **Severity:** Low
- **Description:** Enabled/disabled uses `filterDef.parameters.bypassed`, but pipeline step bypass (`step.bypassed`) is also possible and may be used by other tooling/configs.
- **Evidence:** `client/src/lib/camillaEqMapping.ts`:
  - enabled = `!params.bypassed && !pipelineBypassed` (but pipelineBypassed only checks the channel0 step’s bypass, not each step)
  - apply writes only `params.bypassed`
- **Impact:** Slight mismatch when config uses pipeline bypass per-channel/step.
- **Recommendation:** Decide a single canonical representation:
  - either always store bypass on filter parameters, or on pipeline step; then normalize both ways.

---

## Code Quality & Maintainability

### Finding M1 — Heavy use of `any` and loose dictionaries around core config types
- **Severity:** Medium
- **Description:** The CamillaDSP config is inherently dynamic, but `any` and `[k: string]: any` appear in core interfaces and mapping logic.
- **Evidence:**
  - `client/src/lib/camillaDSP.ts`: `[k: string]: any`, `parameters: Record<string, any>`, `processors?: Record<string, any>`.
  - `client/src/lib/camillaEqMapping.ts`: many `(step as any)` casts.
  - `server/src/services/configsLibrary.ts`: `filterArray: Array<Record<string, any>>`.
- **Impact:** Fewer compiler guarantees; higher regression risk for mapping logic.
- **Recommendation:** Introduce minimal “typed islands” without over-engineering:
  - define `BiquadFilterDefinition` shape for the supported subtypes (`freq`, `q`, optional `gain`, optional `bypassed`).
  - define a normalized pipeline step interface (`FilterStepNormalized { type:'Filter'; channels:number[]; names:string[]; bypassed?:boolean }`).

---

### Finding M2 — Client logging is mostly `console.*`
- **Severity:** Low
- **Description:** There are many `console.log/warn/error` calls, including debug-only messages.
- **Evidence:** Search results show ~55 matches in `client/src` TS files.
- **Impact:** Harder to debug systematically (no levels, no structured data, no “report” export).
- **Recommendation:** Keep it lightweight:
  - create a `client/src/lib/log.ts` with `debug/info/warn/error` and an env flag.
  - optionally mirror the server’s requestId in client logs where relevant.

---

### Finding M3 — Tests in client include source-string assertions (brittle)
- **Severity:** Low
- **Description:** Some UI tests read the `.svelte` source and assert classnames / strings.
- **Evidence:** `client/src/pages/EqPage.test.ts` reads file source and checks for `eq-octaves-area`, etc.
- **Impact:** Refactoring markup or classnames breaks tests without necessarily breaking behavior.
- **Recommendation:** Where possible, move to component rendering tests with `@testing-library/svelte` and assert behavior/DOM, not raw source.

---

## Test Coverage & Test Quality

### Finding T1 — Strong server service tests; good coverage of failure modes
- **Severity:** Low (positive)
- **Description:** Server has meaningful tests for `ConfigStore` (atomic writes, size limits, invalid JSON) and `shellExec` (whitelist, timeout, output limits).
- **Evidence:**
  - `server/src/services/__tests__/configStore.test.ts`
  - `server/src/services/__tests__/shellExec.test.ts`
- **Impact:** Regressions in persistence / process execution logic are likely to be caught.
- **Recommendation:** Keep this pattern; consider adding route-level tests for `/api/state/latest` and `/api/configs/:id` similar to `/api/config`.

---

### Finding T2 — Client has good protocol integration tests, but UI-level behavior is lightly tested
- **Severity:** Medium
- **Description:** `CamillaDSP` client is tested against mock WS servers, which is valuable. UI tests are currently placeholders/structure checks.
- **Evidence:**
  - `client/src/lib/__tests__/camillaDSP.integration.test.ts` is thorough.
  - `client/src/App.test.ts` is placeholder.
- **Impact:** Regressions in UI behavior (connect flow, reconnect flow, EQ editing) may ship unnoticed.
- **Recommendation:** Add a minimal set of UI behavior tests:
  - ConnectPage: filling form triggers `connect(...)` and shows connected state.
  - EqPage: when store has bands, interactions call `setBandGain/freq/q`.

---

## Observability & Operations

### Finding O1 — Server has good structured logging + request IDs
- **Severity:** Low (positive)
- **Description:** Fastify logger configured with Pino (pretty in dev), base service name, request/response hooks log method/url/status/duration/requestId.
- **Evidence:** `server/src/index.ts` logger config + `onRequest` and `onResponse` hooks.
- **Impact:** Helpful for diagnosing production issues.
- **Recommendation:** Consider adding:
  - a log field for client IP (if needed)
  - optional error “code” on non-AppError exceptions

---

### Finding O2 — No health details / readiness probes beyond `{status:'ok'}`
- **Severity:** Low
- **Description:** `/health` always returns ok, without checking filesystem access to the config directory.
- **Evidence:** `server/src/index.ts` health endpoint.
- **Impact:** In production/embedded setups, server may be “up” but unable to write configs.
- **Recommendation:** Add a lightweight readiness check:
  - verify config dir is writable (or can create temp file)
  - optionally report free disk space (if you care)

---

### Finding O3 — Client lacks a user-visible diagnostics “export”
- **Severity:** Low
- **Description:** You do track failures in `dspStore.failures` and display them on ConnectPage, which is great. But there’s no export/copy or retention policy besides “clear on any success”.
- **Evidence:**
  - `client/src/state/dspStore.ts`: clears failures on any success.
  - `client/src/pages/ConnectPage.svelte`: renders failure list.
- **Impact:** Intermittent issues can disappear before a user can report them.
- **Recommendation:** Keep lightweight:
  - store last N failures (e.g., 50) and allow “Copy diagnostics” JSON.

---

# Appendix — Notable implementation notes (context)

- The product context strongly prioritizes **server minimalism** and **browser-side compute**. The current split (Svelte client doing visualization + DSP mapping; small Fastify server doing storage) aligns well.
- The CamillaDSP websocket protocol lacks a built-in correlation id; therefore **serializing requests** is a pragmatic reliability improvement.

---

## Next steps (suggested priority order)

1. **Fix WS request safety:** serialize requests per socket + add timeouts. (Addresses R1/R2)
2. **Fix observer/interval cleanup in EqPage.** (R3/R4)
3. **Add server request schema validation.** (R5)
4. **Normalize v2/v3 pipeline shapes on download.** (R6)

If you want, I can turn the top 2–3 findings into a concrete implementation plan + patches. To do that, ask me to **toggle to Act mode** and tell me which findings you want fixed first.