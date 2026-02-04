# Linux Services

**Intended audience:** Power users installing CamillaEQ as a systemd service on Linux.

**This document does not cover:** Development setup or other init systems.

---

## systemd Service Installation

### Prerequisites

**Required:**
- Linux system with systemd (Debian, Ubuntu, Armbian, etc.)
- Node.js 18+ installed
- Built CamillaEQ application (`npm run build`)
- sudo/root access

**Recommended:**
- Dedicated service user (non-root)
- Firewall configuration

---

## Installation Steps

### 1. Create Service User

Create unprivileged user to run the service:

```bash
sudo useradd -r -s /bin/false -m -d /opt/camillaeq camillaeq
```

**Flags:**
- `-r` - System user (no login shell needed)
- `-s /bin/false` - No shell access
- `-m -d /opt/camillaeq` - Create home directory at `/opt/camillaeq`

---

### 2. Install Application

```bash
# Build application on dev machine or same host
cd /path/to/camillaeq-source
npm install
npm run build

# Copy built artifacts to installation directory
sudo mkdir -p /opt/camillaeq
sudo cp -r server/dist /opt/camillaeq/server
sudo cp package.json /opt/camillaeq/
sudo cp package-lock.json /opt/camillaeq/

# Install production dependencies
cd /opt/camillaeq
sudo npm ci --omit=dev

# Set ownership
sudo chown -R camillaeq:camillaeq /opt/camillaeq
```

---

### 3. Create Data Directory

```bash
# Create writable data directory
sudo mkdir -p /opt/camillaeq/data/configs
sudo chown -R camillaeq:camillaeq /opt/camillaeq/data
sudo chmod 755 /opt/camillaeq/data
```

**Note:** Only `/opt/camillaeq/data` needs write access. Application files are read-only.

---

### 4. Configure Environment

```bash
# Create config directory
sudo mkdir -p /etc/camillaeq

# Copy and customize environment file
sudo cp /path/to/source/deploy/systemd/camillaeq.env.example /etc/camillaeq/camillaeq.env

# Set permissions (root owns config, service reads it)
sudo chown root:root /etc/camillaeq/camillaeq.env
sudo chmod 644 /etc/camillaeq/camillaeq.env

# Edit configuration
sudo nano /etc/camillaeq/camillaeq.env
```

**Key settings:**
```bash
NODE_ENV=production
SERVER_PORT=3000
SERVER_HOST=0.0.0.0
CONFIG_DIR=./data
LOG_LEVEL=info
```

---

### 5. Install systemd Service

```bash
# Copy service file
sudo cp /path/to/source/deploy/systemd/camillaeq.service /etc/systemd/system/

# Reload systemd daemon
sudo systemctl daemon-reload

# Enable service (start on boot)
sudo systemctl enable camillaeq

# Start service immediately
sudo systemctl start camillaeq
```

---

### 6. Verify Installation

```bash
# Check service status
sudo systemctl status camillaeq

# Expected output:
# ● camillaeq.service - CamillaEQ - CamillaDSP Graphical Equalizer Interface
#    Loaded: loaded (/etc/systemd/system/camillaeq.service; enabled; ...)
#    Active: active (running) since ...
#    Main PID: ...
#    Tasks: ...
#    Memory: ...
#    CGroup: /system.slice/camillaeq.service
#            └─... /usr/bin/node server/dist/index.js

# Check logs
sudo journalctl -u camillaeq -n 50

# Expected log lines:
# Server listening on http://0.0.0.0:3000
# Serving static client build
```

---

### 7. Test HTTP Access

```bash
# From same host
curl http://localhost:3000/health

# Expected: {"status":"ok"}

# From LAN (replace with actual IP)
curl http://192.168.1.100:3000/health
```

**If connection fails:**
- Check firewall rules
- Verify `SERVER_HOST` is not `127.0.0.1`
- Check service logs

---

## Service Management

### Start/Stop/Restart

```bash
# Start service
sudo systemctl start camillaeq

# Stop service
sudo systemctl stop camillaeq

# Restart service
sudo systemctl restart camillaeq

# Reload configuration (if supported)
sudo systemctl reload camillaeq
```

---

### Enable/Disable Auto-Start

```bash
# Enable (start on boot)
sudo systemctl enable camillaeq

# Disable (do not start on boot)
sudo systemctl disable camillaeq

# Check enabled status
systemctl is-enabled camillaeq
```

---

### View Status

```bash
# Full status
sudo systemctl status camillaeq

# One-line status
systemctl is-active camillaeq

# Exit code-based check (for scripts)
if systemctl is-active --quiet camillaeq; then
  echo "Service is running"
fi
```

---

## Log Management

### View Logs

```bash
# Last 50 lines
sudo journalctl -u camillaeq -n 50

# Follow logs (tail -f style)
sudo journalctl -u camillaeq -f

# Logs since last boot
sudo journalctl -u camillaeq -b

# Logs for specific time range
sudo journalctl -u camillaeq --since "2024-01-15 10:00" --until "2024-01-15 11:00"

# Export logs to file
sudo journalctl -u camillaeq > camillaeq.log
```

---

### Log Filtering

```bash
# Only errors
sudo journalctl -u camillaeq -p err

# Priority levels: emerg, alert, crit, err, warning, notice, info, debug

# Grep for specific messages
sudo journalctl -u camillaeq | grep "Server listening"
sudo journalctl -u camillaeq | grep "ERROR"
```

---

### Log Retention

**systemd journal default:** Logs rotate automatically (typically 7 days or 4GB)

**View journal disk usage:**
```bash
journalctl --disk-usage
```

**Manually clean old logs:**
```bash
# Keep only last 3 days
sudo journalctl --vacuum-time=3d

# Keep only 100MB
sudo journalctl --vacuum-size=100M
```

---

## Updating the Service

### In-Place Update

```bash
# 1. Stop service
sudo systemctl stop camillaeq

# 2. Backup data
sudo cp -r /opt/camillaeq/data /opt/camillaeq/data.backup.$(date +%Y%m%d)

# 3. Build new version (on dev machine or same host)
cd /path/to/source
git pull  # or download new version
npm install
npm run build

# 4. Update application files
sudo cp -r server/dist /opt/camillaeq/server
sudo cp package.json /opt/camillaeq/
sudo cp package-lock.json /opt/camillaeq/

# 5. Update dependencies (if package.json changed)
cd /opt/camillaeq
sudo npm ci --omit=dev

# 6. Update service file (if changed)
sudo cp /path/to/source/deploy/systemd/camillaeq.service /etc/systemd/system/
sudo systemctl daemon-reload

# 7. Set ownership
sudo chown -R camillaeq:camillaeq /opt/camillaeq/server
sudo chown -R camillaeq:camillaeq /opt/camillaeq/node_modules

# 8. Start service
sudo systemctl start camillaeq

# 9. Verify
sudo systemctl status camillaeq
sudo journalctl -u camillaeq -n 20
```

---

### Rollback After Failed Update

```bash
# Stop service
sudo systemctl stop camillaeq

# Restore old application files
sudo cp -r /opt/camillaeq/server.backup /opt/camillaeq/server

# Restore old dependencies (if needed)
sudo cp -r /opt/camillaeq/node_modules.backup /opt/camillaeq/node_modules

# Start service
sudo systemctl start camillaeq
```

**Best practice:** Test updates on non-production system first

---

## Service Configuration

### Environment Variables

**File:** `/etc/camillaeq/camillaeq.env`

**Common variables:**
```bash
# Runtime mode
NODE_ENV=production

# Network binding
SERVER_PORT=3000
SERVER_HOST=0.0.0.0  # Or 127.0.0.1 for localhost only

# Data storage
CONFIG_DIR=./data  # Relative to WorkingDirectory (/opt/camillaeq)

# Logging
LOG_LEVEL=info  # debug, info, warn, error
```

**After changing:**
```bash
sudo systemctl restart camillaeq
```

---

### Service Hardening

**Default security features** (in `camillaeq.service`):

```ini
# Prevent privilege escalation
NoNewPrivileges=true

# Private /tmp
PrivateTmp=true

# Read-only root filesystem (except ReadWritePaths)
ProtectSystem=strict

# No access to /home
ProtectHome=true

# Only /opt/camillaeq/data is writable
ReadWritePaths=/opt/camillaeq/data
```

**Additional hardening** (optional, add to service file):

```ini
# Restrict network access to localhost + LAN
RestrictAddressFamilies=AF_INET AF_INET6

# No setuid/setgid
NoNewPrivileges=true

# Limit process count
TasksMax=50

# Memory limit (adjust as needed)
MemoryMax=500M
```

---

## Failure Recovery

### Automatic Restart

**Default behavior** (in `camillaeq.service`):
```ini
Restart=on-failure
RestartSec=2
```

**Service restarts automatically if:**
- Process crashes
- Exits with non-zero code
- Unhandled exception

**Service does NOT restart if:**
- Manually stopped (`systemctl stop`)
- Exits with code 0 (clean shutdown)

---

### Manual Recovery

```bash
# Check why service failed
sudo systemctl status camillaeq
sudo journalctl -u camillaeq -n 100

# Common issues:
# - Port already in use
# - Permissions on /opt/camillaeq/data
# - Missing node_modules
# - Corrupt config file

# Attempt restart
sudo systemctl restart camillaeq
```

---

### Health Monitoring

**Manual check:**
```bash
curl http://localhost:3000/health
```

**systemd health check** (optional, add to service file):
```ini
[Service]
# Restart if health check fails 3 times
Type=notify
WatchdogSec=30
```

**External monitoring:**
- Nagios/Icinga: Check `/health` endpoint
- Prometheus: Scrape `/metrics` (if implemented)
- Simple cron job with curl

---

## Firewall Configuration

### ufw (Ubuntu/Debian)

```bash
# Allow CamillaEQ HTTP
sudo ufw allow 3000/tcp

# Or restrict to LAN subnet
sudo ufw allow from 192.168.1.0/24 to any port 3000

# Check rules
sudo ufw status numbered
```

---

### firewalld (RHEL/CentOS)

```bash
# Allow CamillaEQ port
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload

# Check rules
sudo firewall-cmd --list-ports
```

---

### iptables (Manual)

```bash
# Allow port 3000
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT

# Save rules (Debian/Ubuntu)
sudo iptables-save > /etc/iptables/rules.v4
```

---

## Integration with CamillaDSP

### Running Both Services

**Recommended setup:**
- CamillaDSP on ports 1234 (control) + 1235 (spectrum)
- CamillaEQ on port 3000
- Both as systemd services

**Start order:**
- CamillaDSP first (audio processing)
- CamillaEQ second (UI)

**systemd dependency** (optional, add to `camillaeq.service`):
```ini
[Unit]
After=camilladsp.service
Wants=camilladsp.service
```

**Effect:** CamillaEQ waits for CamillaDSP to start

---

## Troubleshooting

### Service Won't Start

**Check logs:**
```bash
sudo journalctl -u camillaeq -n 50 --no-pager
```

**Common causes:**
- Port 3000 already in use → Change `SERVER_PORT`
- Missing node_modules → Run `npm ci --omit=dev`
- Wrong WorkingDirectory → Check `/opt/camillaeq` exists
- Permissions → Check `camillaeq` user owns `/opt/camillaeq`

---

### Service Crashes Repeatedly

**Check restart count:**
```bash
sudo systemctl status camillaeq
# Look for "Start request repeated too quickly"
```

**If hitting restart limit:**
```bash
# Reset failure count
sudo systemctl reset-failed camillaeq

# Increase restart limits (in service file)
[Service]
StartLimitBurst=5
StartLimitIntervalSec=60
```

---

### High Memory Usage

**Check actual usage:**
```bash
systemctl status camillaeq  # Shows current memory
sudo ps aux | grep camillaeq
```

**Set memory limit:**
```bash
# Edit service file
sudo systemctl edit camillaeq
```

Add:
```ini
[Service]
MemoryMax=500M
MemoryHigh=400M
```

```bash
sudo systemctl daemon-reload
sudo systemctl restart camillaeq
```

---

## Next Steps

- [Headless SBC](headless-sbc.md) - SBC-specific considerations
- [Recovery and Backups](recovery-and-backups.md) - Backup procedures
- [Deployment Models](deployment-models.md) - Architecture overview
