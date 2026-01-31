import fs from "node:fs";

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    bins: 256,
    q: 18,
    out: null,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--bins' && i + 1 < args.length) {
      options.bins = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--q' && i + 1 < args.length) {
      options.q = parseFloat(args[i + 1]);
      i++;
    } else if (args[i] === '--out' && i + 1 < args.length) {
      options.out = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage: node build-camillaDSP-spectrum-yml.js [options]

Options:
  --bins <int>      Number of spectrum bins (default: 256)
  --q <number>      Q factor for bandpass filters (default: 18)
  --out <filename>  Output filename (default: spectrum-<bins>.yml)
  --help, -h        Show this help message

Examples:
  node build-camillaDSP-spectrum-yml.js
  node build-camillaDSP-spectrum-yml.js --bins 128 --q 12
  node build-camillaDSP-spectrum-yml.js --bins 256 --q 16 --out my-spectrum.yml
`);
      process.exit(0);
    }
  }

  // Validate
  if (isNaN(options.bins) || options.bins < 1) {
    console.error('Error: --bins must be a positive integer');
    process.exit(1);
  }
  if (isNaN(options.q) || options.q <= 0) {
    console.error('Error: --q must be a positive number');
    process.exit(1);
  }

  // Default output filename
  if (!options.out) {
    options.out = `spectrum-${options.bins}.yml`;
  }

  return options;
}

const options = parseArgs();
const N = options.bins;
const fMin = 20;
const fMax = 20000;
const Q = options.q;

const ratio = Math.pow(fMax / fMin, 1 / (N - 1));
const freqs = Array.from({ length: N }, (_, i) => fMin * Math.pow(ratio, i));

function y(v, indent = 0) {
  return " ".repeat(indent) + v;
}

let out = [];
out.push("devices:");
out.push(y("samplerate: 48000", 2));
out.push(y("chunksize: 2048", 2));
out.push(y("enable_rate_adjust: true", 2));
out.push(y("playback:", 2));
out.push(y("type: File", 4));
out.push(y('filename: "/dev/null"', 4));
out.push(y(`channels: ${N}`, 4));
out.push(y("format: S32LE", 4));
out.push(y("capture:", 2));
out.push(y("type: ALSA", 4));
out.push(y('device: "gadget"', 4)); // <- keep your existing capture device name
out.push(y("channels: 2", 4));
out.push(y("format: S32LE", 4));
out.push("");

out.push("filters:");
freqs.forEach((f, i) => {
  out.push(y(`band_${i}:`, 2));
  out.push(y("type: Biquad", 4));
  out.push(y("parameters:", 4));
  out.push(y("type: Bandpass", 6));
  out.push(y(`freq: ${Number(f.toFixed(3))}`, 6));
  out.push(y(`q: ${Q}`, 6));
});
out.push("");

out.push("mixers:");
out.push(y("monobins:", 2));
out.push(y("channels:", 4));
out.push(y("in: 2", 6));
out.push(y(`out: ${N}`, 6));
out.push(y("mapping:", 4));
for (let i = 0; i < N; i++) {
  out.push(y(`- dest: ${i}`, 6));
  out.push(y("sources:", 8));
  out.push(y("- channel: 0", 10));
  out.push(y("gain: -6.0", 12));
  out.push(y("- channel: 1", 10));
  out.push(y("gain: -6.0", 12));
}
out.push("");

out.push("pipeline:");
out.push(y("- type: Mixer", 2));
out.push(y("name: monobins", 4));
for (let i = 0; i < N; i++) {
  out.push(y("- type: Filter", 2));
  out.push(y(`channels: [${i}]`, 4));
  out.push(y("names:", 4));
  out.push(y(`- band_${i}`, 6));
}

fs.writeFileSync(options.out, out.join("\n"));
console.log(`Wrote ${options.out} (${N} bins, Q=${Q})`);
