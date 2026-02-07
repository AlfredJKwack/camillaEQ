# CamillaEQ Demo CamillaDSP Mock

A **safe, production-ready mock CamillaDSP server** for public demo deployments.

This service allows casual visitors to try CamillaEQ without needing their own CamillaDSP instance or audio hardware.

---

## Features

### Security (Safe for Public Internet)
- **Command allowlist**: Only accepts commands the CamillaEQ client uses
- **Per-session state**: Each browser session gets its own in-memory config (no interference)
- **Rate limiting**: Token bucket per connection (100 msg/s control, 50 msg/s spectrum)
- **Idle timeout**: Auto-closes stale connections after 10 minutes
- **Max connections**: Configurable per-server limit (default: 200)
- **Bounded payload**: 256 KB max message size
- **Config complexity limits**: Max filters (512), mixers (64), pipeline steps (128)
- **Origin allowlist**: Block drive-by abuse from other websites (optional)

### Functionality
- **Session-local editing**: Sliders and pipeline editor work normally within a session
- **No persistence**: Config resets on reconnect (fresh demo each time)
- **Default preset**: Loads **Tangzu Waner** EQ profile by default
- **Mock spectrum analyzer**: Returns animated 256-bin spectrum data (10 Hz polling compatible)

---

## Quick Start

### 1. Install Dependencies
```bash
cd tools/demo-camilladsp
npm install
```

### 2. Build
```bash
npm run build
```

### 3. Run
```bash
npm start
```

The service will start on:
- Control socket: `ws://0.0.0.0:3146`
- Spectrum socket: `ws://0.0.0.0:6413`

---

## systemd Deployment

### Service Unit

Create `/etc/systemd/system/camillaeq-demo-dsp.service`:

```ini
[Unit]
Description=CamillaEQ Demo CamillaDSP Mock
Documentation=https://github.com/AlfredJKwack/camillaEQ
After=network.target

[Service]
Type=simple
User=camillaeq
Group=camillaeq
WorkingDirectory=/opt/camillaeq-demo-dsp
ExecStart=/usr/bin/node dist/index.js

# Environment (load from file)
EnvironmentFile=-/etc/camillaeq-demo-dsp.env

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
RestrictNamespaces=true
RestrictRealtime=true
LockPersonality=true

# Resource limits
LimitNOFILE=4096
MemoryMax=512M

# Restart policy
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

### Environment File

Create `/etc/camillaeq-demo-dsp.env`:

```bash
# Ports
DEMO_CONTROL_PORT=3146
DEMO_SPECTRUM_PORT=6413

# Rate limits (per connection)
DEMO_CONTROL_RATE_LIMIT=100
DEMO_CONTROL_BURST=200
DEMO_SPECTRUM_RATE_LIMIT=50
DEMO_SPECTRUM_BURST=100

# Connection limits
DEMO_MAX_PAYLOAD=262144
DEMO_IDLE_TIMEOUT_MS=600000
DEMO_MAX_CONNECTIONS=200

# Config complexity limits
DEMO_MAX_FILTERS=512
DEMO_MAX_MIXERS=64
DEMO_MAX_PROCESSORS=64
DEMO_MAX_PIPELINE_STEPS=128
DEMO_MAX_NAMES_PER_STEP=512
DEMO_MAX_JSON_SIZE=204800

# Origin allowlist (comma-separated)
# Leave empty or unset to allow all origins (recommended for LAN/private deployment)
# Set to specific origins for public deployment to prevent abuse
# Example: DEMO_ALLOWED_ORIGINS=http://camillaeq.his.house
DEMO_ALLOWED_ORIGINS=
```

### Installation Steps

```bash
# 1. Create user
sudo useradd --system --no-create-home --shell /usr/sbin/nologin camillaeq

# 2. Install application
sudo mkdir -p /opt/camillaeq-demo-dsp
sudo cp -r tools/demo-camilladsp/* /opt/camillaeq-demo-dsp/
sudo chown -R camillaeq:camillaeq /opt/camillaeq-demo-dsp

# 3. Install dependencies and build
cd /opt/camillaeq-demo-dsp
sudo -u camillaeq npm install --production
sudo -u camillaeq npm run build

# 4. Install service files
sudo cp /path/to/camillaeq-demo-dsp.service /etc/systemd/system/
sudo cp /path/to/camillaeq-demo-dsp.env /etc/

# 5. Enable and start
sudo systemctl daemon-reload
sudo systemctl enable camillaeq-demo-dsp
sudo systemctl start camillaeq-demo-dsp
```

### Service Management

```bash
# Status
sudo systemctl status camillaeq-demo-dsp

# Logs
sudo journalctl -u camillaeq-demo-dsp -f

# Restart
sudo systemctl restart camillaeq-demo-dsp

# Stop
sudo systemctl stop camillaeq-demo-dsp
```

---

## Running with CamillaEQ Server

To create a complete demo setup, run both:

1. **This demo DSP mock** (provides WebSocket endpoints)
2. **CamillaEQ server** (serves the web UI)

### Demo Configuration for CamillaEQ Server

Set these environment variables to pre-fill the Connect page:

```bash
# In CamillaEQ server .env or systemd environment
CAMILLA_CONTROL_WS_URL=ws://localhost:3146
CAMILLA_SPECTRUM_WS_URL=ws://localhost:6413

# Optional: Disable persistence (demo mode)
SERVER_READ_ONLY=true
```

With these set, users can click "Connect" without typing anything.

---

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DEMO_CONTROL_PORT` | `3146` | Control WebSocket port |
| `DEMO_SPECTRUM_PORT` | `6413` | Spectrum WebSocket port |
| `DEMO_MAX_PAYLOAD` | `262144` | Max WebSocket message size (bytes) |
| `DEMO_IDLE_TIMEOUT_MS` | `600000` | Idle connection timeout (ms) |
| `DEMO_MAX_CONNECTIONS` | `200` | Max concurrent connections per server |
| `DEMO_CONTROL_RATE_LIMIT` | `100` | Control messages per second (per connection) |
| `DEMO_CONTROL_BURST` | `200` | Control burst capacity |
| `DEMO_SPECTRUM_RATE_LIMIT` | `50` | Spectrum messages per second (per connection) |
| `DEMO_SPECTRUM_BURST` | `100` | Spectrum burst capacity |
| `DEMO_MAX_FILTERS` | `512` | Max filter count in config |
| `DEMO_MAX_MIXERS` | `64` | Max mixer count in config |
| `DEMO_MAX_PROCESSORS` | `64` | Max processor count in config |
| `DEMO_MAX_PIPELINE_STEPS` | `128` | Max pipeline steps in config |
| `DEMO_MAX_NAMES_PER_STEP` | `512` | Max filter names per Filter step |
| `DEMO_MAX_JSON_SIZE` | `204800` | Max config JSON size (bytes) |
| `DEMO_ALLOWED_ORIGINS` | _(empty)_ | Comma-separated origin allowlist (empty/unset = allow all) |

---

## Firewall Configuration

If using a firewall, allow inbound connections:

```bash
# UFW example
sudo ufw allow 3146/tcp comment 'CamillaEQ Demo Control'
sudo ufw allow 6413/tcp comment 'CamillaEQ Demo Spectrum'
```

---

## Reverse Proxy Configuration

### Port-Based WebSocket Proxy (Caddy)

The CamillaEQ client requires **port-based** WebSocket connections (`ws://host:port`) and does not support URL paths.

When deploying alongside CamillaEQ server with Caddy:

```caddyfile
# CamillaEQ UI (HTTP only)
http://camillaeq.his.house {
    reverse_proxy 127.0.0.1:30024

    # Ensure no HSTS is sent
    header {
        -Strict-Transport-Security
    }
}

# Demo CamillaDSP control WebSocket (port-based)
http://camillaeq.his.house:3146 {
    reverse_proxy 127.0.0.1:3146

    header {
        -Strict-Transport-Security
    }
}

# Demo CamillaDSP spectrum WebSocket (port-based)
http://camillaeq.his.house:6413 {
    reverse_proxy 127.0.0.1:6413

    header {
        -Strict-Transport-Security
    }
}
```

**Port remapping example:**
If you want the demo service to bind to different local ports (e.g., for firewall rules), configure the service ports in `/etc/camillaeq-demo-dsp.env`:
```bash
DEMO_CONTROL_PORT=1234
DEMO_SPECTRUM_PORT=1235
```

Then update Caddyfile to remap:
```caddyfile
# Map public port 3146 to local 1234
http://camillaeq.his.house:3146 {
    reverse_proxy 127.0.0.1:1234
    header { -Strict-Transport-Security }
}

# Map public port 6413 to local 1235
http://camillaeq.his.house:6413 {
    reverse_proxy 127.0.0.1:1235
    header { -Strict-Transport-Security }
}
```

After updating Caddyfile:
```bash
sudo caddy reload
```

Then configure CamillaEQ server with:
```bash
CAMILLA_CONTROL_WS_URL=ws://camillaeq.his.house:3146
CAMILLA_SPECTRUM_WS_URL=ws://camillaeq.his.house:6413
```

**Important notes:**
- WebSockets must remain HTTP (`ws://`) not HTTPS (`wss://`)
- Client does not support path-based WebSocket URLs
- All ports must be exposed through Caddy with separate listeners
- If using a firewall, ensure ports 3146 and 6413 are allowed

---

## Upgrading

```bash
# 1. Stop service
sudo systemctl stop camillaeq-demo-dsp

# 2. Update code
cd /opt/camillaeq-demo-dsp
sudo -u camillaeq git pull  # or copy new files

# 3. Rebuild
sudo -u camillaeq npm install --production
sudo -u camillaeq npm run build

# 4. Restart
sudo systemctl start camillaeq-demo-dsp
```

---

## Troubleshooting

### Check if service is running
```bash
sudo systemctl status camillaeq-demo-dsp
```

### View logs
```bash
sudo journalctl -u camillaeq-demo-dsp -n 100 --no-pager
```

### Check listening ports
```bash
sudo ss -tlnp | grep -E '(3146|6413)'
```

### Test WebSocket connection locally
```bash
# Using wscat (install: [npm install -g wscat](https://www.npmjs.com/package/wscat))
wscat -c ws://localhost:1234
# Then type (incl. quotations): "GetVersion"
# Expected response: {"GetVersion":{"result":"Ok","value":"3.0.0-demo"}}
```

### Test through Caddy proxy
```bash
# Verify HTTP endpoint responds
curl -i http://camillaeq.his.house:3146
# Expected: HTTP 200 (but no body - this is normal for WS upgrade endpoints)

# Test control WS (requires websocat)
websocat ws://camillaeq.his.house:3146
# Then type: "GetVersion"

# Test spectrum WS
websocat ws://camillaeq.his.house:6413
# Then type: "GetPlaybackSignalPeak"
```

**Common issues:**
- `426 Upgrade Required` from `curl`: **Normal** - WebSockets require HTTP upgrade
- `Rejected control connection from origin`: Check `DEMO_ALLOWED_ORIGINS` in env file
  - If set to empty string (`DEMO_ALLOWED_ORIGINS=`), origins will be rejected
  - Either remove the line entirely or set specific origins
- Connection refused: Check firewall rules for ports 3146 and 6413

---

## Limitations (Demo Mode)

- **No persistence**: Edits are lost on reconnect
- **No real audio**: Spectrum data is synthetic
- **Session isolation**: Users cannot share configs
- **No file I/O**: Cannot load/save configs to disk

These are intentional design choices for a public demo.

---

## Architecture Notes

### Per-Session State
Each WebSocket connection gets:
- Deep copy of the default config (Tangzu Waner preset)
- Isolated in-memory state
- Independent rate limiter
- Idle timeout timer

When a connection closes, all session state is destroyed (GC reclaims memory).

### Why This is Safe
1. **No RCE**: No shell commands, no file writes, no dynamic code loading
2. **No shared state**: Users cannot interfere with each other
3. **Bounded resources**: All limits are explicit and enforced
4. **Fail-fast**: Invalid commands/payloads are rejected immediately

### Performance Characteristics
- Memory per connection: ~10-50 KB (config + rate limiter state)
- CPU per message: negligible (JSON parse + allowlist check)
- Spectrum generation: ~0.1ms for 256 bins

At 200 concurrent connections with 10 Hz spectrum polling:
- Memory: ~10 MB
- Network: ~2 Mbps outbound (spectrum data)
- CPU: <5% on a modest VPS

---

## License

Same as parent project (CamillaEQ).
