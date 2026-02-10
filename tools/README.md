# Tools

## AutoEQ Preset Import (Build-Time)

Import high-quality headphone/IEM EQ presets from the AutoEQ database.

**Usage:**
```bash
npm run import:autoeq
```

**What it does:**
1. Clones the AutoEQ repository (temporarily, deleted after import)
2. Parses `results/README.md` to find referenced devices
3. Converts `ParametricEQ.txt` files to the canonical EQ preset format
4. Writes deterministic JSON presets to `server/data/configs/autoeq/<category>/`
5. Cleans up the temporary clone

**Output structure:**
- `server/data/configs/autoeq/headphones/<Manufacturer> <Model>.json`
- `server/data/configs/autoeq/iems/<Manufacturer> <Model>.json`
- `server/data/configs/autoeq/speakers/<Manufacturer> <Model>.json`

**Important:**
- The AutoEQ library will take ~25-30 MB of disk space
- The AutoEQ repo is **not** committed to this project
- Generated presets are committed and served as read-only
- Re-running the script is idempotent (produces identical output)

---

## Build CamillaDSP Spectrum YAML
This script builds out a log-spaced bandpass filter bank yaml for CamillaDSP which is then used as the source for the spectrum analyzer. It's the poor man's hack to approximate a visual aid for the Graphical Equalizer resembling a FFT.

### Usage
```bash
node build-camillaDSP-spectrum-yml.js [options]
```

### Options
- `--bins <int>` - Number of spectrum bins (default: 256)
- `--q <number>` - Q factor for bandpass filters (default: 18)
- `--out <filename>` - Output filename (default: spectrum-<bins>.yml)
- `--help`, `-h` - Show help message

### Examples
```bash
# Default: 256 bins, Q=18, writes spectrum-256.yml
node build-camillaDSP-spectrum-yml.js

# Custom: 128 bins with Q=12 for smoother display
node build-camillaDSP-spectrum-yml.js --bins 128 --q 12

# Custom output filename
node build-camillaDSP-spectrum-yml.js --bins 256 --q 16 --out my-spectrum.yml
```

### Q Value Recommendations
The Q parameter controls the bandwidth of each bandpass filter:
- **Q = 12** - Smoothest, best for general room EQ / tonal balance work
- **Q = 16** - Good compromise between detail and smoothness
- **Q = 18** - Default, more detail but may appear "busy" without UI smoothing

Lower Q values produce a more stable, easier-to-read spectrum display at the cost of frequency resolution.

### Post-Generation Setup
After generating the config file, you'll need to:
1. Edit the `devices:` section to match your CamillaDSP audio setup
2. Load the config on CamillaDSP's spectrum port (typically different from the control port)
3. The client will auto-detect the number of bins when connecting

____

## Device Configuration Wizard

An interactive CLI wizard that helps you create a valid CamillaDSP configuration file with properly configured audio devices for your platform.

### Supported Platforms

- **macOS**: CoreAudio backend
- **Linux**: ALSA backend

## Features

- 🔍 **Auto-discovery** of audio devices on your system
- 🔬 **Hardware probing** (Linux/ALSA) to detect valid sample rates, formats, and channel counts
- 📋 **Interactive menus** with arrow-key navigation and search
- ✅ **Automatic validation** using `camilladsp --check`
- 🎯 **Smart defaults** based on your sample rate and hardware capabilities

### Usage
```bash
node camilladsp-device-wizard.mjs
```

### Command Line Options

```bash
node camilladsp-device-wizard.mjs [options]

Options:
  --output <path>       Output file path (default: ./camilladsp.yml)
  --camilladsp <path>   Path to camilladsp binary (default: camilladsp)
  --no-probe            Skip ALSA hardware probing (Linux only)
```

### Examples

Generate config in a specific location:
```bash
node tools/camilladsp-device-wizard.mjs --output ~/config/my-dsp.yml
```

Use a custom CamillaDSP binary path:
```bash
node tools/camilladsp-device-wizard.mjs --camilladsp /usr/local/bin/camilladsp
```

Skip hardware probing on Linux:
```bash
node tools/camilladsp-device-wizard.mjs --no-probe
```

### Post-Generation Setup
After generating the config file, you'll need to oad the config onto a CamillaDSP instance.
