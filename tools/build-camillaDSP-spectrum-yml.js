import fs from "node:fs";

const N = 256;
const fMin = 20;
const fMax = 20000;
const Q = 18;

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

fs.writeFileSync("spectrum-256.yml", out.join("\n"));
console.log("Wrote spectrum-256.yml");
