# Backend Architecture

**Intended audience:** OSS developers working on the server.

**This document does not cover:** Frontend implementation or deployment.

---

## Technology Stack

**Framework:** Fastify
**Language:** TypeScript (compiled to JavaScript ES modules)
**Runtime:** Node.js 18+
**Package manager:** npm

**Rationale:**
- Fastify: Fast, low-overhead HTTP framework with schema validation
- TypeScript: Type safety for config structures
- ES modules: Modern JavaScript, tree-shaking, better performance

---

## Directory Structure

```
server/
├── package.json           # Dependencies, scripts
├── tsconfig.json          # TypeScript config (ES modules)
├── jest.config.js         # Test configuration
│
├── data/                  # Runtime data directory
│   ├── configs/           # Preset library (*.json)
│   └── latest_dsp_state.json  # Recovery cache
│
└── src/
    ├── index.ts           # Entry point
    ├── app.ts             # Fastify app setup
    ├── logger.ts          # Winston logger
    ├── configPaths.ts     # Path resolution
    │
    ├── routes/            # HTTP endpoint handlers
    │   ├── health.ts      # GET /health
    │   ├── version.ts     # GET /api/version
    │   ├── config.ts      # GET/PUT /api/state/latest
    │   └── configs.ts     # GET/PUT /api/configs/*
    │
    ├── services/          # Business logic
    │   ├── configStore.ts      # Single-file persistence
    │   ├── configsLibrary.ts   # Preset library management
    │   └── shellExec.ts        # Safe shell execution (unused in prod)
    │
    ├── types/
    │   └── errors.ts      # AppError class, error codes
    │
    └── __tests__/         # Integration tests
        └── routes.test.ts
```

---

## Application Lifecycle

### Startup (server/src/index.ts)
```
1. Resolve data directory paths (configPaths.ts)
2. Create Fastify app (app.ts)
3. Register routes
4. Start HTTP server (port 3000 default)
5. Log "Server listening on http://0.0.0.0:3000"
```

### Shutdown
```
1. Graceful shutdown (SIGTERM/SIGINT)
2. Close HTTP server (drain connections)
3. Exit process
```

---

## HTTP Routes

### Health Check

**Endpoint:** `GET /health`  
**Handler:** `server/src/routes/health.ts`

**Response:**
```json
{
  "status": "ok"
}
```

**Use case:** Kubernetes liveness probe, systemd health check

---

### Version

**Endpoint:** `GET /api/version`  
**Handler:** `server/src/routes/version.ts`

**Response:**
```json
{
  "version": "1.0.0"
}
```

**Source:** `package.json` version field

---

### Recovery Cache

**Endpoint:** `GET /api/state/latest`  
**Handler:** `server/src/routes/config.ts`

**Response:** Full CamillaDSP config JSON

**Use case:**
- Client reconnects after crash/reload
- Retrieves last-applied DSP state
- Avoids starting from empty config

---

**Endpoint:** `PUT /api/state/latest`  
**Handler:** `server/src/routes/config.ts`

**Request body:** Full CamillaDSP config JSON

**Response:**
```json
{
  "message": "Config saved successfully"
}
```

**Use case:**
- Client uploads config to DSP
- Writes-through to backend for recovery
- Non-fatal if fails (best-effort)

**File:** `server/data/latest_dsp_state.json`

---

### Preset Library

**Endpoint:** `GET /api/configs`  
**Handler:** `server/src/routes/configs.ts`

**Response:**
```json
{
  "configs": [
    {
      "id": "harman-target",
      "name": "Harman Target",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    ...
  ]
}
```

**ID generation:** Kebab-case from filename  
**Name extraction:** From JSON `configName` field

---

**Endpoint:** `GET /api/configs/:id`  
**Handler:** `server/src/routes/configs.ts`

**Response:** Pipeline-config JSON (see [pipelineConfigMapping.ts](../client/src/lib/pipelineConfigMapping.ts))

**Use case:** Load preset into UI

---

**Endpoint:** `PUT /api/configs/:id`  
**Handler:** `server/src/routes/configs.ts`

**Request body:** Pipeline-config JSON

**Response:**
```json
{
  "message": "Config saved successfully",
  "id": "harman-target"
}
```

**Use case:** Save current EQ/pipeline as preset

**File:** `server/data/configs/:id.json`

---

## Services

### ConfigStore (configStore.ts)

**Purpose:** Atomic single-file persistence

**Key functions:**

`readConfig(filepath)`
- Reads JSON file
- Returns parsed object
- Throws if file missing or invalid JSON

`writeConfig(filepath, data)`
- Writes JSON file atomically
- Write to temp file → rename (atomic on POSIX)
- Creates parent directories if needed
- Size limit: 1MB

**Atomic write flow:**
```
1. Write to <filepath>.tmp
2. fsync() to flush kernel buffers
3. Rename <filepath>.tmp → <filepath>
4. Delete temp file on error
```

**Error handling:**
- Throws `AppError` with error code
- Caller decides retry/fallback

---

### ConfigsLibrary (configsLibrary.ts)

**Purpose:** Preset library management

**Key functions:**

`listConfigs()`
- Scans `server/data/configs/*.json`
- Returns list with ID, name, timestamps

`getConfig(id)`
- Reads `server/data/configs/:id.json`
- Returns parsed pipeline-config

`saveConfig(id, data)`
- Writes `server/data/configs/:id.json`
- Uses `configStore.writeConfig()` for atomicity

**ID normalization:**
- Kebab-case filename
- Example: `"Harman Target"` → `harman-target.json`

---

### ShellExec (shellExec.ts)

**Purpose:** Safe shell command execution

**Features:**
- Timeout protection (default: 10s)
- Output size limits (default: 1MB)
- Command whitelist (optional)
- Abort on timeout/size exceeded

**Status:** Not used in production (included for future tooling)

---

## Error Handling

### AppError Class (types/errors.ts)

**Purpose:** Structured error responses

**Shape:**
```typescript
class AppError extends Error {
  code: ErrorCode;
  statusCode: number;
  details?: any;
}
```

**Error codes:**
- `ERR_CONFIG_NOT_FOUND` (404)
- `ERR_CONFIG_INVALID_JSON` (400)
- `ERR_CONFIG_READ_FAILED` (500)
- `ERR_CONFIG_WRITE_FAILED` (500)
- `ERR_CONFIG_TOO_LARGE` (413)

**Fastify error handler:**
- Catches `AppError` instances
- Returns JSON with `{ error, code, details? }`
- Logs stack trace to console

---

## Configuration

### Environment Variables

**SERVER_PORT** (default: 3000)
- HTTP server port

**DATA_DIR** (default: `./server/data`)
- Data directory for presets + recovery cache

**LOG_LEVEL** (default: `info`)
- Winston log level (debug, info, warn, error)

**NODE_ENV** (default: `development`)
- `production` → serves built frontend
- `development` → API only (Vite serves frontend)

---

### Path Resolution (configPaths.ts)

**Functions:**

`getDataDir()`
- Returns absolute path to data directory
- Checks `DATA_DIR` env, fallback to `./server/data`

`getConfigsDir()`
- Returns `<dataDir>/configs`

`getLatestStatePath()`
- Returns `<dataDir>/latest_dsp_state.json`

**Ensures:**
- Paths are absolute
- Directories exist (creates if missing)

---

## Static File Serving

### Production Mode (NODE_ENV=production)

**Behavior:**
- Serves `server/dist/client/*` at `/`
- SPA fallback: All non-API routes → `index.html`
- API routes prioritized (`/api/*`, `/health`)

**Build artifact:**
- `npm run build` copies `client/dist/` → `server/dist/client/`

---

### Development Mode

**Behavior:**
- Does NOT serve frontend (Vite dev server on 5173)
- API only on port 3000
- CORS not needed (Vite proxies `/api/*` to 3000)

---

## Logging

**Logger:** Winston (`server/src/logger.ts`)

**Log levels:**
- `error` - Unrecoverable errors
- `warn` - Recoverable errors (e.g., file read failures)
- `info` - Startup, shutdown, HTTP requests
- `debug` - Detailed operation traces

**Output:**
- Console (colorized in dev)
- File: `server/logs/app.log` (production)

**Request logging:**
- Fastify plugin logs all requests
- Format: `GET /api/configs 200 12ms`

---

## Testing

**Framework:** Jest

**Test types:**
- Unit tests for services (`configStore`, `configsLibrary`)
- Integration tests for routes (`routes.test.ts`)

**Run tests:** `npm test` (from server directory)

**Coverage:** `npm run test:coverage`

---

## Security

### Input Validation

**JSON schema validation:**
- Fastify validates request bodies against schemas
- Rejects invalid payloads with 400

**File path sanitization:**
- Config IDs must be alphanumeric + hyphens
- Prevents directory traversal (`../../etc/passwd`)

**Size limits:**
- Request body: 1MB max (Fastify default)
- Config files: 1MB max (enforced by configStore)

---

### No Authentication/Authorization

**Current state:** No auth layer

**Rationale:**
- Designed for trusted LAN deployment
- User responsible for network security

**Future:** Add auth middleware if needed (JWT, basic auth)

---

## Performance

### File I/O
- Async operations only (no blocking)
- Atomic writes prevent corruption
- No caching (configs small, infrequent access)

### HTTP
- Keep-alive enabled (default)
- Compression (gzip/brotli) via Fastify plugin

### Startup
- Lazy directory creation (on-demand)
- No config preloading (load on first request)

---

## Failure Modes

### Data Directory Missing
- Creates on startup (via `configPaths.ts`)
- Logs warning if creation fails
- Server starts anyway (degraded)

### Config File Corrupted
- Read error logged
- Returns 500 to client
- Does not crash server

### Disk Full
- Write fails with `ERR_CONFIG_WRITE_FAILED`
- Temp file cleaned up
- Returns 500 to client

---

## Deployment

### Production Build
```bash
npm run build
```

**Output:**
- `server/dist/` - Compiled TypeScript
- `server/dist/client/` - Built frontend

---

### Start Production Server
```bash
npm run start
```

**Runs:** `node server/dist/index.js`

**Environment:**
- Set `NODE_ENV=production`
- Set `SERVER_PORT` if needed
- Set `DATA_DIR` for custom path

---

## Extension Points

### Add New Endpoint
1. Create route handler in `server/src/routes/`
2. Register in `server/src/app.ts`
3. Add tests in `server/src/__tests__/`

### Add New Service
1. Create service in `server/src/services/`
2. Export functions, document contracts
3. Add unit tests

### Add Persistence Layer
1. Extend `configStore.ts` with new file format
2. Or add new service (e.g., `database.ts` for SQLite)

---

## Next Steps

- [Frontend](frontend.md) - Client architecture
- [State and Persistence](state-and-persistence.md) - State ownership model
- [Extension Points](extension-points.md) - Detailed extension guidance
- [Runtime Topology](runtime-topology.md) - Process diagram
