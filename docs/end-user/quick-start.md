# Quick Start

**Intended audience:** End users installing and running CamillaEQ for the first time.

**This document does not cover:** Production deployment (see Power User docs).

---

## Prerequisites

Before starting, ensure you have:

1. **Node.js 18+** and **npm 9+** installed
2. **CamillaDSP** running with WebSocket interface enabled
3. Two accessible WebSocket ports (typically 1234 for control, 1235 for spectrum)

---

## Installation (Development Mode)

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/AlfredJKwack/camillaEQ.git
cd camillaEQ
npm install
```

### 2. Start the Application

```bash
npm run dev
```

This starts:
- **Backend server** on `http://localhost:3000` (API + static files)
- **Frontend dev server** on `http://localhost:5173` (hot reload)

### 3. Open in Browser

Navigate to: `http://localhost:5173`

---

## Installation (Production Build)

### 1. Build the Application

```bash
npm run build
```

This creates optimized builds in:
- `server/dist/` (backend)
- `client/dist/` (frontend, copied to `server/dist/client/`)

### 2. Start Production Server

```bash
npm run start
```

The production server serves both API and UI on a single port (default: 3000).

Navigate to: `http://localhost:3000`

---

## First Connection

### 1. Navigate to Connection Page

Click the **Connect** icon in the navigation rail (left side).

### 2. Enter CamillaDSP Connection Details

**Server:** IP address or hostname where CamillaDSP is running  
Example: `localhost` (same machine) or `192.168.1.100` (network device)

**Control Port:** CamillaDSP WebSocket control port  
Default: `1234`

**Spectrum Port:** CamillaDSP WebSocket spectrum port  
Default: `1235`

### 3. Optional: Enable Auto-Reconnect

Check **"Auto-reconnect on page load"** to automatically reconnect when you reload the page or navigate back to CamillaEQ.

### 4. Click Connect

**Success indicators:**
- Status indicator turns **green**
- CamillaDSP version appears
- Audio device lists populate

**If connection fails:** See [Troubleshooting](troubleshooting.md).

---

## Verify Connection

### Check Connection Status

The connection icon in the navigation rail shows:
- **Green glow:** Fully connected (control + spectrum)
- **Yellow/Amber glow:** Degraded (spectrum unavailable, EQ editing still works)
- **Blue glow:** Connecting or reconnecting
- **Red glow:** Connection error (control socket down)

### Check Spectrum Capability

On the Connection page, look for:
- **"Spectrum: N bins"** in the status card (e.g., "Spectrum: 256 bins")

If this line is missing:
- Spectrum WebSocket is not returning valid data
- See [Spectrum Analyzer Setup](spectrum-analyzer.md)

---

## Use the EQ

### 1. Navigate to EQ Page

Click the **EQ** icon in the navigation rail.

**Note:** If the EQ page shows **no bands** or looks empty, your CamillaDSP config may not have any filters loaded yet. In this case:
- Skip to [Load a Preset](#load-a-preset) first
- Then return here to adjust the EQ

A fresh CamillaDSP install often starts with an empty or minimal config.

### 2. Adjust EQ Bands

**Drag tokens:**
- **Left/right:** Change frequency
- **Up/down:** Change gain (for Peaking/Shelf types)
- **Shift + up/down:** Change Q (bandwidth)
- **Mouse wheel (on token):** Change Q

**Right panel controls:**
- **Fader:** Adjust gain
- **Frequency knob:** Fine-tune frequency
- **Q knob:** Fine-tune bandwidth
- **Power button (⏻):** Disable/enable band
- **Filter icon:** Change filter type (Peaking, Shelf, Pass, etc.)

### 3. Changes Upload Automatically

CamillaEQ uploads your changes to CamillaDSP after a 200ms pause in editing (debounced).

**Upload status indicator** (top-right corner):
- **Blue spinner:** Uploading
- **Green checkmark:** Upload successful (clears after 2s)
- **Red error:** Upload failed (hover for details)

---

## Save a Preset

### 1. Navigate to Presets Page

Click the **Presets** icon in the navigation rail.

### 2. Click "Save Current"

Enter a name for your configuration (e.g., "Bass Boost" or "Harman Target").

### 3. Click Save

Your preset is saved to the server's `data/configs/` directory.

---

## Load a Preset

### 1. Navigate to Presets Page

Presets are listed with their names.

### 2. Search (Optional)

Use the search box to filter presets. Press **`/`** to focus the search box.

**Keyboard navigation:**
- **Arrow Up/Down:** Highlight preset
- **Enter:** Load highlighted preset

### 3. Click "Load" or Click Preset Row

The preset replaces your current EQ configuration.

**Note:** Loading a preset overwrites all current settings, including disabled filters.

---

## Next Steps

- [Spectrum Analyzer](spectrum-analyzer.md) - Set up and interpret the spectrum overlay
- [Troubleshooting](troubleshooting.md) - Fix connection or spectrum issues
