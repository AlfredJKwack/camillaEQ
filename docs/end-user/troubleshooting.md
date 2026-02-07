# Troubleshooting

**Intended audience:** End users encountering problems with CamillaEQ.

**This document does not cover:** Developer debugging or system administration issues.

---

## Connection Issues

### Cannot Connect to CamillaDSP

**Symptoms:**
- Connection status shows "Connection Error" (red)
- Error message appears: "Connection failed" or similar

**Checks:**

1. **Verify CamillaDSP is running:**
   ```bash
   # Check if process is running
   ps aux | grep camilladsp
   
   # Check if ports are listening
   netstat -tuln | grep 1234
   netstat -tuln | grep 1235
   ```

2. **Verify server/port settings:**
   - **Server:** Correct IP or hostname (use `localhost` for same machine)
   - **Control Port:** Matches CamillaDSP's `-p` flag (default: 1234)
   - **Spectrum Port:** Matches second CamillaDSP instance or separate port

3. **Check network connectivity:**
   ```bash
   # Test connection to control port
   telnet <server> <control-port>
   
   # Or use nc (netcat)
   nc -zv <server> <control-port>
   ```

4. **Check firewall rules:**
   - Ensure ports are not blocked by firewall
   - On Linux: `sudo ufw status` or `sudo iptables -L`

5. **Browser console errors:**
   - Open browser DevTools (F12)
   - Check Console tab for WebSocket errors

**Solutions:**

**CamillaDSP not running:**
- Start CamillaDSP with WebSocket interface enabled
- Example: `camilladsp -p 1234 config.yml`

**Wrong port:**
- Update **Control Port** in Connection page to match CamillaDSP

**Network/firewall blocking:**
- Add firewall exception for WebSocket ports
- If on different machine, verify network routing

---

### Connection Status Shows "Degraded"

**Symptoms:**
- Status icon shows yellow/amber glow
- "Degraded (Spectrum Unavailable)" message appears

**What this means:**
- **Control WebSocket is connected** (EQ editing works)
- **Spectrum WebSocket is not connected** (no spectrum overlay)

**What still works:**
- EQ editing and uploads
- Volume control
- Preset save/load

**What does not work:**
- Spectrum analyzer overlay

**Checks:**

1. **Verify spectrum CamillaDSP instance is running:**
   ```bash
   ps aux | grep camilladsp
   netstat -tuln | grep <spectrum-port>
   ```

2. **Check spectrum port setting:**
   - Verify **Spectrum Port** on Connection page matches where spectrum config is loaded

3. **Verify spectrum config returns valid data:**
   - See [Spectrum Analyzer](spectrum-analyzer.md) setup guide

**Solutions:**

**Spectrum instance not running:**
- Start CamillaDSP with spectrum config on spectrum port
- Example: `camilladsp -p 1235 spectrum-256.yml`

**Wrong port:**
- Update **Spectrum Port** on Connection page

**Accept degraded mode:**
- You can continue using EQ editing without spectrum overlay
- Spectrum is optional for EQ adjustments

---

### Auto-Reconnect Not Working

**Symptoms:**
- Page reload does not automatically connect
- Must manually click "Connect" every time

**Checks:**

1. **Verify auto-reconnect is enabled:**
   - On Connection page, check **"Auto-reconnect on page load"** checkbox

2. **Check browser localStorage:**
   - Open DevTools (F12) → Application tab → Local Storage
   - Verify `camillaDSP.autoReconnect` is set to `"true"`
   - Verify `camillaDSP.server`, `camillaDSP.controlPort`, `camillaDSP.spectrumPort` are set

**Solutions:**

**Setting not saved:**
- Enable checkbox again
- Try different browser (clear cache if issue persists)

**localStorage cleared:**
- Browser privacy settings may be clearing localStorage
- Check browser privacy mode settings

---

## Audio Issues

### No Sound After Connecting

**Important:** CamillaEQ does **not** process audio. CamillaDSP handles all audio routing.

**Checks:**

1. **Verify CamillaDSP audio path:**
   - Check CamillaDSP logs for audio errors
   - Verify capture device is receiving audio
   - Verify playback device is outputting audio

2. **Test CamillaDSP independently:**
   ```bash
   # Start CamillaDSP and monitor logs
   camilladsp -v -p 1234 config.yml
   ```

3. **Check ALSA/audio devices:**
   ```bash
   # List ALSA devices
   aplay -l
   arecord -l
   
   # Test playback
   speaker-test -D <device> -c 2
   ```

**Solutions:**

**Audio devices misconfigured:**
- Fix CamillaDSP `devices:` section in config
- Refer to CamillaDSP documentation

**CamillaDSP not processing audio:**
- This is a CamillaDSP issue, not CamillaEQ
- Check CamillaDSP logs and configuration

---

## Spectrum Issues

### Spectrum Overlay Not Visible

**Symptoms:**
- No spectrum visualization on EQ page
- Canvas area is blank

**Checks:**

1. **Verify at least one analyzer series is enabled:**
   - On EQ page, check **STA**, **LTA**, or **PEAK** toggles
   - Overlay is disabled when all toggles are OFF

2. **Verify connection status:**
   - Must be "Connected" (green) or "Degraded" (yellow)
   - If "Degraded", spectrum is expected to be unavailable

3. **Check "Spectrum: N bins" on Connection page:**
   - If missing, spectrum data is not valid
   - See [Spectrum Analyzer](spectrum-analyzer.md) setup

**Solutions:**

**Analyzer series all disabled:**
- Enable at least one toggle (STA/LTA/PEAK)

**Spectrum socket not connected:**
- See [Connection Status Shows "Degraded"](#connection-status-shows-degraded)

**Spectrum not configured:**
- Follow [Spectrum Analyzer Setup](spectrum-analyzer.md) guide

---

### "Spectrum: N bins" Does Not Appear

**Symptoms:**
- Connection page does not show bin count
- Spectrum overlay does not work

**Possible causes:**

**Spectrum WebSocket returns invalid data:**

1. **Array has <3 values:**
   - CamillaEQ requires ≥3 numeric values
   - Stereo-only responses (2 values) are rejected

2. **Spectrum config not loaded:**
   - CamillaDSP on spectrum port is not running spectrum config
   - Check CamillaDSP logs

3. **Wrong port:**
   - Spectrum Port setting does not match actual spectrum instance

**Solutions:**

**Generate and load spectrum config:**
1. Generate config: `node tools/build-camillaDSP-spectrum-yml.js --bins 256`
2. Edit `devices:` section to match your audio setup
3. Load on spectrum port: `camilladsp -p 1235 spectrum-256.yml`
4. Reconnect CamillaEQ

**Verify spectrum response:**
- Use browser DevTools (F12) → Network tab → WS filter
- Check WebSocket messages for `GetPlaybackSignalPeak` response
- Verify response is an array of ≥3 numbers

---

### Spectrum Overlay Is Frozen

**Symptoms:**
- Spectrum display does not update
- Overlay fades to 30% opacity

**What this means:**
- No new spectrum data received within 500ms
- Indicates spectrum WebSocket is not responding

**Checks:**

1. **CamillaDSP spectrum instance still running:**
   ```bash
   ps aux | grep camilladsp | grep <spectrum-port>
   ```

2. **Network connection stable:**
   - Check for network interruptions
   - Try reconnecting

3. **Browser console errors:**
   - Open DevTools (F12) → Console tab
   - Check for WebSocket errors or timeouts

**Solutions:**

**Spectrum instance crashed:**
- Restart CamillaDSP spectrum instance
- Check CamillaDSP logs for crash cause

**Network interruption:**
- Disconnect and reconnect in CamillaEQ
- Or enable auto-reconnect and reload page

---

## EQ Editing Issues

### Changes Not Uploading

**Symptoms:**
- Upload status shows "error" (red)
- Changes not applied to CamillaDSP

**Checks:**

1. **Connection status:**
   - Must be "Connected" or "Degraded"
   - If "Error", reconnect first

2. **Browser console:**
   - Open DevTools (F12) → Console tab
   - Check for upload errors or validation failures

3. **Config validation:**
   - Invalid configs are rejected
   - Check for orphaned filter references or missing mixers

**Solutions:**

**Connection lost:**
- Reconnect to CamillaDSP

**Invalid configuration:**
- Reload a known-good preset
- Or disconnect and reconnect (downloads fresh config)

**Server-side error:**
- Check CamillaDSP logs
- CamillaDSP may have rejected the config

---

### Disabled Filters Not Restoring

**Symptoms:**
- Clicking power button (⏻) does not re-enable filter
- Filter stays grayed out

**Possible causes:**

**localStorage data corruption:**
- Disabled filters are tracked in browser localStorage
- Data may be invalid or corrupted

**Solutions:**

1. **Clear disabled filters overlay:**
   - Open browser DevTools (F12) → Console tab
   - Run: `localStorage.removeItem('disabledFiltersOverlay')`
   - Reload page

2. **Reload a preset:**
   - Presets overwrite disabled filter state
   - Load any preset to reset

---

## Server Issues

### Cannot Save Preset (Read-Only Mode)

**Symptoms:**
- "Save Current" fails with 403 error
- Error message: "Server is in read-only mode"
- Browser console shows `ERR_READ_ONLY`

**What this means:**
- The server has been configured in **read-only mode** for security (typically for public exposure)
- Write operations to `/api/*` are blocked
- EQ editing and CamillaDSP control still work (WebSocket connections bypass this restriction)

**What still works:**
- Adjusting EQ bands (uploads to CamillaDSP directly)
- Volume control
- Viewing existing presets

**What does not work:**
- Saving new presets
- Updating existing presets
- Saving latest DSP state to recovery cache

**Solutions:**

**If you're the administrator:**
- Edit server configuration: `/etc/camillaeq/camillaeq.env`
- Set `SERVER_READ_ONLY=false`
- Restart service: `sudo systemctl restart camillaeq`
- See [Linux Services](../power-user/linux-services.md) for details

**If you're not the administrator:**
- Contact your system administrator
- This is an intentional security feature for publicly-exposed deployments

---

## Preset Issues

### Cannot Save Preset (Other Causes)

**Symptoms:**
- "Save Current" button does nothing
- Error message when saving

**Checks:**

1. **Server is running:**
   - Backend server must be accessible
   - Verify `http://localhost:3000/health` returns `{"status":"ok"}`

2. **Server data directory is writable:**
   - Check `server/data/configs/` directory exists
   - Check permissions (user running server must have write access)

**Solutions:**

**Server not running:**
- Start server: `npm run start` (production) or `npm run dev:server` (development)

**Permission denied:**
- Fix directory permissions: `chmod -R u+w server/data/configs/`

---

### Cannot Load Preset

**Symptoms:**
- Clicking "Load" button does nothing
- Error message when loading

**Checks:**

1. **Preset file exists:**
   - Check `server/data/configs/` directory
   - Verify preset file is valid JSON

2. **CamillaDSP connection:**
   - Must be connected to upload preset
   - Presets require config upload to CamillaDSP

**Solutions:**

**Preset file corrupted:**
- Delete and re-save preset
- Or manually edit JSON file to fix

**Not connected:**
- Connect to CamillaDSP first
- Then load preset

---

## Server Issues

### Backend Server Won't Start

**Symptoms:**
- `npm run start` or `npm run dev:server` fails
- Port already in use error

**Checks:**

1. **Port conflicts:**
   ```bash
   # Check if port 3000 is in use
   netstat -tuln | grep 3000
   lsof -i :3000
   ```

2. **Dependencies installed:**
   ```bash
   npm install
   ```

3. **Build completed (production only):**
   ```bash
   npm run build
   ```

**Solutions:**

**Port conflict:**
- Set `SERVER_PORT` environment variable: `SERVER_PORT=3001 npm run start`
- Or create a `.env` file from `.env.example` and set `SERVER_PORT=3001`
- Or kill process using port: `kill -9 <PID>`

**Dependencies missing:**
- Run `npm install` in project root

**Build missing:**
- Run `npm run build` before `npm run start`

---

### Server Crashes or Restarts

**Symptoms:**
- Server exits unexpectedly
- systemd shows failed status

**Checks:**

1. **Check logs:**
   ```bash
   # Development
   Check terminal output
   
   # Production (systemd)
   sudo journalctl -u camillaeq -n 100
   ```

2. **Disk space:**
   ```bash
   df -h
   ```

3. **Memory usage:**
   ```bash
   free -h
   ```

**Solutions:**

**Out of memory:**
- Increase system memory
- Or reduce `CHUNKSIZE` in CamillaDSP config

**Disk full:**
- Clean up logs or old files
- Increase disk space

**Configuration error:**
- Check log output for specific error
- Fix configuration and restart

---

## Browser Issues

### UI Not Loading

**Symptoms:**
- Blank page
- Loading forever

**Checks:**

1. **Correct URL:**
   - Development: `http://localhost:5173`
   - Production: `http://localhost:3000`

2. **Server is running:**
   - Verify backend server is started
   - Check console/logs for errors

3. **Browser console:**
   - Open DevTools (F12) → Console tab
   - Check for loading errors

**Solutions:**

**Wrong URL:**
- Use correct URL for mode (dev vs prod)

**Server not running:**
- Start server (see [Quick Start](quick-start.md))

**Browser cache:**
- Hard reload: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)

---

### UI Is Slow or Unresponsive

**Symptoms:**
- Dragging tokens is laggy
- Spectrum overlay stutters

**Checks:**

1. **Browser DevTools open:**
   - DevTools can slow rendering
   - Close DevTools when not needed

2. **Too many spectrum bins:**
   - 256 bins is recommended maximum
   - Higher bin counts increase CPU usage

3. **Multiple tabs/windows:**
   - Each tab polls spectrum independently
   - Close unused tabs

**Solutions:**

**Close DevTools:**
- Press F12 to close

**Reduce bin count:**
- Regenerate spectrum config with fewer bins
- Example: `--bins 128`

**Disable spectrum:**
- Turn off all analyzer series toggles (STA/LTA/PEAK)
- Spectrum overlay stops polling

---

## Getting Help

### Diagnostics Export

For bug reports or support requests, export diagnostics:

1. Navigate to **Connection page**
2. Click **"Copy Diagnostics"** button
3. Paste into bug report

**Diagnostics include:**
- Connection state
- Server/port settings
- CamillaDSP version
- Last 50 failure messages with timestamps
- Config summary (filter/mixer/pipeline counts)

### Report Issues

GitHub repository: https://github.com/AlfredJKwack/camillaEQ

When reporting issues, include:
- **Diagnostics export** (from Copy Diagnostics button)
- **Steps to reproduce**
- **Expected vs actual behavior**
- **Browser and OS version**
- **CamillaDSP version**

---

## Next Steps

- [Overview](overview.md) - Understand CamillaEQ architecture
- [Quick Start](quick-start.md) - Installation and first connection
- [Spectrum Analyzer](spectrum-analyzer.md) - Set up spectrum overlay
