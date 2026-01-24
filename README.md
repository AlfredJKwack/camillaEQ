# CamillaEQ

A graphical user interface for CamillaDSP equalizer control.

## Project Structure

```
/server          - Node.js + Fastify backend REST API
/client          - Svelte + Vite frontend application
/docs            - Design specifications and API contracts
/memory-bank     - Project context and decisions
```

## Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file and customize as needed:

```bash
cp .env.example .env
```

Default configuration:
- Server runs on port 3000
- Client dev server runs on port 5173
- CamillaDSP WebSocket URLs: ws://localhost:1234 (control), ws://localhost:1235 (spectrum)

### 3. Development

Start both server and client in watch mode:

```bash
npm run dev
```

Or run them separately:

```bash
npm run dev:server  # Start backend only
npm run dev:client  # Start frontend only
```

The application will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000
- Health check: http://localhost:3000/health

### 4. Build

Build both server and client for production:

```bash
npm run build
```

### 5. Testing

Run all tests:

```bash
npm test
```

## API Endpoints

### Health Check
- **GET** `/health` - Returns server health status

### Version Info
- **GET** `/api/version` - Returns version, build hash, and build time

### Config Persistence
- **GET** `/api/config` - Reads the current config file from disk
  - Returns: Config JSON object
  - Error: 404 if config file not found
- **PUT** `/api/config` - Saves config to disk with atomic write
  - Body: Config JSON object (max 1MB)
  - Returns: `{ success: true }`
  - Errors: 400 (invalid), 413 (too large), 500 (write failed)

## Development Workflow

1. The client proxies API requests to the backend during development
2. Hot Module Replacement (HMR) is enabled for instant client updates
3. Server auto-restarts on code changes via tsx watch mode

## Project Status

**Current Milestone:** MVP-6 Complete ✓ — Full interactive EQ editor operational

### Completed Milestones

#### MVP-0: Repo + Dev Environment ✓
Monorepo structure, Fastify backend, Svelte frontend, dev workflow, build pipeline

#### MVP-1: Backend REST Foundation + Hardening ✓
Structured error responses, request logging with correlation IDs, `shellExec` utility, comprehensive test coverage

#### MVP-2: Config Persistence API ✓
ConfigStore service with atomic writes, GET/PUT endpoints, config validation, error handling

#### MVP-3: Client CamillaDSP Module ✓
WebSocket client for CamillaDSP control + spectrum, mock server for testing, 9 integration tests

#### MVP-4: EQ Editor Layout (Static) + Band Theming ✓
4-zone EQ graph layout (octaves, regions, plot, frequency scale), log10 frequency mapping, decade-based grid, band tokens with compensated ellipses, right panel with band columns, band theming contract with CSS custom properties

#### MVP-5: SVG EQ Curve Rendering (Sum + Per-Band) ✓
RBJ biquad filter response calculation, `EqSvgRenderer` module, reactive curve generation (256 sample points), sum curve + optional per-band curves, Tangzu Waner reference config (10 bands)

#### MVP-6: Interactive Tokens + Bidirectional Sync ✓
**Fully functional EQ editor with:**
- State management via Svelte stores (`eqStore.ts`)
- Interactive drag on tokens (freq/gain/Q adjustment)
- Functional right panel controls (fader, mute, frequency/Q dials)
- Bidirectional synchronization (token ↔ controls ↔ curves)
- Band selection sync across all UI elements
- Layout refinements (viz options alignment, selection styling)
- 49 client tests passing (5 test suites)

### Current Capabilities

The application now provides a **fully interactive equalizer editor** with:
- Real-time EQ curve visualization (sum + per-band)
- Drag tokens to adjust frequency and gain
- Shift+drag or mouse wheel to adjust Q/bandwidth
- Right panel controls (faders, mute buttons, parameter dials)
- Live curve updates as parameters change
- Band selection and visual feedback
- Log-scale frequency axis (20 Hz - 20 kHz)
- Linear gain axis (±24 dB)

### Next Milestone

**MVP-7:** Canvas Spectrum Renderer with Mode Toggles (Pre/Post/Off)

## Documentation

- [Design Specification](docs/design-spec.md) - Complete implementation specification
- [Implementation Plan](docs/implementation-plan.md) - Sequential MVP milestones
- [API Contract](docs/api-contract-camillaDSP.md) - CamillaDSP WebSocket protocol

## License

See LICENSE file for details.
