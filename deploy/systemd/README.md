# Systemd Deployment

This directory contains systemd service files for deploying CamillaEQ on Linux systems (Debian, Ubuntu, Armbian on Orange Pi, etc.).

## Installation Steps

### 1. Create Service User

```bash
sudo useradd -r -s /bin/false camillaeq
```

### 2. Install Application

```bash
# Create installation directory
sudo mkdir -p /opt/camillaeq
sudo chown camillaeq:camillaeq /opt/camillaeq

# Copy built server (from server/dist to /opt/camillaeq/server)
sudo mkdir -p /opt/camillaeq/server
sudo cp -r server/dist/* /opt/camillaeq/server/
sudo cp server/package.json /opt/camillaeq/server/

# Copy workspace metadata for dependency installation
sudo mkdir -p /opt/camillaeq/client
sudo cp package.json package-lock.json /opt/camillaeq/
sudo cp client/package.json /opt/camillaeq/client/

# Copy data directory for presets
sudo mkdir -p /opt/camillaeq/data/configs
sudo chown -R camillaeq:camillaeq /opt/camillaeq/data
sudo cp server/data/configs/*.json /opt/camillaeq/data/configs/

# Install production dependencies
cd /opt/camillaeq
sudo npm ci --omit=dev --workspaces=server

# Fix ownership
sudo chown -R camillaeq:camillaeq /opt/camillaeq

### 3. Configure Environment

```bash
# Create config directory
sudo mkdir -p /etc/camillaeq

# Copy and customize environment file
sudo cp deploy/systemd/camillaeq.env.example /etc/camillaeq/camillaeq.env
sudo chown root:root /etc/camillaeq/camillaeq.env
sudo chmod 644 /etc/camillaeq/camillaeq.env

# Edit configuration
sudo nano /etc/camillaeq/camillaeq.env
```

**Important:** The systemd service loads environment variables from `/etc/camillaeq/camillaeq.env` (via `EnvironmentFile=`).
- Do **not** rely on `.env` files in `/opt/camillaeq` or `/usr/local/share/camillaeq`.
- Changes to `/etc/camillaeq/camillaeq.env` require a service restart: `sudo systemctl restart camillaeq`.

To verify which environment variables the running service sees:
```bash
# Get the service PID
sudo systemctl show camillaeq -p MainPID

# Inspect process environment (replace <PID> with actual MainPID)
sudo tr '\0' '\n' < /proc/<PID>/environ | grep '^CAMILLA_'
```

### 4. Install and Enable Service

```bash
# Copy service file
sudo cp deploy/systemd/camillaeq.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable camillaeq

# Start service
sudo systemctl start camillaeq

# Check status
sudo systemctl status camillaeq
```

### 5. View Logs

```bash
# Follow logs in real-time
sudo journalctl -u camillaeq -f

# View recent logs
sudo journalctl -u camillaeq -n 100

# View logs since boot
sudo journalctl -u camillaeq -b
```

## Updating

To update CamillaEQ:

```bash
# Stop service
sudo systemctl stop camillaeq

# Backup data
sudo cp -r /opt/camillaeq/data /opt/camillaeq/data.backup

# Update application files
sudo cp -r server/dist/* /opt/camillaeq/server/
sudo cp server/package.json /opt/camillaeq/server/

# Update dependencies if package.json changed
cd /opt/camillaeq
sudo npm ci --omit=dev --workspaces=false

# Fix ownership
sudo chown -R camillaeq:camillaeq /opt/camillaeq

# Start service
sudo systemctl start camillaeq
```

## Troubleshooting

### Check Service Status
```bash
sudo systemctl status camillaeq
```

### Check Logs
```bash
sudo journalctl -u camillaeq -n 50 --no-pager
```

### Test Configuration
```bash
# Test as camillaeq user (from WorkingDirectory)
cd /opt/camillaeq
sudo -u camillaeq NODE_ENV=production /usr/bin/node server/index.js
```

### Verify Permissions
```bash
# Check data directory
ls -la /opt/camillaeq/data

# Check service file
ls -la /etc/systemd/system/camillaeq.service
```

## Network Access

By default, CamillaEQ binds to `0.0.0.0:3000` (all interfaces). To access from other devices on your LAN:

```
http://<device-ip>:3000
```

To restrict access to localhost only (e.g., if using reverse proxy):

```bash
# Edit /etc/camillaeq/camillaeq.env
SERVER_HOST=127.0.0.1
```

## Security Notes

- The service runs as unprivileged user `camillaeq`
- Data directory is the only writable path (`ReadWritePaths=/opt/camillaeq/data`)
- System and home directories are protected
- Consider using a reverse proxy (nginx, caddy) for HTTPS/auth if exposing beyond LAN

## Reverse Proxy Example (nginx)

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
