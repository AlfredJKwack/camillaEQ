# REST API Reference

**Base URL:** `http://localhost:3000` (development)

All endpoints return JSON. Error responses follow a consistent structure.

---

## Error Response Format

```json
{
  "error": {
    "code": "ERR_CONFIG_NOT_FOUND",
    "message": "Config file not found",
    "statusCode": 404,
    "details": {}
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `ERR_CONFIG_NOT_FOUND` | Config file does not exist |
| `ERR_CONFIG_INVALID_JSON` | Config file contains invalid JSON |
| `ERR_CONFIG_TOO_LARGE` | Config exceeds 1MB size limit |
| `ERR_CONFIG_WRITE_FAILED` | Failed to write config to disk |
| `ERR_SHELL_TIMEOUT` | Shell command exceeded timeout |
| `ERR_SHELL_OUTPUT_TOO_LARGE` | Command output exceeded size limit |
| `ERR_SHELL_COMMAND_NOT_ALLOWED` | Command not in whitelist |
| `ERR_SHELL_EXECUTION_FAILED` | Command execution failed |
| `ERR_INTERNAL_SERVER` | Internal server error |
| `ERR_NOT_FOUND` | Resource not found |
| `ERR_BAD_REQUEST` | Invalid request |

---

## Health & Version

### GET /health

**Description:** Server health check

**Response:**
```json
{
  "status": "ok"
}
```

**Status Codes:**
- `200 OK` - Server is healthy

---

### GET /api/version

**Description:** Get server version and build information

**Response:**
```json
{
  "version": "0.1.0",
  "buildHash": "abc123def456",
  "buildTime": "2026-01-26T20:00:00.000Z"
}
```

**Status Codes:**
- `200 OK` - Success

---

## Configuration Persistence

### GET /api/config

**Description:** Read the current DSP config file from disk

**Response:**
```json
{
  "devices": { ... },
  "filters": { ... },
  "mixers": { ... },
  "pipeline": [ ... ],
  "processors": { ... }
}
```

**Status Codes:**
- `200 OK` - Config loaded successfully
- `404 Not Found` - Config file does not exist

**Error Example:**
```json
{
  "error": {
    "code": "ERR_CONFIG_NOT_FOUND",
    "message": "Config file not found",
    "statusCode": 404
  }
}
```

---

### PUT /api/config

**Description:** Write DSP config to disk with atomic operation

**Request Body:**
```json
{
  "devices": { ... },
  "filters": { ... },
  "mixers": { ... },
  "pipeline": [ ... ],
  "processors": { ... }
}
```

**Response:**
```json
{
  "success": true
}
```

**Status Codes:**
- `200 OK` - Config saved successfully
- `400 Bad Request` - Invalid JSON or validation failed
- `413 Payload Too Large` - Config exceeds 1MB limit
- `500 Internal Server Error` - Write operation failed

**Error Example:**
```json
{
  "error": {
    "code": "ERR_CONFIG_TOO_LARGE",
    "message": "Config size (1500000 bytes) exceeds maximum allowed size (1048576 bytes)",
    "statusCode": 413
  }
}
```

---

## Latest State Persistence

### GET /api/state/latest

**Description:** Read the last applied DSP state (write-through cache)

**Response:**
```json
{
  "devices": { ... },
  "filters": { ... },
  "mixers": { ... },
  "pipeline": [ ... ],
  "processors": { ... }
}
```

**Status Codes:**
- `200 OK` - State loaded successfully
- `404 Not Found` - No state file exists yet

**Notes:**
- This endpoint returns the most recent config uploaded to CamillaDSP
- Used for recovery when CamillaDSP returns an empty config on connect
- Updated automatically by `eqStore.ts` on every successful upload

---

### PUT /api/state/latest

**Description:** Save the current DSP state (write-through persistence)

**Request Body:**
```json
{
  "devices": { ... },
  "filters": { ... },
  "mixers": { ... },
  "pipeline": [ ... ],
  "processors": { ... }
}
```

**Response:**
```json
{
  "success": true
}
```

**Status Codes:**
- `200 OK` - State saved successfully
- `400 Bad Request` - Invalid JSON
- `413 Payload Too Large` - State exceeds 1MB limit
- `500 Internal Server Error` - Write operation failed

**Notes:**
- Called automatically by `eqStore.ts` after successful CamillaDSP upload
- Non-fatal: continues if server unavailable

---

## Configuration Library (Presets)

### GET /api/configs

**Description:** List all saved configuration presets

**Response:**
```json
[
  {
    "id": "harman-target",
    "configName": "Harman Target",
    "file": "harman-target.json",
    "mtimeMs": 1706389200000,
    "size": 2048
  },
  {
    "id": "tangzu-waner",
    "configName": "Tangzu Waner",
    "file": "tangzu-waner.json",
    "mtimeMs": 1706389100000,
    "size": 3072
  }
]
```

**Status Codes:**
- `200 OK` - List retrieved successfully (may be empty array)

**Response Fields:**
- `id` - Kebab-case identifier derived from filename
- `configName` - Human-readable name from config JSON
- `file` - Original filename
- `mtimeMs` - Last modified timestamp (milliseconds since epoch)
- `size` - File size in bytes

---

### GET /api/configs/:id

**Description:** Load a specific configuration preset

**URL Parameters:**
- `id` - Config identifier (kebab-case, e.g., `harman-target`)

**Response (legacy EQ format):**
```json
{
  "configName": "Harman Target",
  "accessKey": "optional-key",
  "filterArray": [
    {
      "type": "filter",
      "id": "band1",
      "freq": 105,
      "gain": 5.2,
      "q": 0.71,
      "filterType": "peaking"
    },
    {
      "type": "preamp",
      "gain": -2.5
    }
  ]
}
```

**Response (extended format with full pipeline):**
```json
{
  "configName": "MVP-22 Mixer Block Test",
  "title": "Optional title",
  "description": "Optional description",
  "filterArray": [
    {
      "type": "filter",
      "id": "bass_shelf",
      "freq": 100,
      "gain": 3,
      "q": 0.7,
      "filterType": "lowshelf"
    }
  ],
  "filters": {
    "bass_shelf": {
      "type": "Biquad",
      "parameters": {
        "type": "Lowshelf",
        "freq": 100,
        "q": 0.7,
        "gain": 3
      }
    }
  },
  "mixers": {
    "stereo_passthrough": {
      "channels": { "in": 2, "out": 2 },
      "mapping": [...]
    }
  },
  "pipeline": [
    { "type": "Mixer", "name": "stereo_passthrough" },
    { "type": "Filter", "channels": [0, 1], "names": ["bass_shelf"] }
  ]
}
```

**Notes:**
- Both formats are supported for backwards compatibility
- Extended format includes optional fields: `title`, `description`, `filters`, `mixers`, `processors`, `pipeline`
- `devices` are **never persisted** - always sourced from current DSP or template config
- If `pipeline` is present and non-empty, extended fields are used; otherwise `filterArray` is converted

**Status Codes:**
- `200 OK` - Config loaded successfully
- `404 Not Found` - Config with given ID does not exist
- `400 Bad Request` - Config file is invalid

**Error Example:**
```json
{
  "error": {
    "code": "ERR_CONFIG_NOT_FOUND",
    "message": "Config not found: invalid-id",
    "statusCode": 404
  }
}
```

**Notes:**
- Returns `pipeline-config` format (simplified)
- Must be converted to full CamillaDSP config before upload

---

### PUT /api/configs/:id

**Description:** Save a configuration preset

**URL Parameters:**
- `id` - Config identifier (kebab-case, e.g., `my-custom-eq`)

**Request Body:**
```json
{
  "configName": "My Custom EQ",
  "accessKey": "optional-key",
  "filterArray": [
    {
      "type": "filter",
      "id": "band1",
      "freq": 105,
      "gain": 5.2,
      "q": 0.71,
      "filterType": "peaking"
    }
  ]
}
```

**Response:**
```json
{
  "success": true
}
```

**Status Codes:**
- `200 OK` - Config saved successfully
- `400 Bad Request` - Invalid JSON or missing required fields
- `413 Payload Too Large` - Config exceeds 1MB limit
- `500 Internal Server Error` - Write operation failed

**Notes:**
- Accepts `pipeline-config` format
- File saved as `{id}.json` in `server/data/configs/`
- Uses atomic write (temp file + rename)

---

## Planned Endpoints (Not Yet Implemented)

### GET /api/alsa/devices
**Status:** Planned  
**Description:** List ALSA audio devices and capabilities

### GET /api/system/services
**Status:** Planned  
**Description:** Query systemctl status for CamillaDSP service
