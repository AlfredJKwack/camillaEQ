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

## Development Workflow

1. The client proxies API requests to the backend during development
2. Hot Module Replacement (HMR) is enabled for instant client updates
3. Server auto-restarts on code changes via tsx watch mode

## Project Status

**Current Milestone:** MVP-1 Complete ✓

### MVP-0: Repo + Dev Environment (Complete)
- [x] Monorepo structure established
- [x] Server scaffolding (Fastify + Pino logging)
- [x] Client scaffolding (Svelte + Vite)
- [x] Development workflow operational
- [x] Build pipeline functional

### MVP-1: Backend REST Foundation + Hardening (Complete)
- [x] Structured JSON error responses with error codes
- [x] 404 handler with proper error structure
- [x] Request logging with correlation IDs
- [x] `shellExec` utility with timeout, output limits, and command whitelist
- [x] Route tests using `fastify.inject()`
- [x] Unit tests for `shellExec` with full coverage
- [x] Fixed Vite proxy to use IPv4 (`127.0.0.1:3000`)

**Next Milestone:** MVP-2 - Config Persistence API (File I/O)

## Documentation

- [Design Specification](docs/design-spec.md) - Complete implementation specification
- [Implementation Plan](docs/implementation-plan.md) - Sequential MVP milestones
- [API Contract](docs/api-contract-camillaDSP.md) - CamillaDSP WebSocket protocol

## License

See LICENSE file for details.
