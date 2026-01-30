/**
 * Spectrum Analyzer - MVP-16
 * Implements STA/LTA averaging and Peak Hold in dB domain
 * All operations are O(N) per frame
 */

export interface AnalyzerState {
  liveDb: number[];
  staDb: number[] | null;
  ltaDb: number[] | null;
  peakDb: number[] | null;
  peakLastHitMs: number[] | null;
  lastUpdateMs: number;
  initialized: boolean;
}

export interface AnalyzerConfig {
  tauShort: number;  // STA time constant (seconds), default 0.8
  tauLong: number;   // LTA time constant (seconds), default 8.0
  holdTimeMs: number; // Peak hold time (milliseconds), default 2000
  decayRateDbPerSec: number; // Peak decay rate (dB/s), default 12
}

const DEFAULT_CONFIG: AnalyzerConfig = {
  tauShort: 0.8,
  tauLong: 8.0,
  holdTimeMs: 2000,
  decayRateDbPerSec: 12,
};

export class SpectrumAnalyzer {
  private state: AnalyzerState;
  private config: AnalyzerConfig;

  constructor(config: Partial<AnalyzerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      liveDb: [],
      staDb: null,
      ltaDb: null,
      peakDb: null,
      peakLastHitMs: null,
      lastUpdateMs: 0,
      initialized: false,
    };
  }

  /**
   * Update analyzer with new spectrum frame
   * @param liveDbFrame - Spectrum data in dB (length N)
   * @param nowMs - Current timestamp in milliseconds
   */
  update(liveDbFrame: number[], nowMs: number): void {
    const numBins = liveDbFrame.length;

    // First frame: initialize
    if (!this.state.initialized) {
      this.state.liveDb = [...liveDbFrame];
      this.state.staDb = [...liveDbFrame];
      this.state.ltaDb = [...liveDbFrame];
      this.state.peakDb = [...liveDbFrame];
      this.state.peakLastHitMs = Array(numBins).fill(nowMs);
      this.state.lastUpdateMs = nowMs;
      this.state.initialized = true;
      return;
    }

    // Calculate dt and clamp to prevent stale-frame jumps
    let dtMs = nowMs - this.state.lastUpdateMs;
    dtMs = Math.max(0, Math.min(150, dtMs)); // Clamp to 150ms max per spec
    const dtSec = dtMs / 1000;

    // Update live
    this.state.liveDb = [...liveDbFrame];

    // Update STA (short-term average) - EMA in dB domain
    const alphaShort = Math.exp(-dtSec / this.config.tauShort);
    for (let i = 0; i < numBins; i++) {
      this.state.staDb![i] = alphaShort * this.state.staDb![i] + (1 - alphaShort) * liveDbFrame[i];
    }

    // Update LTA (long-term average) - EMA in dB domain
    const alphaLong = Math.exp(-dtSec / this.config.tauLong);
    for (let i = 0; i < numBins; i++) {
      this.state.ltaDb![i] = alphaLong * this.state.ltaDb![i] + (1 - alphaLong) * liveDbFrame[i];
    }

    // Update Peak Hold - per-bin max with hold and decay
    for (let i = 0; i < numBins; i++) {
      const currentPeak = this.state.peakDb![i];
      const liveVal = liveDbFrame[i];

      if (liveVal >= currentPeak) {
        // New peak hit
        this.state.peakDb![i] = liveVal;
        this.state.peakLastHitMs![i] = nowMs;
      } else {
        // Check if still in hold time
        const timeSinceHit = nowMs - this.state.peakLastHitMs![i];
        
        if (timeSinceHit > this.config.holdTimeMs) {
          // Hold time expired - apply decay
          const decayDb = this.config.decayRateDbPerSec * dtSec;
          const decayedPeak = currentPeak - decayDb;
          
          // Peak can't go below live value
          this.state.peakDb![i] = Math.max(liveVal, decayedPeak);
        }
        // else: still holding, keep current peak
      }
    }

    this.state.lastUpdateMs = nowMs;
  }

  /**
   * Reset averages to current live frame
   */
  resetAverages(): void {
    if (this.state.initialized) {
      this.state.staDb = [...this.state.liveDb];
      this.state.ltaDb = [...this.state.liveDb];
      // Note: Peak hold is NOT reset (per spec)
    }
  }

  /**
   * Get current analyzer state (read-only)
   */
  getState(): Readonly<AnalyzerState> {
    return this.state;
  }

  /**
   * Update analyzer configuration
   */
  updateConfig(config: Partial<AnalyzerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<AnalyzerConfig> {
    return this.config;
  }
}
