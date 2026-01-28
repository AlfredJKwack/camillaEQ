# Tools

## Build CamillaDSP Spectrum YAML
This script builds out a 256 bandpass filter (log-spaced) yaml for CamillaDSP which is then used as the source for the spectrum analyzer. It's the poor man's hack to approximate a visual aid for the Graphical Equalizer resembling a FFT.

Run the below
```bash
node build-camillaDSP-spectrum-yml.js
```
and it will create a file `spectrum-256.yml`. You'll still have to change the `devices:` portion to fit your actual CamillaDSP setup. 