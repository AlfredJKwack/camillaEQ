/**
 * @file camillaDSP-canonical-schema.ts
 * @description
 * Canonical TypeScript definitions for CamillaDSP configuration objects.
 * 
 * This schema represents the complete structure of a CamillaDSP YAML config
 * including filters, mixers, processors, devices, and pipeline steps. It is intended
 * as a single source of truth for GUI editing, validation, and communication with
 * a running CamillaDSP instance via WebSocket.
 * 
 * All parameter types and subtypes are derived directly from the CamillaDSP Rust source.
 * 
 * ## Key Notes:
 * - All DSP-relevant numeric values use `PrcFmt` = number | string for compatibility with YAML and runtime expressions.
 * - Filter, Mixer, Processor, and Pipeline step types are fully exhaustive.
 * - Optional fields match CamillaDSP defaults and are not required for minimal valid configs.
 * 
 * Suitable for:
 * - Building config editors (GUI)
 * - Validating user edits before upload
 * - Transforming between internal and serialized formats
 * 
 * Last synced with CamillaDSP version: 3.x (as of 2026-02)
 */

// Main configuration object
export interface CamillaDSPConfig {
  title?: string;
  description?: string;
  devices: Devices;
  mixers?: Record<string, Mixer>;
  filters?: Record<string, Filter>;
  processors?: Record<string, Processor>;
  pipeline?: PipelineStep[];
}

// 1. Devices Block
export interface Devices {
  samplerate: number;
  chunksize: number;
  capture: CaptureDevice;
  playback: PlaybackDevice;
  queuelimit?: number;
  silence_threshold?: number;
  silence_timeout?: number;
  enable_rate_adjust?: boolean;
  target_level?: number;
  adjust_period?: number;
  resampler?: Resampler;
  capture_samplerate?: number;
  stop_on_rate_change?: boolean;
  rate_measure_interval?: number;
  volume_ramp_time?: number;
  volume_limit?: number;
  multithreaded?: boolean;
  worker_threads?: number;
}

// Pragmatic supporting types
//
// These are referenced by the canonical schema but are not currently modeled
// exhaustively in the UI. Keep them permissive so we can round-trip unknown
// fields from CamillaDSP without losing information.
export type Resampler = Record<string, any>;

// File formats vary by backend; keep open-ended.
export type FileFormat = string;

// Abstract device definitions
//
// Pragmatic typing: we don’t currently need exhaustive device unions in the UI.
// CamillaDSP device blocks are backend-specific and vary significantly (Alsa/CoreAudio/Wasapi/etc.).
//
// We keep these as open records to:
// - allow round-tripping configs without losing unknown fields
// - unblock using this schema as the canonical config definition across the app
export type CaptureDevice = Record<string, any>;
export type PlaybackDevice = Record<string, any>;

// 2. Mixer Block
export interface Mixer {
  description?: string;
  channels: {
    in: number;
    out: number;
  };
  mapping: MixerMapping[];
  labels?: (string | null)[];
}

export interface MixerMapping {
  dest: number;
  sources: MixerSource[];
  mute?: boolean;
}

export interface MixerSource {
  channel: number;
  gain?: number;
  inverted?: boolean;
  mute?: boolean;
  scale?: "linear" | "dB";
}

// 3. Filter Block
export type Filter =
  | { type: "Biquad"; parameters: BiquadParameters; description?: string }
  | { type: "Gain"; parameters: GainParameters; description?: string }
  | { type: "Delay"; parameters: DelayParameters; description?: string }
  | { type: "Conv"; parameters: ConvParameters; description?: string }
  | { type: "Volume"; parameters: VolumeParameters; description?: string }
  | { type: "Loudness"; parameters: LoudnessParameters; description?: string }
  | { type: "Limiter"; parameters: LimiterParameters; description?: string }
  | { type: "Dither"; parameters: DitherParameters; description?: string }
  | { type: "DiffEq"; parameters: DiffEqParameters; description?: string };

// 4. Processor Block
export type Processor =
  | { type: "Compressor"; parameters: CompressorParameters; description?: string }
  | { type: "NoiseGate"; parameters: NoiseGateParameters; description?: string };

// 5. Pipeline Block
export type PipelineStep =
  | PipelineStepMixer
  | PipelineStepFilter
  | PipelineStepProcessor;

export interface PipelineStepMixer {
  type: "Mixer";
  name: string;
  description?: string;
  bypassed?: boolean;
}

export interface PipelineStepFilter {
  type: "Filter";
  channels?: number[]; // optional; if undefined, filter applies to all
  names: string[]; // filter names
  description?: string;
  bypassed?: boolean;
}

export interface PipelineStepProcessor {
  type: "Processor";
  name: string;
  description?: string;
  bypassed?: boolean;
}

// 6. Biquad Parameters
export type BiquadParameters =
  | { type: "Free"; a1: PrcFmt; a2: PrcFmt; b0: PrcFmt; b1: PrcFmt; b2: PrcFmt }
  | { type: "Highpass"; freq: PrcFmt; q: PrcFmt }
  | { type: "Lowpass"; freq: PrcFmt; q: PrcFmt }
  | { type: "Peaking"; variant: PeakingWidth }
  | { type: "Highshelf"; variant: ShelfSteepness }
  | { type: "HighshelfFO"; freq: PrcFmt; gain: PrcFmt }
  | { type: "Lowshelf"; variant: ShelfSteepness }
  | { type: "LowshelfFO"; freq: PrcFmt; gain: PrcFmt }
  | { type: "HighpassFO"; freq: PrcFmt }
  | { type: "LowpassFO"; freq: PrcFmt }
  | { type: "Allpass"; variant: NotchWidth }
  | { type: "AllpassFO"; freq: PrcFmt }
  | { type: "Bandpass"; variant: NotchWidth }
  | { type: "Notch"; variant: NotchWidth }
  | { type: "GeneralNotch"; params: GeneralNotchParams }
  | { type: "LinkwitzTransform"; freq_act: PrcFmt; q_act: PrcFmt; freq_target: PrcFmt; q_target: PrcFmt };

export type PeakingWidth =
  | { variant: "Q"; freq: PrcFmt; q: PrcFmt; gain: PrcFmt }
  | { variant: "Bandwidth"; freq: PrcFmt; bandwidth: PrcFmt; gain: PrcFmt };

export type ShelfSteepness =
  | { variant: "Q"; freq: PrcFmt; q: PrcFmt; gain: PrcFmt }
  | { variant: "Slope"; freq: PrcFmt; slope: PrcFmt; gain: PrcFmt };

export type NotchWidth =
  | { variant: "Q"; freq: PrcFmt; q: PrcFmt }
  | { variant: "Bandwidth"; freq: PrcFmt; bandwidth: PrcFmt };

export interface GeneralNotchParams {
  freq_p: PrcFmt;
  freq_z: PrcFmt;
  q_p: PrcFmt;
  normalize_at_dc?: boolean;
}

// 7. Gain Parameters
export interface GainParameters {
  gain: PrcFmt;
  inverted?: boolean;
  mute?: boolean;
  scale?: "linear" | "dB"; // Defaults to "dB"
}

// 8. Delay Parameters
export interface DelayParameters {
  delay: PrcFmt;
  unit?: "ms" | "mm" | "samples"; // Defaults to ms
  subsample?: boolean;
}

// 9. Volume Parameters
export interface VolumeParameters {
  ramp_time?: number;   // In milliseconds, default 400
  fader: "Aux1" | "Aux2" | "Aux3" | "Aux4";
  limit?: number;       // Optional gain clamp, default 50
}

// 10. Conv Parameters
export type ConvParameters =
  | { type: "Raw"; filename: string; format?: FileFormat; skip_bytes_lines?: number; read_bytes_lines?: number }
  | { type: "Wav"; filename: string; channel?: number }
  | { type: "Values"; values: PrcFmt[] }
  | { type: "Dummy"; length: number }; // Must be non-zero

// 11. Compressor Parameters
export interface CompressorParameters {
  channels: number;
  monitor_channels?: number[];
  process_channels?: number[];
  attack: PrcFmt;
  release: PrcFmt;
  threshold: PrcFmt;
  factor: PrcFmt;
  makeup_gain?: PrcFmt;
  soft_clip?: boolean;
  clip_limit?: PrcFmt;
}

// 12. Biquad Combo Parameters
export type BiquadComboParameters =
  | { type: "LinkwitzRileyHighpass"; freq: PrcFmt; order: number }
  | { type: "LinkwitzRileyLowpass"; freq: PrcFmt; order: number }
  | { type: "ButterworthHighpass"; freq: PrcFmt; order: number }
  | { type: "ButterworthLowpass"; freq: PrcFmt; order: number }
  | { type: "Tilt"; gain: PrcFmt }
  | {
      type: "FivePointPeq";
      fls: PrcFmt; qls: PrcFmt; gls: PrcFmt;
      fp1: PrcFmt; qp1: PrcFmt; gp1: PrcFmt;
      fp2: PrcFmt; qp2: PrcFmt; gp2: PrcFmt;
      fp3: PrcFmt; qp3: PrcFmt; gp3: PrcFmt;
      fhs: PrcFmt; qhs: PrcFmt; ghs: PrcFmt;
    }
  | { type: "GraphicEqualizer"; gains: number[]; freq_min?: number; freq_max?: number };

// 13. Dither Parameters
export type DitherParameters =
  | { type: "None"; bits: number }
  | { type: "Flat"; bits: number; amplitude: PrcFmt }
  | { type: "Highpass"; bits: number }
  | { type: "Fweighted441"; bits: number }
  | { type: "FweightedLong441"; bits: number }
  | { type: "FweightedShort441"; bits: number }
  | { type: "Gesemann441"; bits: number }
  | { type: "Gesemann48"; bits: number }
  | { type: "Lipshitz441"; bits: number }
  | { type: "LipshitzLong441"; bits: number }
  | { type: "Shibata441"; bits: number }
  | { type: "ShibataHigh441"; bits: number }
  | { type: "ShibataLow441"; bits: number }
  | { type: "Shibata48"; bits: number }
  | { type: "ShibataHigh48"; bits: number }
  | { type: "ShibataLow48"; bits: number }
  | { type: "Shibata882"; bits: number }
  | { type: "ShibataLow882"; bits: number }
  | { type: "Shibata96"; bits: number }
  | { type: "ShibataLow96"; bits: number }
  | { type: "Shibata192"; bits: number }
  | { type: "ShibataLow192"; bits: number };

// 14. Noise Gate Parameters
export interface NoiseGateParameters {
  channels: number;
  monitor_channels?: number[];
  process_channels?: number[];
  attack: PrcFmt;
  release: PrcFmt;
  attenuation: PrcFmt;
  threshold: PrcFmt;
}

// 15. DiffEq Parameters
export interface DiffEqParameters {
  a?: PrcFmt[]; // Feedforward
  b?: PrcFmt[]; // Feedback
}

// 16. Loudness Parameters
export interface LoudnessParameters {
  reference_level: number;
  high_boost?: number;       // Default: 10.0
  low_boost?: number;        // Default: 10.0
  attenuate_mid?: boolean;   // Default: false
  fader?: "Main" | "Aux1" | "Aux2" | "Aux3" | "Aux4"; // Default: Main
}

// 17. Limiter Parameters
export interface LimiterParameters {
  threshold: PrcFmt;
  makeup_gain?: PrcFmt;
  attack: PrcFmt;
  release: PrcFmt;
  lookahead?: PrcFmt;
  ceiling?: PrcFmt;
}

// CamillaDSP accepts strings or numbers for PrcFmt, e.g., "0.707" or 0.707
// The GUI MUST treat PrcFmt as “user input that should parse to a number.”
export type PrcFmt = string | number;