# Spectrum Analyzer

**Intended audience:** End users setting up and using the spectrum analyzer overlay.

**This document does not cover:** Developer concepts or CamillaDSP internals.

---

## What the Spectrum Analyzer Shows

The spectrum analyzer displays **per-frequency-bin peak levels in dBFS** returned by CamillaDSP's spectrum WebSocket.

**Important:**
- This is **not** a time-domain waveform.
- This is **not** a traditional FFT analyzer.
- The spectrum data comes from whatever processing CamillaDSP returns on the spectrum port.

---

## What the Spectrum Does NOT Show

### It Does Not Automatically Show Pre/Post EQ

The **Pre/Post buttons** in CamillaEQ change **visualization colors only**.

**Why this is display-only today:**
- CamillaEQ polls the spectrum socket via `GetPlaybackSignalPeak`
- It does not reconfigure or rewire CamillaDSP's spectrum pipeline
- The spectrum data comes from wherever the spectrum port is wired

**Not implemented:** UI controls to remap the spectrum CamillaDSP instance to different signal tap points (pre-EQ vs post-EQ).

To actually see pre-EQ vs post-EQ signals:
- You must manually configure CamillaDSP with appropriate spectrum pipeline placement
- The spectrum port must be wired to the desired signal point
- This requires CamillaDSP configuration knowledge beyond CamillaEQ's scope

**Default setup with the provided tool:** Spectrum shows post-EQ playback signal.

### It Is Not Real-Time FFT

CamillaDSP generates spectrum data using a **bandpass filterbank** (one Biquad filter per bin), not FFT. This is a deliberate design choice for efficiency.

---

## Prerequisites

Before the spectrum overlay can display data:

1. **CamillaDSP must be running** with a spectrum-capable configuration
2. **Spectrum WebSocket must return ≥3 numeric values** (array of peak levels)
3. CamillaEQ must be **connected to the spectrum port**

---

## Setup: Generate Spectrum Configuration

CamillaEQ includes a tool to generate a CamillaDSP configuration with a bandpass filterbank for spectrum analysis.

### 1. Generate Spectrum Config

From the CamillaEQ project root:

```bash
node tools/build-camillaDSP-spectrum-yml.js --bins 256 --q 18 --out spectrum-256.yml
```

**Options:**
- `--bins <int>`: Number of frequency bins (default: 256)
- `--q <number>`: Q factor for bandpass filters (default: 18)
- `--out <filename>`: Output filename (default: `spectrum-<bins>.yml`)

**Q value recommendations:**
- **Q = 12:** Smoothest display, best for tonal balance work
- **Q = 16:** Good compromise between detail and smoothness
- **Q = 18:** Default, more detail but may appear "busy"

Lower Q = wider bandwidth = smoother, more stable display.

### 2. Edit Audio Device Configuration

Open `spectrum-256.yml` and edit the `devices:` section to match your audio setup.

**Example:**

```yaml
devices:
  samplerate: 48000
  chunksize: 2048
  capture:
    type: ALSA
    device: "hw:0,0"  # YOUR CAPTURE DEVICE
    channels: 2
    format: S32LE
  playback:
    type: File
    filename: "/dev/null"
    channels: 256
    format: S32LE
```

**Key points:**
- **Capture device:** Must match your CamillaDSP capture device
- **Playback:** Set to `/dev/null` (spectrum doesn't need audio output)
- **Playback channels:** Must equal `--bins` value (e.g., 256)

### 3. Load Config on CamillaDSP Spectrum Port

Start a **separate CamillaDSP instance** for spectrum generation:

```bash
camilladsp -p 1235 spectrum-256.yml
```

**Or**, if running a single CamillaDSP instance, load this config on your existing spectrum port.

---

## Verify Spectrum Capability

### 1. Connect to CamillaDSP

Open CamillaEQ and navigate to the **Connection page**.

### 2. Enter Spectrum Port

Ensure **Spectrum Port** matches the port where you loaded the spectrum config (e.g., `1235`).

### 3. Click Connect

### 4. Check Status

Look for **"Spectrum: N bins"** in the connection status card.

**Example:**
```
Spectrum: 256 bins
```

**If this line is missing:**
- Spectrum WebSocket is not returning valid data
- See [Troubleshooting](#troubleshooting) below

---

## Enable Spectrum Overlay

### 1. Navigate to EQ Page

Click the **EQ** icon in the navigation rail.

### 2. Enable Analyzer Series

In the **Visualization Options** bar (bottom of plot):

**Analyzer series toggles:**
- **STA** (Short-Term Average): Default **ON**, shows stable trend (~0.8s window)
- **LTA** (Long-Term Average): Default **OFF**, shows long-term balance (~8s window)
- **PEAK** (Peak Hold): Default **OFF**, tracks maximum levels with decay

**Overlay behavior:**
- Overlay is **enabled** when **any** series toggle is ON
- Overlay is **disabled** when **all** toggles are OFF

### 3. Select Visualization Mode

Click **Pre** (blue) or **Post** (green) to choose rendering colors.

**Note:** These buttons **only change colors**. To actually visualize pre-EQ vs post-EQ:
- Configure CamillaDSP spectrum pipeline appropriately
- Wire spectrum port to the desired signal point

### 4. Adjust Smoothing (Optional)

**Smoothing dropdown:**
- **Off:** No spatial smoothing (raw bin data)
- **1/12 Oct:** Narrowest smoothing
- **1/6 Oct:** Default, good balance
- **1/3 Oct:** Widest smoothing

Fractional-octave smoothing reduces visual artifacts (comb filtering appearance).

### 5. Reset Averages (Optional)

Click **↺** button to reset STA/LTA/Peak to current live values.

---

## Interpret the Display

### Vertical Axis
**dBFS (decibels relative to full scale)**
- **0 dBFS:** Maximum digital level (clipping)
- **Negative values:** Signal levels below full scale
- Typical music: -20 to -6 dBFS average, peaks near -3 to 0 dBFS

### Horizontal Axis
**Frequency (20 Hz to 20 kHz)**
- Log scale (musical spacing)
- Grid lines at musical intervals (C1-C9, octave markers)

### Analyzer Series

**STA (Short-Term Average):**
- Shows recent trend (~0.8s exponential window)
- Updates quickly, follows transients
- Primary reference for EQ adjustments

**LTA (Long-Term Average):**
- Shows overall spectral balance (~8s exponential window)
- Smooths out transient events
- Useful for tonal balance assessment

**PEAK (Peak Hold):**
- Tracks maximum level per bin
- Holds peaks for 2 seconds, then decays at 12 dB/s
- Shows loudest moments in each frequency range

---

## Update Rate

The spectrum overlay polls CamillaDSP at **~10 Hz (every 100ms)**.

**Stale data detection:**
- If no new data arrives within **500ms**, the overlay fades to 30% opacity
- This indicates spectrum WebSocket is not responding or is closed

---

## Troubleshooting

### Spectrum Overlay Is Not Visible

**Check:**
1. **At least one analyzer series is enabled** (STA/LTA/PEAK)
2. **Connection status is "Connected" (green)** or "Degraded" (yellow)
3. **"Spectrum: N bins" appears on Connection page**

### "Spectrum: N bins" Does Not Appear

**Possible causes:**

**Spectrum WebSocket returns <3 values:**
- The tool-generated config requires **256 playback channels** (or your chosen `--bins` value)
- If CamillaDSP returns only 2 values (stereo), CamillaEQ rejects it as invalid

**Spectrum config not loaded:**
- Verify CamillaDSP is running with the spectrum config on the spectrum port
- Check CamillaDSP logs for errors

**Wrong port:**
- Verify **Spectrum Port** in Connection page matches where spectrum config is loaded

### Spectrum Overlay Is Frozen

**Check:**
- CamillaDSP spectrum instance is still running
- Network connection to spectrum port is stable
- Browser console for errors (F12 → Console tab)

### Spectrum Overlay Is Too Busy/Noisy

**Solutions:**

**Increase Q smoothing (data-side):**
- Regenerate spectrum config with **lower Q value** (e.g., `--q 12`)
- Lower Q = wider bandwidth = smoother display

**Increase UI smoothing (display-side):**
- Select **1/3 Oct** smoothing in Visualization Options
- Enable **LTA** instead of **STA** for longer-term averaging

**Use Peak Hold sparingly:**
- Peak hold emphasizes loudest moments
- Can make display appear more volatile

---

## Best Practices

### For General EQ Work
- Use **STA only** (default)
- Set smoothing to **1/6 Oct** (default)
- Keep **band fill opacity** around 40% (default) for good curve visibility

### For Room EQ / Tonal Balance
- Enable **LTA** to see long-term average
- Use **1/3 Oct** smoothing for broader trends
- Disable **STA** and **PEAK** to reduce visual clutter

### For Transient Analysis
- Enable **PEAK** to see loudest moments
- Keep **STA** enabled as reference
- Use **Off** or **1/12 Oct** smoothing for maximum detail

---

## Known Limitations

### Pre/Post Mode Is Display-Only
The **Pre/Post buttons change rendering colors**, not the data source. To actually visualize pre-EQ vs post-EQ:
- Configure CamillaDSP spectrum pipeline to capture signal at desired point
- This requires CamillaDSP configuration knowledge beyond CamillaEQ's scope

### Spectrum Is Not FFT
The filterbank approach has different characteristics than FFT:
- **Frequency resolution:** Fixed by Q parameter, not bin count
- **Time resolution:** Depends on Q and sample rate
- **Phase response:** Each bin is a Biquad bandpass filter

This is **by design** and optimized for low CPU usage in CamillaDSP.

---

## Next Steps

- [Troubleshooting](troubleshooting.md) - Fix common issues
- [Overview](overview.md) - Understand CamillaEQ architecture
