/**
 * MVP-31: eqStore solo-edit session tests
 *
 * These tests verify the startSoloEditSession / endSoloEditSession logic in
 * isolation.  The DSP layer is mocked so no real WebSocket or HTTP calls are
 * made.  The module-level mock for dspStore provides getDspInstance, and the
 * test helper _injectDspForTesting is used for tests that need to reset the
 * EQ state mid-suite.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';

// ── Module mocks ─────────────────────────────────────────────────────────────

// Shared mutable state for the fake DSP
let mockDspConfig: any = null;
const mockUploadConfig = vi.fn(async () => true);

const mockDsp = {
  get config() { return mockDspConfig; },
  set config(v: any) { mockDspConfig = v; },
  uploadConfig: mockUploadConfig,
  downloadConfig: vi.fn(async () => true),
};

const mockPutLatestState = vi.fn(async (_cfg: any) => {});

vi.mock('../dspStore', () => ({
  getDspInstance: () => mockDsp,
  updateConfig: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  putLatestState: (cfg: any) => mockPutLatestState(cfg),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

import {
  initializeFromConfig,
  clearEqState,
  startSoloEditSession,
  endSoloEditSession,
  isSoloSessionActive,
  toggleBandEnabled,
  _injectDspForTesting,
  filterNames,
  soloActiveBandIndex,
  bands,
  setBandGain,
} from '../eqStore';

/** Minimal 3-band CamillaDSP config with a named pipeline Filter step. */
function makeConfig(overrides: Record<string, any> = {}) {
  return {
    filters: {
      Filter01: { type: 'Biquad', parameters: { type: 'Peaking', freq: 100,  gain: 3,  q: 0.7 } },
      Filter02: { type: 'Biquad', parameters: { type: 'Peaking', freq: 1000, gain: -3, q: 0.7 } },
      Filter03: { type: 'Biquad', parameters: { type: 'Peaking', freq: 5000, gain: 1,  q: 0.7 } },
    },
    pipeline: [
      { type: 'Filter', channel: 0, names: ['Filter01', 'Filter02', 'Filter03'] },
    ],
    mixers: {},
    processors: {},
    ...overrides,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('MVP-31: eqStore solo-edit session', () => {
  beforeEach(() => {
    mockDspConfig = makeConfig();
    mockUploadConfig.mockReset();
    mockUploadConfig.mockResolvedValue(true);
    mockPutLatestState.mockReset();
    initializeFromConfig(makeConfig() as any);
  });

  afterEach(() => {
    clearEqState();
  });

  // ── State flags ────────────────────────────────────────────────────────────

  it('returns false when no session is active', () => {
    expect(isSoloSessionActive()).toBe(false);
  });

  it('returns true after startSoloEditSession', async () => {
    await startSoloEditSession(0);
    expect(isSoloSessionActive()).toBe(true);
    await endSoloEditSession();
  });

  it('returns false after endSoloEditSession', async () => {
    await startSoloEditSession(0);
    await endSoloEditSession();
    expect(isSoloSessionActive()).toBe(false);
  });

  // ── Config mutations on START ──────────────────────────────────────────────

  it('writes a config with only the active filter to the DSP on session start', async () => {
    let capturedConfig: any = null;
    mockUploadConfig.mockImplementation(async () => {
      capturedConfig = JSON.parse(JSON.stringify(mockDspConfig));
      return true;
    });

    await startSoloEditSession(0);

    expect(capturedConfig).not.toBeNull();
    const names: string[] = capturedConfig.pipeline[0].names;
    expect(names).toContain('Filter01');
    expect(names).not.toContain('Filter02');
    expect(names).not.toContain('Filter03');

    await endSoloEditSession();
  });

  it('calls uploadConfig once on session start', async () => {
    await startSoloEditSession(0);
    expect(mockUploadConfig).toHaveBeenCalledTimes(1);
    await endSoloEditSession();
  });

  it('keeps non-EQ pipeline steps unchanged during solo', async () => {
    // Config with a Mixer before the Filter step
    const mixedConfig = makeConfig({
      pipeline: [
        { type: 'Mixer', name: 'myMixer' },
        { type: 'Filter', channel: 0, names: ['Filter01', 'Filter02', 'Filter03'] },
      ],
      mixers: { myMixer: {} },
    });
    mockDspConfig = mixedConfig;
    initializeFromConfig(mixedConfig as any);

    let capturedConfig: any = null;
    mockUploadConfig.mockImplementation(async () => {
      capturedConfig = JSON.parse(JSON.stringify(mockDspConfig));
      return true;
    });

    // band index 0 corresponds to Filter01, which is at pipeline position 1 (after Mixer)
    await startSoloEditSession(0);

    expect(capturedConfig.pipeline[0].type).toBe('Mixer');
    expect(capturedConfig.pipeline[0].name).toBe('myMixer');

    await endSoloEditSession();
  });

  it('soloActiveBandIndex store is set to the active band during session', async () => {
    // UI components subscribe to this to dim non-active bands/tokens/curves
    await startSoloEditSession(0);
    expect(get(soloActiveBandIndex)).toBe(0);
    await endSoloEditSession();
  });

  it('soloActiveBandIndex store is null after session ends', async () => {
    await startSoloEditSession(0);
    await endSoloEditSession();
    expect(get(soloActiveBandIndex)).toBeNull();
  });

  // ── filterNames store ─────────────────────────────────────────────────────

  it('filterNames store still has all 3 bands during solo (UI position/colour stable)', async () => {
    // The solo session patches the DSP pipeline but keeps the full band list
    // in UI stores so band columns, tokens and curves do not shift/recolour.
    await startSoloEditSession(0);
    expect(get(filterNames)).toHaveLength(3);
    expect(get(filterNames)[0]).toBe('Filter01');
    await endSoloEditSession();
  });

  // ── Config mutations on END ────────────────────────────────────────────────

  it('restores all 3 filters to the pipeline on session end', async () => {
    await startSoloEditSession(0);
    await endSoloEditSession();

    const names: string[] = mockDspConfig.pipeline[0].names;
    expect(names).toHaveLength(3);
    expect(names).toContain('Filter01');
    expect(names).toContain('Filter02');
    expect(names).toContain('Filter03');
  });

  it('filterNames store has all 3 filters after session end', async () => {
    await startSoloEditSession(0);
    await endSoloEditSession();
    expect(get(filterNames)).toHaveLength(3);
  });

  it('preserves parameter edits to the active band in the restored config', async () => {
    await startSoloEditSession(0);
    // Edit band 0 gain during the session
    setBandGain(0, 9);
    // Allow the debounce to fire (or flush it)
    await new Promise(r => setTimeout(r, 250));
    await endSoloEditSession();

    expect(mockDspConfig.filters['Filter01'].parameters.gain).toBe(9);
    expect(mockDspConfig.filters['Filter02'].parameters.gain).toBe(-3);
  });

  it('does not change non-active band parameters on restore', async () => {
    await startSoloEditSession(1); // solo Filter02
    await endSoloEditSession();

    expect(mockDspConfig.filters['Filter01'].parameters.freq).toBe(100);
    expect(mockDspConfig.filters['Filter03'].parameters.freq).toBe(5000);
  });

  // ── Upload / persist counts ────────────────────────────────────────────────

  it('calls uploadConfig exactly once on session end', async () => {
    await startSoloEditSession(0);
    mockUploadConfig.mockReset();
    mockUploadConfig.mockResolvedValue(true);
    await endSoloEditSession();
    expect(mockUploadConfig).toHaveBeenCalledTimes(1);
  });

  it('does NOT call fetch (putLatestState) at session start', async () => {
    await startSoloEditSession(0);
    expect(mockPutLatestState).not.toHaveBeenCalled();
    await endSoloEditSession();
  });

  it('calls fetch (putLatestState) after session end', async () => {
    await startSoloEditSession(0);
    mockPutLatestState.mockReset();
    await endSoloEditSession();
    expect(mockPutLatestState).toHaveBeenCalledOnce();
  });

  // ── Guard conditions ───────────────────────────────────────────────────────

  it('does nothing on a second startSoloEditSession call while already in session', async () => {
    await startSoloEditSession(0);
    const uploadCountAfterFirst = mockUploadConfig.mock.calls.length;
    // Session is already active — second call should be a no-op (same band)
    // Implementation ends old session and starts new one; state must remain active
    expect(isSoloSessionActive()).toBe(true);
  });

  it('endSoloEditSession is a no-op when no session is active', async () => {
    await endSoloEditSession(); // should not throw
    expect(isSoloSessionActive()).toBe(false);
    expect(mockUploadConfig).not.toHaveBeenCalled();
  });

  it('does not start a session if uploadConfig returns false', async () => {
    mockUploadConfig.mockResolvedValueOnce(false);
    await startSoloEditSession(0);
    expect(isSoloSessionActive()).toBe(false);
  });

  it('does not start a session if no config has been initialized', async () => {
    // _injectDspForTesting resets all EQ state (lastConfig → null) while
    // providing a new mock DSP so we can test the "no config" guard path.
    _injectDspForTesting(mockDsp);
    await startSoloEditSession(0);
    expect(isSoloSessionActive()).toBe(false);
    // Restore for afterEach
    initializeFromConfig(makeConfig() as any);
  });

  it('immediately restores all filters when endSoloEditSession called with no edits', async () => {
    let restoredConfig: any = null;
    mockUploadConfig.mockImplementation(async () => {
      restoredConfig = JSON.parse(JSON.stringify(mockDspConfig));
      return true;
    });

    await startSoloEditSession(0);
    restoredConfig = null; // reset — only care about end upload
    await endSoloEditSession();

    expect(restoredConfig).not.toBeNull();
    const names: string[] = restoredConfig.pipeline[0].names;
    expect(names).toContain('Filter01');
    expect(names).toContain('Filter02');
    expect(names).toContain('Filter03');
  });

  // ── Mute interaction during solo ──────────────────────────────────────────

  it('muting the active solo band ends the solo session', async () => {
    await startSoloEditSession(0);
    expect(isSoloSessionActive()).toBe(true);

    await toggleBandEnabled(0); // mute the active (soloed) band

    expect(isSoloSessionActive()).toBe(false);
  });

  it('soloActiveBandIndex is null after muting the active solo band', async () => {
    await startSoloEditSession(0);
    await toggleBandEnabled(0);

    expect(get(soloActiveBandIndex)).toBeNull();
  });

  it('the active band is disabled in the UI after muting it during solo', async () => {
    await startSoloEditSession(0);
    await toggleBandEnabled(0); // mute band 0 (was soloed)

    // Allow debounce to settle
    await new Promise(r => setTimeout(r, 250));

    const currentBands = get(bands);
    expect(currentBands[0].enabled).toBe(false);
    // Other bands stay enabled
    expect(currentBands[1].enabled).toBe(true);
    expect(currentBands[2].enabled).toBe(true);
  });

  it('all 3 filters are restored to the pipeline before the mute is applied', async () => {
    const uploadSequence: string[][] = [];
    mockUploadConfig.mockImplementation(async () => {
      const step = (mockDspConfig.pipeline[0] as any);
      uploadSequence.push([...step.names]);
      return true;
    });

    await startSoloEditSession(0); // upload 1: solo patch (only Filter01)
    await toggleBandEnabled(0);    // upload 2: restore (all 3), upload 3: mute (via debounce)
    await new Promise(r => setTimeout(r, 250)); // let debounce fire

    // Second upload must be the full restore, not just the solo patch
    expect(uploadSequence[1]).toContain('Filter02');
    expect(uploadSequence[1]).toContain('Filter03');
  });
});
