# CamillaEQ Systemd Deployment

This guide describes how to deploy a **CamillaEQ release artifact** on Linux systems using systemd (Debian, Ubuntu, Armbian on Orange Pi, etc.).

## Prerequisites

- Linux system with systemd
- Node.js >= 18.0.0 installed (`node --version` to check)
- CamillaEQ release tarball (download from GitHub Releases)

---

## Installation

### 1. Extract Release Artifact

```bash
# Download the release (replace VERSION with actual version)
wget https://github.com/AlfredJKwack/camillaEQ/releases/download/v0.1.0/camillaeq-v0.1.0.tar.gz

# Extract to temporary location
tar -xzf camillaeq-v0.1.0.tar.gz
cd camillaeq-v0.1.0
```

### 2. Create Service User

```bash
sudo useradd -r -s /bin/false camillaeq
```

### 3. Install Application

```bash
# Create installation directory
sudo mkdir -p /opt/camillaeq

# Copy release contents to installation directory
sudo cp -r * /opt/camillaeq/

# Install production dependencies
cd /opt/camillaeq
sudo npm ci --omit=dev

# Fix ownership
sudo chown -R camillaeq:camillaeq /opt/camillaeq
```

**Directory structure after installation:**
```
/opt/camillaeq/
├── server/
│   └── dist/
│       ├── index.js          # Server entry point
│       ├── client/           # Pre-built UI assets
│       └── ...               # Compiled server modules
├── data/                     # Mutable: configs, state (WRITABLE by service)
│   └── configs/
│       └── ...
├── tools/                    # Helper scripts (optional)
├── deploy/                   # Deployment docs and examples
├── package.json              # Runtime-only dependencies
├── package-lock.json
└── node_modules/             # Installed after npm ci
```

**Mutable vs Immutable Paths:**
- **Mutable:** `./data/**` (configs, state - writable by service)
- **Immutable:** Everything else (code, tools, docs - read-only after install)

### 4. Configure Environment

```bash
# Create config directory
sudo mkdir -p /etc/camillaeq

# Copy and customize environment file
sudo cp /opt/camillaeq/deploy/systemd/camillaeq.env.example /etc/camillaeq/camillaeq.env
sudo chown root:root /etc/camillaeq/camillaeq.env
sudo chmod 644 /etc/camillaeq/camillaeq.env

# Edit configuration
sudo nano /etc/camillaeq/camillaeq.env
```

**Key environment variables:**
- `SERVER_PORT=3000` - Port for web UI and API
- `SERVER_HOST=0.0.0.0` - Listen on all interfaces (or `127.0.0.1` for localhost only)
- `CAMILLA_CONTROL_WS_URL` - Default CamillaDSP control WebSocket URL (e.g., `ws://localhost:1234`)
- `CAMILLA_SPECTRUM_WS_URL` - Default CamillaDSP spectrum WebSocket URL (e.g., `ws://localhost:1235`)
- `LOG_LEVEL=info` - Logging level (error, warn, info, debug)

**Important:** The systemd service loads environment variables from `/etc/camillaeq/camillaeq.env` (via `EnvironmentFile=`). Changes require a service restart.

### 5. Install and Enable Service

```bash
# Copy service file
sudo cp /opt/camillaeq/deploy/systemd/camillaeq.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable camillaeq

# Start service
sudo systemctl start camillaeq

# Check status
sudo systemctl status camillaeq
```

### 6. Verify Installation

```bash
# Check logs
sudo journalctl -u camillaeq -n 50 --no-pager

# Test web UI (replace with your server IP if remote)
curl http://localhost:3000/
# Should return HTML containing "<div id="app">"

# Test API
curl http://localhost:3000/api/version
# Should return JSON with version info
```

---

## Post-Installation

### Access the UI

Open a web browser and navigate to:
```
http://<server-ip>:3000
```

Default: `http://localhost:3000` (if accessing from the same machine)

### Network Access

By default, CamillaEQ binds to `0.0.0.0:3000` (all interfaces). To access from other devices on your LAN, use the server's IP address.

To restrict access to localhost only (e.g., if using a reverse proxy):
```bash
# Edit /etc/camillaeq/camillaeq.env
SERVER_HOST=127.0.0.1

# Restart service
sudo systemctl restart camillaeq
```

---

## Updating CamillaEQ

To update to a new release version:

```bash
# Stop service
sudo systemctl stop camillaeq

# Backup mutable data (optional but recommended)
sudo cp -r /opt/camillaeq/data /opt/camillaeq/data.backup.$(date +%Y%m%d)

# Download and extract new release
cd /tmp
wget https://github.com/AlfredJKwack/camillaEQ/releases/download/v0.2.0/camillaeq-v0.2.0.tar.gz
tar -xzf camillaeq-v0.2.0.tar.gz

# Replace immutable files (preserves ./data)
sudo rm -rf /opt/camillaeq/server
sudo rm -rf /opt/camillaeq/tools
sudo rm -rf /opt/camillaeq/deploy
sudo rm -rf /opt/camillaeq/node_modules
sudo rm /opt/camillaeq/package.json
sudo rm /opt/camillaeq/package-lock.json

# Copy new release files
cd camillaeq-v0.2.0
sudo cp -r server tools deploy package.json package-lock.json /opt/camillaeq/

# Update dependencies
cd /opt/camillaeq
sudo npm ci --omit=dev

# Fix ownership
sudo chown -R camillaeq:camillaeq /opt/camillaeq

# Update service file if changed
sudo cp /opt/camillaeq/deploy/systemd/camillaeq.service /etc/systemd/system/
sudo systemctl daemon-reload

# Start service
sudo systemctl start camillaeq

# Verify
sudo systemctl status camillaeq
sudo journalctl -u camillaeq -n 20 --no-pager
```

---

## Troubleshooting

### Service Won't Start

**Check logs:**
```bash
sudo journalctl -u camillaeq -n 100 --no-pager
```

**Common issues:**

1. **Unsupported Node.js version**
   ```
   ERROR: Unsupported Node.js version
   Current version: v16.x.x
   Required: >= 18.0.0 and < 23.0.0
   ```
   **Solution:** Upgrade Node.js to version 18 or 20 LTS.

2. **Port already in use**
   ```
   Error: listen EADDRINUSE: address already in use :::3000
   ```
   **Solution:** Change `SERVER_PORT` in `/etc/camillaeq/camillaeq.env` or stop conflicting service.

3. **Permission denied on /opt/camillaeq/data**
   ```
   Error: EACCES: permission denied
   ```
   **Solution:** Fix ownership:
   ```bash
   sudo chown -R camillaeq:camillaeq /opt/camillaeq/data
   ```

4. **Missing dependencies**
   ```
   Error: Cannot find module '@fastify/static'
   ```
   **Solution:** Reinstall dependencies:
   ```bash
   cd /opt/camillaeq
   sudo npm ci --omit=dev
   ```

### Environment Variables Not Loading

The service reads environment variables from `/etc/camillaeq/camillaeq.env`. Changes require a restart:
```bash
sudo systemctl restart camillaeq
```

To verify which environment variables the running service sees:
```bash
# Get the service PID
sudo systemctl show camillaeq -p MainPID

# Inspect process environment (replace <PID> with actual MainPID)
sudo tr '\0' '\n' < /proc/<PID>/environ | grep '^CAMILLA_\|^SERVER_'
```

### Manual Test (Bypass systemd)

Test the application manually to isolate systemd-specific issues:
```bash
cd /opt/camillaeq
sudo -u camillaeq NODE_ENV=production /usr/bin/node server/dist/index.js
```

Press `Ctrl+C` to stop. If this works but the service doesn't, check systemd configuration.

### View Real-Time Logs

```bash
# Follow logs in real-time
sudo journalctl -u camillaeq -f

# View recent logs
sudo journalctl -u camillaeq -n 100

# View logs since boot
sudo journalctl -u camillaeq -b

# View logs with timestamps
sudo journalctl -u camillaeq -n 50 -o short-iso
```

---

## Security

### Service Hardening

The included systemd unit applies these security measures:
- Runs as unprivileged user `camillaeq`
- Only `./data/` is writable (`ReadWritePaths=/opt/camillaeq/data`)
- System and home directories are protected
- Private `/tmp` namespace

### Read-Only Mode

When exposing CamillaEQ publicly, enable read-only mode to prevent unauthorized persistence changes:

```bash
# Edit /etc/camillaeq/camillaeq.env
SERVER_READ_ONLY=true

# Restart service
sudo systemctl restart camillaeq
```

In read-only mode:
- ✅ UI loads and displays current state
- ✅ WebSocket connections to CamillaDSP work (volume, config, spectrum)
- ✅ GET requests succeed (read presets, read state)
- ❌ PUT/POST/PATCH/DELETE to `/api/*` return HTTP 403 (no disk writes)

### Reverse Proxy (Optional)

For HTTPS or authentication, use a reverse proxy like nginx or Caddy. See:
- `/opt/camillaeq/deploy/caddy/README.md` for Caddy examples
- Standard nginx reverse proxy configuration

---

## Uninstallation

```bash
# Stop and disable service
sudo systemctl stop camillaeq
sudo systemctl disable camillaeq

# Remove service file
sudo rm /etc/systemd/system/camillaeq.service
sudo systemctl daemon-reload

# Remove application files
sudo rm -rf /opt/camillaeq

# Remove configuration
sudo rm -rf /etc/camillaeq

# Remove service user
sudo userdel camillaeq
```

---

## Additional Resources

- **GitHub Repository:** https://github.com/AlfredJKwack/camillaEQ
- **Reverse Proxy Examples:** `/opt/camillaeq/deploy/caddy/README.md`
- **Helper Tools:** `/opt/camillaeq/tools/README.md`
- **CamillaDSP Documentation:** https://github.com/HEnquist/camilladsp

For build/development instructions (power users), see the developer documentation in the repository.
