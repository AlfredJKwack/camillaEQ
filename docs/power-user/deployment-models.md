# Deployment Models

**Intended audience:** Power users deploying CamillaEQ on headless systems, SBCs, or production servers.

**This document does not cover:** Development setup or code architecture.

---

## Supported Deployment Models

### Development Mode (Two Processes)
**Use case:** Active development, hot reload

**Processes:**
1. Vite dev server (port 5173) - Frontend with HMR
2. Node.js backend (port 3000) - API only

**Start command:**
```bash
npm run dev
```

**Access:**
- Frontend: `http://localhost:5173`
- Backend API: `http://localhost:3000`

**Behavior:**
- Vite proxies `/api/*` requests to backend
- Hot module replacement for UI changes
- Server restarts on code changes

**Not suitable for:** Production deployment

---

### Production Mode (Single Process)
**Use case:** Headless SBC, always-on server

**Process:**
- Node.js backend (port 3000) - API + serves built UI

**Build command:**
```bash
npm run build
```

**Start command:**
```bash
npm run start
```

**Access:**
- UI + API: `http://localhost:3000`

**Behavior:**
- Built frontend served from `server/dist/client/`
- Single port for all traffic
- SPA routing (index.html fallback for non-API routes)

**Recommended for:** systemd service, production deployment

---

## Runtime Topology

### What Runs Where

```
┌─────────────────────────────────────────────┐
│  Browser (Any device on LAN)                │
│                                             │
│  http://camillaeq-host:3000                 │
│  ↓                                          │
│  Loads UI (HTML/CSS/JS)                     │
│                                             │
│  Then establishes:                          │
│  - WebSocket to CamillaDSP :1234 (control)  │
│  - WebSocket to CamillaDSP :1235 (spectrum) │
│  - HTTP REST to CamillaEQ :3000 (presets)   │
└─────────────────────────────────────────────┘
         │                    │
         │                    │
    ┌────▼────────┐     ┌─────▼──────────┐
    │ CamillaEQ   │     │  CamillaDSP    │
    │ Server      │     │                │
    │ :3000       │     │  :1234 control │
    │ Node.js     │     │  :1235 spectrum│
    └─────────────┘     └────────────────┘
```

**Key points:**
- Browser connects **directly** to CamillaDSP (no proxy)
- CamillaEQ server is **not** in the audio path
- CamillaEQ server only handles presets + recovery cache

---

## Network Requirements

### Same Host Deployment
**CamillaEQ + CamillaDSP on same machine**

**Browser must reach:**
- `camillaeq-host:3000` (CamillaEQ server)
- `camillaeq-host:1234` (CamillaDSP control)
- `camillaeq-host:1235` (CamillaDSP spectrum)

**Firewall rules:**
```bash
# Allow CamillaEQ HTTP
sudo ufw allow 3000/tcp

# Allow CamillaDSP WebSockets
sudo ufw allow 1234/tcp
sudo ufw allow 1235/tcp
```

---

### Split Host Deployment
**CamillaEQ on Host A, CamillaDSP on Host B**

**Browser must reach:**
- `hostA:3000` (CamillaEQ server)
- `hostB:1234` (CamillaDSP control)
- `hostB:1235` (CamillaDSP spectrum)

**Configuration:**
- On Connect page, enter `hostB` as server
- Presets/recovery still saved on Host A

**Limitation:** Browser needs network access to both hosts

---

## Filesystem Layout

### Recommended Production Layout
```
/opt/camillaeq/                    # Application root
├── server/                        # Built server
│   └── dist/
│       ├── index.js               # Entry point
│       ├── ...                    # Compiled JS
│       └── client/                # Built UI (copied during build)
│           ├── index.html
│           ├── assets/
│           └── ...
├── package.json                   # Dependency metadata
├── node_modules/                  # Runtime dependencies
└── data/                          # Runtime data (writable)
    ├── configs/                   # Presets (*.json)
    └── latest_dsp_state.json      # Recovery cache
```

**Ownership:**
```bash
/opt/camillaeq:          camillaeq:camillaeq  (read-only for app)
/opt/camillaeq/data:     camillaeq:camillaeq  (read-write)
```

---

### Alternative: Custom Data Directory
**Use case:** Data on separate partition, NAS mount

**Set environment variable:**
```bash
# In /etc/camillaeq/camillaeq.env
CONFIG_DIR=/mnt/storage/camillaeq-data
```

**Filesystem:**
```
/opt/camillaeq/              # Application (read-only)
/mnt/storage/
  └── camillaeq-data/        # Data (writable)
      ├── configs/
      └── latest_dsp_state.json
```

**Ensure:**
- Directory exists before starting service
- Service user has write permissions

---

## Port Configuration

### Default Ports
```
CamillaEQ:     3000 (HTTP)
CamillaDSP:    1234 (WebSocket control)
               1235 (WebSocket spectrum)
```

### Change CamillaEQ Port
**Via environment variable:**
```bash
# In /etc/camillaeq/camillaeq.env
SERVER_PORT=8080
```

**Via command line:**
```bash
SERVER_PORT=8080 npm run start
```

---

### Bind to Localhost Only
**Use case:** Behind reverse proxy, security hardening

```bash
# In /etc/camillaeq/camillaeq.env
SERVER_HOST=127.0.0.1
```

**Effect:** Only accessible from same machine (reverse proxy required for LAN access)

---

## Reverse Proxy Setup

### nginx Example
```nginx
server {
    listen 80;
    server_name camillaeq.local;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

**Note:** Reverse proxy does **not** proxy CamillaDSP WebSockets. Browser still connects directly to CamillaDSP ports.

---

## Resource Considerations

### CPU Usage
**Spectrum analyzer:**
- ~10 Hz polling from browser
- Minimal CPU impact (WebSocket request/response)
- No server processing (spectrum data not proxied)

**EQ editing:**
- Burst activity on parameter changes
- Debounced uploads (200ms) reduce traffic

**Idle state:**
- Minimal CPU usage
- No background polling when UI inactive

---

### Memory Usage
**Typical:**
- Node.js process: ~50-100 MB
- Preset library: Minimal (configs are small JSON)
- No in-memory caching (reads from disk on demand)

**Peak:**
- During config upload: +10-20 MB (temporary)
- Multiple browser tabs: No server-side impact (client-side state)

---

### Disk Usage
**Application:**
- Built server + UI: ~20-30 MB
- node_modules: ~100-150 MB

**Data:**
- Presets: ~1-5 KB each
- Recovery cache: ~10-50 KB
- Total data: <1 MB typical

**Growth:**
- Logs (if enabled): Varies by log level
- Preset accumulation: Linear with user saves

---

## Upgrade Strategy

### In-Place Upgrade
```bash
# Stop service
sudo systemctl stop camillaeq

# Backup data
sudo cp -r /opt/camillaeq/data /opt/camillaeq/data.backup

# Update application files
cd /path/to/source
npm run build
sudo cp -r server/dist /opt/camillaeq/server
sudo chown -R camillaeq:camillaeq /opt/camillaeq/server

# Start service
sudo systemctl start camillaeq
```

**Rollback:**
```bash
sudo systemctl stop camillaeq
sudo cp -r /opt/camillaeq/server.backup /opt/camillaeq/server
sudo systemctl start camillaeq
```

---

### Zero-Downtime Upgrade
**Not applicable:** Single-process model, brief downtime required

**Minimize downtime:**
- Pre-build on dev machine
- rsync built artifacts
- Quick stop → copy → start

---

## Multi-Instance Deployment

### Not Supported
**CamillaEQ does not support:**
- Multiple instances sharing same data directory
- Load balancing across instances
- Concurrent writes to preset library

**If needed:**
- Run separate instances with separate data directories
- Use different ports for each instance

---

## Next Steps

- [Linux Services](linux-services.md) - systemd service setup
- [Headless SBC](headless-sbc.md) - SBC-specific deployment
- [Recovery and Backups](recovery-and-backups.md) - Backup and recovery procedures
