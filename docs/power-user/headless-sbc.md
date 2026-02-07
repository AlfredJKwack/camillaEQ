# Headless SBC Deployment

**Intended audience:** Power users deploying CamillaEQ on headless single-board computers.

**This document does not cover:** Development setup or desktop installations.

---

## Supported SBC Platforms

### Tested Platforms
- Orange Pi (Armbian)
- Raspberry Pi 3/4/5 (Raspberry Pi OS)
- Rock Pi
- Odroid

**Requirements:**
- ARMv7 or ARM64 architecture
- ≥512 MB RAM (1 GB recommended)
- ≥4 GB storage
- Network connectivity (Ethernet or WiFi)
- systemd-based Linux distribution

---

## Resource Considerations

### CPU

**Minimum:** 1 GHz single-core ARM processor

**Recommended:** Multi-core (for concurrent CamillaDSP + CamillaEQ)

**Usage patterns:**
- **Idle:** <5% CPU (both services)
- **Spectrum analyzer active:** +2-5% (browser polling, not server)
- **EQ editing:** Burst to 10-20% during config uploads
- **Build time:** High (30-60 minutes on slow SBCs)

**Tip:** Build on faster machine, rsync artifacts to SBC

---

### Memory

**Minimum:** 512 MB total RAM

**Recommended:** 1 GB+

**Breakdown:**
- System + services: ~200-300 MB
- CamillaDSP: ~50-100 MB (depends on config complexity)
- CamillaEQ server: ~50-100 MB
- **Free for cache/buffers:** ~200+ MB

**If low on RAM:**
- Reduce spectrum bin count (256 → 128 bins)
- Close unused services
- Add swap (not recommended for SD cards)

---

### Storage

**Application:**
- ~200 MB for installation (built app + node_modules)
- <1 MB for data (presets + recovery cache)

**Media:**
- SD card: Works, but avoid excessive writes
- eMMC: Preferred for reliability
- USB drive: Good for data directory

**Longevity tips:**
- Use quality SD cards (Class 10, A1 rated)
- Mount `/tmp` as tmpfs (reduce SD writes)
- Use eMMC or USB for data directory if available

---

### Network

**Bandwidth:**
- Minimal (<1 Mbps typical)
- Spectrum polling: ~10 KB/s per active browser
- Preset load/save: Burst (<100 KB)

**Latency:**
- <100 ms on LAN (acceptable)
- <20 ms preferred for smooth spectrum

**WiFi vs Ethernet:**
- **Ethernet:** Preferred for stability
- **WiFi:** Acceptable if signal strong

---

## Headless Installation

### Prerequisites

**On SBC:**
```bash
# Update system
sudo apt update
sudo apt upgrade -y

# Install Node.js 18+ (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version  # Should be ≥18.0.0
npm --version   # Should be ≥9.0.0

# Install build tools (if building on SBC)
sudo apt install -y build-essential git
```

**On development machine (if cross-building):**
```bash
# Build application
cd /path/to/camillaeq
npm install
npm run build

# Create tarball
tar czf camillaeq-dist.tar.gz server/dist package.json package-lock.json

# Copy to SBC
scp camillaeq-dist.tar.gz user@sbc-ip:/tmp/
```

---

### Installation

**If building on SBC:**
```bash
# Clone repository
cd /tmp
git clone https://github.com/AlfredJKwack/camillaEQ.git
cd camillaEQ

# Build (may take 30-60 minutes on slow SBCs)
npm install
npm run build
```

**If using pre-built tarball:**
```bash
# Extract
cd /tmp
tar xzf camillaeq-dist.tar.gz
```

**Install to /opt:**
```bash
# Create user
sudo useradd -r -s /bin/false -m -d /opt/camillaeq camillaeq

# Copy files
sudo mkdir -p /opt/camillaeq
sudo cp -r server/dist /opt/camillaeq/server
sudo cp package.json /opt/camillaeq/
sudo cp package-lock.json /opt/camillaeq/

# Install production dependencies
cd /opt/camillaeq
sudo npm ci --omit=dev

# Create data directory
sudo mkdir -p /opt/camillaeq/data/configs

# Set ownership
sudo chown -R camillaeq:camillaeq /opt/camillaeq
```

**Configure and start service:**
```bash
# Copy service files
cd /tmp/camillaEQ  # or wherever source is
sudo cp deploy/systemd/camillaeq.service /etc/systemd/system/
sudo mkdir -p /etc/camillaeq
sudo cp deploy/systemd/camillaeq.env.example /etc/camillaeq/camillaeq.env

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable camillaeq
sudo systemctl start camillaeq

# Verify
sudo systemctl status camillaeq
```

---

## Network Access

### Find SBC IP Address

```bash
# On SBC
ip addr show

# Look for inet line under eth0 or wlan0
# Example: inet 192.168.1.100/24
```

**Or from router:**
- Check DHCP lease table
- Look for device hostname

---

### Set Static IP (Recommended)

**Using netplan (Ubuntu/Armbian):**

```bash
# Edit netplan config
sudo nano /etc/netplan/01-netcfg.yaml
```

```yaml
network:
  version: 2
  ethernets:
    eth0:
      dhcp4: no
      addresses:
        - 192.168.1.100/24
      gateway4: 192.168.1.1
      nameservers:
        addresses: [8.8.8.8, 1.1.1.1]
```

```bash
# Apply
sudo netplan apply
```

**Using /etc/network/interfaces (Debian/Raspbian):**

```bash
sudo nano /etc/network/interfaces
```

```
auto eth0
iface eth0 inet static
  address 192.168.1.100
  netmask 255.255.255.0
  gateway 192.168.1.1
  dns-nameservers 8.8.8.8 1.1.1.1
```

```bash
# Restart networking
sudo systemctl restart networking
```

---

### Access from Browser

**From any device on LAN:**
```
http://192.168.1.100:3000
```

**Bookmark this URL** for easy access

---

## Auto-Start on Boot

### Verify Auto-Start Enabled

```bash
# Check if service is enabled
systemctl is-enabled camillaeq

# Should output: enabled
```

**If not enabled:**
```bash
sudo systemctl enable camillaeq
```

---

### Boot Order

**Recommended startup order:**
1. Network (wait for network-online.target)
2. CamillaDSP
3. CamillaEQ

**Enforce in service file:**
```ini
[Unit]
After=network-online.target camilladsp.service
Wants=network-online.target camilladsp.service
```

---

## CamillaDSP Device Configuration

### Device Configuration Wizard

CamillaEQ includes an interactive CLI wizard to help generate valid CamillaDSP device configurations for macOS (CoreAudio) and Linux (ALSA).

**Location:** `tools/camilladsp-device-wizard.mjs`

**Features:**
- Auto-discovers audio devices on your system
- Hardware probing (Linux/ALSA) to detect valid sample rates, formats, and channel counts
- Interactive menus with arrow-key navigation
- Automatic validation using `camilladsp --check`
- Smart defaults based on hardware capabilities

**Usage:**
```bash
# From CamillaEQ project root
node tools/camilladsp-device-wizard.mjs

# With custom output path
node tools/camilladsp-device-wizard.mjs --output ~/my-dsp-config.yml

# Skip ALSA probing (Linux only)
node tools/camilladsp-device-wizard.mjs --no-probe
```

**Use cases:**
- First-time CamillaDSP setup on new hardware
- Troubleshooting device configuration issues
- Quick generation of valid device configs

See [`tools/README.md`](../../tools/README.md) for detailed options and examples.

---

## Spectrum Analyzer on SBC

### Bin Count Recommendations

**For SBCs with limited CPU:**
- **128 bins:** Smooth, low overhead
- **256 bins:** Default, acceptable on most SBCs
- **512+ bins:** May cause lag on weak SBCs

**Generate spectrum config:**
```bash
# On development machine (has Node.js)
node tools/build-camillaDSP-spectrum-yml.js --bins 128 --q 12

# Copy to SBC
scp spectrum-128.yml user@sbc-ip:/path/to/config/
```

---

### Multiple Browser Tabs

**Each browser tab polls independently:**
- 1 tab: ~10 requests/sec
- 2 tabs: ~20 requests/sec
- Impact: Linear CPU increase

**Best practice:** Close unused tabs

---

## Firewall Configuration

### Simple Setup (ufw)

```bash
# Install ufw if not present
sudo apt install -y ufw

# Allow SSH (important!)
sudo ufw allow 22/tcp

# Allow CamillaEQ
sudo ufw allow 3000/tcp

# Allow CamillaDSP
sudo ufw allow 1234/tcp
sudo ufw allow 1235/tcp

# Enable firewall
sudo ufw enable

# Verify
sudo ufw status
```

---

### Restrict to LAN Only

```bash
# Allow only from local subnet
sudo ufw allow from 192.168.1.0/24 to any port 3000
sudo ufw allow from 192.168.1.0/24 to any port 1234
sudo ufw allow from 192.168.1.0/24 to any port 1235
```

---

## Performance Tuning

### Reduce Spectrum Overhead

**Use lower Q (smoother, less CPU per bin):**
```bash
node tools/build-camillaDSP-spectrum-yml.js --bins 256 --q 12
```

**Enable UI smoothing** (shifts work to client):
- In UI: Select "1/6 Oct" or "1/3 Oct" smoothing

---

### Reduce systemd Logging

**If logs fill disk:**
```bash
# Edit systemd config
sudo nano /etc/systemd/journald.conf
```

```ini
[Journal]
SystemMaxUse=100M
MaxRetentionSec=7day
```

```bash
sudo systemctl restart systemd-journald
```

---

### Disable Unnecessary Services

```bash
# List running services
systemctl list-units --type=service --state=running

# Disable unused services (example)
sudo systemctl disable bluetooth
sudo systemctl disable avahi-daemon
```

---

## SD Card Longevity

### Reduce Write Cycles

**Mount /tmp as tmpfs:**
```bash
sudo nano /etc/fstab
```

Add:
```
tmpfs /tmp tmpfs defaults,noatime,mode=1777 0 0
```

```bash
sudo mount -a
```

**Move data directory to USB (optional):**
```bash
# Mount USB drive at /mnt/usb
# Move data
sudo mv /opt/camillaeq/data /mnt/usb/camillaeq-data
sudo ln -s /mnt/usb/camillaeq-data /opt/camillaeq/data

# Or update CONFIG_DIR in /etc/camillaeq/camillaeq.env
CONFIG_DIR=/mnt/usb/camillaeq-data
```

---

### Use Quality SD Cards

**Recommended:**
- SanDisk Extreme/Ultra
- Samsung EVO/PRO
- Class 10, A1 or A2 rated

**Avoid:**
- Generic no-name cards
- Old/slow cards (Class 4 or below)

---

## Remote Access

### SSH Setup

**Enable SSH (if not already):**
```bash
sudo systemctl enable ssh
sudo systemctl start ssh
```

**Key-based authentication (recommended):**
```bash
# On your machine, copy SSH key
ssh-copy-id user@sbc-ip

# Disable password authentication (optional)
sudo nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
sudo systemctl restart ssh
```

---

### Hostname Configuration

**Set friendly hostname:**
```bash
sudo hostnamectl set-hostname camillaeq-sbc
```

**Access via hostname** (if mDNS enabled):
```
http://camillaeq-sbc.local:3000
```

---

## Monitoring

### Temperature Monitoring

```bash
# Check CPU temperature
cat /sys/class/thermal/thermal_zone0/temp
# Divide by 1000 for °C

# Or use vcgencmd (Raspberry Pi)
vcgencmd measure_temp
```

**If overheating:**
- Add heatsink or fan
- Improve ventilation
- Reduce CPU frequency (not recommended)

---

### Service Monitoring

**Simple uptime check:**
```bash
#!/bin/bash
# /usr/local/bin/check-camillaeq.sh

if ! systemctl is-active --quiet camillaeq; then
  echo "CamillaEQ is down, restarting..."
  systemctl start camillaeq
fi
```

**Add to cron:**
```bash
# Check every 5 minutes
*/5 * * * * /usr/local/bin/check-camillaeq.sh
```

---

## Backup Strategy

**What to back up:**
- `/opt/camillaeq/data/` - Presets and recovery cache
- `/etc/camillaeq/` - Environment configuration
- `/etc/systemd/system/camillaeq.service` - Service file

**Simple backup script:**
```bash
#!/bin/bash
BACKUP_DIR=/mnt/usb/backups
DATE=$(date +%Y%m%d)

mkdir -p $BACKUP_DIR
tar czf $BACKUP_DIR/camillaeq-data-$DATE.tar.gz /opt/camillaeq/data
tar czf $BACKUP_DIR/camillaeq-config-$DATE.tar.gz /etc/camillaeq /etc/systemd/system/camillaeq.service
```

**Schedule via cron:**
```bash
# Daily backup at 3 AM
0 3 * * * /usr/local/bin/backup-camillaeq.sh
```

---

## Troubleshooting

### Service Won't Start After Reboot

**Check dependencies:**
```bash
sudo systemctl status camillaeq
# Look for "network-online.target not available"
```

**Solution:**
```bash
sudo systemctl enable systemd-networkd-wait-online
```

---

### High Memory Usage

**Check actual usage:**
```bash
free -h
```

**If swapping heavily:**
- Reduce spectrum bins
- Close browser tabs
- Add RAM (if SBC supports)

---

### Slow Web UI

**Possible causes:**
- Weak WiFi signal → Use Ethernet
- Browser on slow device → Try different device
- Too many spectrum bins → Reduce to 128

---

## Next Steps

- [Recovery and Backups](recovery-and-backups.md) - Detailed backup procedures
- [Linux Services](linux-services.md) - systemd service management
- [Deployment Models](deployment-models.md) - Architecture overview
