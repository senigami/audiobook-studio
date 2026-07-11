/**
 * WaveformTape.test.tsx
 *
 * Tests for frontend/src/app/layout/WaveformTape.tsx — the ported tape
 * renderer (audio-player.md 1.6.0 §5.2/§5.3). Task 006.
 *
 * Mocks (R2 — boundaries outside the unit): `fetch` + `AudioContext` (Web
 * Audio decode, external browser API), `window.matchMedia` (external OS
 * API), `playerBus.seek` (the bus is a separate module the tape calls
 * through — the tape itself, and its fixed-grid math, are the unit under
 * test and are never mocked).
 */
import React, { useEffect } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  WaveformTape,
  usePeaks,
  PEAKS_COUNT,
  snapZoom,
  computeTapeBarCount,
} from '@/app/layout/WaveformTape';
import * as playerBus from '@/store/playerBus';

// ---------------------------------------------------------------------------
// AudioContext mock — boundary mock (external Web Audio decode API)
// ---------------------------------------------------------------------------

function makeMockAudioBuffer(samples: number[], channels = 1): AudioBuffer {
  return {
    numberOfChannels: channels,
    length: samples.length,
    sampleRate: 44100,
    duration: samples.length / 44100,
    getChannelData: () => Float32Array.from(samples),
  } as unknown as AudioBuffer;
}

let decodeAudioDataMock: ReturnType<typeof vi.fn>;
let mockAudioContextCtor: ReturnType<typeof vi.fn>;

function installAudioContextMock(audioBuffer: AudioBuffer | null, shouldReject = false) {
  decodeAudioDataMock = vi.fn().mockImplementation(() => {
    if (shouldReject) return Promise.reject(new Error('decode failed'));
    return Promise.resolve(audioBuffer);
  });
  mockAudioContextCtor = vi.fn().mockImplementation(() => ({
    decodeAudioData: decodeAudioDataMock,
    close: vi.fn(),
  }));
  vi.stubGlobal('AudioContext', mockAudioContextCtor);
}

const originalMatchMedia = window.matchMedia;

function mockMatchMedia(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function makeAudioEl(): HTMLAudioElement {
  const el = document.createElement('audio');
  Object.defineProperty(el, 'currentTime', { writable: true, value: 0 });
  return el;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMatchMedia(false);
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  });
  vi.spyOn(playerBus, 'seek').mockImplementation(() => {});
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// usePeaks
// ---------------------------------------------------------------------------

describe('usePeaks', () => {
  it('decodes via AudioContext and downsamples to PEAKS_COUNT buckets', async () => {
    const samples = new Array(10000).fill(0).map((_, i) => (i % 2 === 0 ? 0.8 : -0.8));
    installAudioContextMock(makeMockAudioBuffer(samples));

    const captured: { current: number[] | null } = { current: null };
    const Harness: React.FC = () => {
      const peaks = usePeaks('https://example.com/a.mp3', makeAudioEl());
      useEffect(() => {
        captured.current = peaks;
      }, [peaks]);
      return null;
    };
    render(<Harness />);

    await waitFor(() => expect(captured.current).not.toBeNull());
    expect(captured.current).toHaveLength(PEAKS_COUNT);
    expect(captured.current![0]).toBeCloseTo(0.8, 5);
  });

  it('returns an empty array on decode error (never throws)', async () => {
    installAudioContextMock(null, true);

    const captured: { current: number[] | null } = { current: null };
    const Harness: React.FC = () => {
      const peaks = usePeaks('https://example.com/bad.mp3', makeAudioEl());
      useEffect(() => {
        captured.current = peaks;
      }, [peaks]);
      return null;
    };
    render(<Harness />);

    await waitFor(() => expect(captured.current).toEqual([]));
  });

  it('never creates an <audio> element or MediaElementSourceNode', async () => {
    const samples = new Array(1000).fill(0.5);
    installAudioContextMock(makeMockAudioBuffer(samples));

    const createMediaElementSource = vi.fn();
    mockAudioContextCtor.mockImplementation(() => ({
      decodeAudioData: decodeAudioDataMock,
      close: vi.fn(),
      createMediaElementSource,
    }));

    const Harness: React.FC = () => {
      usePeaks('https://example.com/a.mp3', makeAudioEl());
      return null;
    };
    render(<Harness />);

    await waitFor(() => expect(decodeAudioDataMock).toHaveBeenCalled());
    expect(createMediaElementSource).not.toHaveBeenCalled();
    expect(document.querySelectorAll('audio')).toHaveLength(0);
  });

  it('re-decodes when audioUrl changes', async () => {
    installAudioContextMock(makeMockAudioBuffer(new Array(100).fill(0.5)));

    const Harness: React.FC<{ url: string }> = ({ url }) => {
      usePeaks(url, makeAudioEl());
      return null;
    };
    const { rerender } = render(<Harness url="https://example.com/first.mp3" />);
    await waitFor(() => expect(decodeAudioDataMock).toHaveBeenCalledTimes(1));

    rerender(<Harness url="https://example.com/second.mp3" />);
    await waitFor(() => expect(decodeAudioDataMock).toHaveBeenCalledTimes(2));
  });

  // ---------------------------------------------------------------------------
  // Task 008 — suppliedPeaks seam (backward-compatible third argument)
  // ---------------------------------------------------------------------------

  it('returns suppliedPeaks directly and skips fetch/AudioContext entirely when a non-empty array is supplied', async () => {
    installAudioContextMock(makeMockAudioBuffer([0.1, 0.2, 0.3]));
    const suppliedPeaks = [0.9, 0.5, 0.1];

    const captured: { current: number[] | null } = { current: null };
    const Harness: React.FC = () => {
      const peaks = usePeaks('https://example.com/a.wav', makeAudioEl(), suppliedPeaks);
      useEffect(() => {
        captured.current = peaks;
      }, [peaks]);
      return null;
    };
    render(<Harness />);

    await waitFor(() => expect(captured.current).toEqual(suppliedPeaks));
    // No network request or Web Audio decode should have occurred — the
    // supplied array is returned directly, not merely preferred afterward.
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockAudioContextCtor).not.toHaveBeenCalled();
  });

  it('falls back to fetch+decode when suppliedPeaks is undefined (existing callers unaffected)', async () => {
    installAudioContextMock(makeMockAudioBuffer(new Array(100).fill(0.4)));

    const captured: { current: number[] | null } = { current: null };
    const Harness: React.FC = () => {
      const peaks = usePeaks('https://example.com/a.wav', makeAudioEl());
      useEffect(() => {
        captured.current = peaks;
      }, [peaks]);
      return null;
    };
    render(<Harness />);

    await waitFor(() => expect(captured.current).not.toBeNull());
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/a.wav');
    expect(mockAudioContextCtor).toHaveBeenCalled();
  });

  it('falls back to fetch+decode when suppliedPeaks is an empty array', async () => {
    installAudioContextMock(makeMockAudioBuffer(new Array(100).fill(0.4)));

    const captured: { current: number[] | null } = { current: null };
    const Harness: React.FC = () => {
      const peaks = usePeaks('https://example.com/a.wav', makeAudioEl(), []);
      useEffect(() => {
        captured.current = peaks;
      }, [peaks]);
      return null;
    };
    render(<Harness />);

    await waitFor(() => expect(captured.current).not.toBeNull());
    expect(mockAudioContextCtor).toHaveBeenCalled();
  });

  it('WaveformTape threads its own peaks prop into usePeaks, suppressing internal decode', async () => {
    installAudioContextMock(makeMockAudioBuffer([0.1, 0.2, 0.3]));
    const suppliedPeaks = Array.from({ length: 50 }, (_, i) => i / 49);
    const audioEl = makeAudioEl();

    render(
      <WaveformTape
        audioEl={audioEl}
        audioUrl="https://example.com/a.wav"
        duration={120}
        peaks={suppliedPeaks}
      />,
    );

    await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockAudioContextCtor).not.toHaveBeenCalled();
  });

  it('short clip (fewer raw samples than PEAKS_COUNT): every raw sample is represented, no zero-padded tail', async () => {
    // Raw sample count well under PEAKS_COUNT (4000). Every sample is loud
    // (0.9) so a flatlined padded tail is trivially distinguishable from
    // correct full-array coverage.
    const rawSamples = new Array(100).fill(0.9);
    installAudioContextMock(makeMockAudioBuffer(rawSamples));

    const captured: { current: number[] | null } = { current: null };
    const Harness: React.FC = () => {
      const peaks = usePeaks('https://example.com/short.mp3', makeAudioEl());
      useEffect(() => {
        captured.current = peaks;
      }, [peaks]);
      return null;
    };
    render(<Harness />);

    await waitFor(() => expect(captured.current).not.toBeNull());
    // The old behavior zero-padded a PEAKS_COUNT-length array with only the
    // first `rawSamples.length` buckets populated. The fix must not leave
    // any trailing zero-padding: every bucket in the returned array reflects
    // real (loud) audio data.
    expect(captured.current!.length).toBeGreaterThan(0);
    expect(captured.current!.every((v) => v > 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WaveformTape rendering
// ---------------------------------------------------------------------------

describe('WaveformTape', () => {
  beforeEach(() => {
    // Varied (non-flat) peak fixture: shape-stability assertions need bar
    // heights that actually differ across the window, otherwise a "crawl"
    // bug (sampling relative to the moving window instead of a fixed grid)
    // would be indistinguishable from correct behavior.
    const varied = Array.from({ length: PEAKS_COUNT }, (_, i) => (i % 7) / 7);
    installAudioContextMock(makeMockAudioBuffer(varied));
  });

  it('renders the tape region with slider role and single-owner-safe markup (no <audio>)', async () => {
    const audioEl = makeAudioEl();
    render(<WaveformTape audioEl={audioEl} audioUrl="https://example.com/a.mp3" duration={120} />);

    expect(screen.getByRole('region', { name: 'Audio tape' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());
    expect(document.querySelectorAll('audio')).toHaveLength(0);
  });

  it('exports PEAKS_COUNT as 4000', () => {
    expect(PEAKS_COUNT).toBe(4000);
  });

  it('fixed-grid sampling: bar shape is stable as position advances within a page', async () => {
    const audioEl = makeAudioEl();
    audioEl.currentTime = 2;
    const { container, rerender } = render(
      <WaveformTape audioEl={audioEl} audioUrl="https://example.com/a.mp3" duration={120} windowSec={30} />,
    );
    await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());

    const barsAt2 = Array.from(container.querySelectorAll('rect')).map((r) => r.getAttribute('height'));

    // Advance within the same page (page is [0, 30) at windowSec=30) — the
    // fixed grid means bar heights (the sampled shape) must not change,
    // only the playhead position/scrollOffset move.
    act(() => {
      audioEl.currentTime = 5;
      audioEl.dispatchEvent(new Event('timeupdate'));
    });
    rerender(
      <WaveformTape audioEl={audioEl} audioUrl="https://example.com/a.mp3" duration={120} windowSec={30} />,
    );

    const barsAt5 = Array.from(container.querySelectorAll('rect')).map((r) => r.getAttribute('height'));
    expect(barsAt5).toEqual(barsAt2);
  });

  it('fixed-grid sampling: in moving mode, a small sub-grid position shift (e.g. one rAF tick) does not shift the sampled bar shape', async () => {
    // This is the binding invariant of spec §5.3: bar i must sample
    // `alignedStart + (i+0.5)*gridSec` (a fixed absolute-time grid snapped
    // per bucket), never `viewStart + i/N*windowSec` (continuously resampled
    // relative to the moving window). At windowSec=30, gridSec = 1/6s
    // (~166ms) — much coarser than a single 60fps rAF tick (~16ms). A
    // window-relative sampler drifts the sampled time (and therefore the bar
    // heights) on every such sub-grid tick, which is the "crawl/shimmer" the
    // spec calls out. The fixed-grid sampler holds the shape steady until
    // position crosses into the next grid bucket.
    const audioEl = makeAudioEl();
    audioEl.currentTime = 20;
    const { container } = render(
      <WaveformTape
        audioEl={audioEl}
        audioUrl="https://example.com/a.mp3"
        duration={120}
        windowSec={30}
        mode="moving"
      />,
    );
    await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());

    const barsAt20 = Array.from(container.querySelectorAll('rect')).map((r) => r.getAttribute('height'));

    // Advance by 50ms (well under one gridSec bucket of ~166ms) — a typical
    // rAF-tick-sized move during playback. Moving mode polls
    // audioEl.currentTime via a rAF loop (not `timeupdate`).
    audioEl.currentTime = 20.05;
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    const barsAfterSubGridTick = Array.from(container.querySelectorAll('rect')).map((r) =>
      r.getAttribute('height'),
    );

    expect(barsAfterSubGridTick).toEqual(barsAt20);
  });

  it('paged mode: crossing a page boundary snaps viewStart to the next page (playhead resets near left edge, no continuous scroll)', async () => {
    const SVG_W = 180 * (5 + 2); // BAR_COUNT * SLOT
    const audioEl = makeAudioEl();
    audioEl.currentTime = 29;
    const { container } = render(
      <WaveformTape audioEl={audioEl} audioUrl="https://example.com/a.mp3" duration={120} windowSec={30} />,
    );
    await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());

    let slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuenow')).toBe('29');
    // Near the right edge of the [0, 30) page: playhead x ≈ (29/30)*SVG_W.
    let line = container.querySelector('svg.tape-canvas line');
    expect(Number(line?.getAttribute('x1'))).toBeGreaterThan(SVG_W * 0.9);

    audioEl.currentTime = 31; // crosses into the next 30s page ([30, 60))
    // Paged mode now polls currentTime via the same rAF loop as moving mode
    // (the playhead-jump fix — see WaveformTape.tsx), not the coarser
    // `timeupdate` event, so advance one real animation frame instead of
    // dispatching it.
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuenow')).toBe('31');
    // Paged mode has no continuous scroll: the window snaps to the new page
    // (viewStart = floor(31/30)*30 = 30), so the playhead jumps back near the
    // LEFT edge of the tape ((31-30)/30 ≈ 3%) instead of continuing past the
    // right edge the way a moving/scrolling window would.
    line = container.querySelector('svg.tape-canvas line');
    expect(Number(line?.getAttribute('x1'))).toBeLessThan(SVG_W * 0.1);
  });

  it('click on the tape calls seek with a time inside the current window', async () => {
    const audioEl = makeAudioEl();
    audioEl.currentTime = 10;
    const { container } = render(
      <WaveformTape audioEl={audioEl} audioUrl="https://example.com/a.mp3" duration={120} windowSec={30} />,
    );
    await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());

    const svg = container.querySelector('svg.tape-canvas') as SVGSVGElement;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 1000,
      bottom: 100,
      width: 1000,
      height: 100,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.mouseDown(svg, { clientX: 500 }); // 50% across the 30s page starting at 0

    expect(playerBus.seek).toHaveBeenCalled();
    const seekedTo = (playerBus.seek as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(seekedTo).toBeGreaterThanOrEqual(0);
    expect(seekedTo).toBeLessThanOrEqual(30);
  });

  it('drag-to-scrub calls seek continuously while dragging', async () => {
    const audioEl = makeAudioEl();
    audioEl.currentTime = 0;
    const { container } = render(
      <WaveformTape audioEl={audioEl} audioUrl="https://example.com/a.mp3" duration={120} windowSec={30} />,
    );
    await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());

    const svg = container.querySelector('svg.tape-canvas') as SVGSVGElement;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 1000, bottom: 100, width: 1000, height: 100, x: 0, y: 0, toJSON: () => {},
    });

    fireEvent.mouseDown(svg, { clientX: 100 });
    const callsAfterDown = (playerBus.seek as ReturnType<typeof vi.fn>).mock.calls.length;

    fireEvent.mouseMove(window, { clientX: 300 });
    fireEvent.mouseMove(window, { clientX: 500 });

    expect((playerBus.seek as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsAfterDown);

    fireEvent.mouseUp(window);
  });

  it('calls the onSeek prop in addition to bus.seek()', async () => {
    const audioEl = makeAudioEl();
    const onSeek = vi.fn();
    const { container } = render(
      <WaveformTape
        audioEl={audioEl}
        audioUrl="https://example.com/a.mp3"
        duration={120}
        windowSec={30}
        onSeek={onSeek}
      />,
    );
    await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());

    const svg = container.querySelector('svg.tape-canvas') as SVGSVGElement;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0, top: 0, right: 1000, bottom: 100, width: 1000, height: 100, x: 0, y: 0, toJSON: () => {},
    });

    fireEvent.mouseDown(svg, { clientX: 500 });

    expect(onSeek).toHaveBeenCalled();
  });

  it('keyboard ArrowRight/ArrowLeft seeks position ± 5', async () => {
    const audioEl = makeAudioEl();
    audioEl.currentTime = 20;
    render(
      <WaveformTape audioEl={audioEl} audioUrl="https://example.com/a.mp3" duration={120} windowSec={30} />,
    );
    await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());

    const root = screen.getByRole('region', { name: 'Audio tape' });
    fireEvent.keyDown(root, { key: 'ArrowRight' });
    expect(playerBus.seek).toHaveBeenLastCalledWith(25);

    fireEvent.keyDown(root, { key: 'ArrowLeft' });
    expect(playerBus.seek).toHaveBeenLastCalledWith(15);
  });

  it('ruler renders m:ss ticks at a zoom-adaptive interval', async () => {
    const audioEl = makeAudioEl();
    audioEl.currentTime = 0;
    const { container } = render(
      <WaveformTape audioEl={audioEl} audioUrl="https://example.com/a.mp3" duration={120} windowSec={30} />,
    );
    await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());

    const ticks = container.querySelectorAll('.tape-tick');
    expect(ticks.length).toBeGreaterThan(0);
    // windowSec=30 → tickInterval picks the first NICE_INTERVALS entry >= 7.5 → 10
    expect(ticks[0].textContent).toBe('0:10');
  });

  it('prefers-reduced-motion forces paged mode even when mode="moving" is passed', async () => {
    // Use position=20 (windowSec=30): paged viewStart = floor(20/30)*30 = 0,
    // so the playhead sits at 20/30 ≈ 67% of the page. Moving mode would
    // instead fix the playhead at 50% regardless of position. These
    // disagree, so this position disambiguates forced-paged from moving.
    const SVG_W = 180 * (5 + 2); // BAR_COUNT * SLOT
    mockMatchMedia(true);
    const audioEl = makeAudioEl();
    audioEl.currentTime = 20;
    const { container } = render(
      <WaveformTape
        audioEl={audioEl}
        audioUrl="https://example.com/a.mp3"
        duration={120}
        windowSec={30}
        mode="moving"
      />,
    );
    await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());

    const line = container.querySelector('svg.tape-canvas line');
    // Forced-paged: playheadFrac = (20 - 0) / 30 ≈ 0.667 → x ≈ 0.667 * SVG_W.
    // If reduced-motion were NOT honored (moving stayed active), x would sit
    // at exactly SVG_W / 2 instead.
    expect(Number(line?.getAttribute('x1'))).toBeCloseTo((20 / 30) * SVG_W, 0);
    expect(Number(line?.getAttribute('x1'))).not.toBeCloseTo(SVG_W / 2, 0);
  });

  it('moving mode uses a rAF loop to poll audioEl.currentTime and cancels it on unmount', async () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    const cafSpy = vi.spyOn(window, 'cancelAnimationFrame');
    const audioEl = makeAudioEl();

    const { unmount } = render(
      <WaveformTape
        audioEl={audioEl}
        audioUrl="https://example.com/a.mp3"
        duration={120}
        windowSec={30}
        mode="moving"
      />,
    );
    await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());

    expect(rafSpy).toHaveBeenCalled();

    unmount();
    expect(cafSpy).toHaveBeenCalled();
  });

  it('moving mode: playhead stays fixed at 50% regardless of position', async () => {
    const audioEl = makeAudioEl();
    audioEl.currentTime = 47;
    render(
      <WaveformTape
        audioEl={audioEl}
        audioUrl="https://example.com/a.mp3"
        duration={120}
        windowSec={30}
        mode="moving"
      />,
    );
    await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());

    const slider = screen.getByRole('slider');
    // aria-valuenow tracks absolute position, not the fixed-center frac, but
    // we can confirm the playhead line sits at SVG_W/2 regardless of position.
    expect(slider.getAttribute('aria-valuenow')).toBe('47');
    const line = document.querySelector('svg.tape-canvas line');
    const svgW = 180 * (5 + 2); // BAR_COUNT * SLOT
    expect(Number(line?.getAttribute('x1'))).toBeCloseTo(svgW / 2, 0);
  });

  it('short clip (fewer raw samples than PEAKS_COUNT): real audio is represented across the ENTIRE visible window, no flatlined tail', async () => {
    // A clip with far fewer raw samples than PEAKS_COUNT (4000). Loud (0.9)
    // throughout, with the whole clip visible in one page (windowSec >=
    // duration). The old bug stretched the real data into only the first
    // `rawSampleCount / PEAKS_COUNT` fraction of the peaks array and left the
    // rest zero — which, indexed proportionally over the full clip duration,
    // renders as a flatlined tail even though the source audio is loud
    // throughout. Every bar in view must reflect the loud source, not zero.
    const rawSamples = new Array(50).fill(0.9);
    installAudioContextMock(makeMockAudioBuffer(rawSamples));

    const audioEl = makeAudioEl();
    const duration = 2; // whole clip fits in one 30s+ page
    const { container } = render(
      <WaveformTape audioEl={audioEl} audioUrl="https://example.com/short.mp3" duration={duration} windowSec={30} />,
    );
    await waitFor(() => expect(screen.getByRole('slider')).toBeInTheDocument());

    // Only bars within [0, duration) map to real audio (bars beyond the
    // clip's own duration are legitimately silent — that's not the bug).
    const gridSec = 30 / 180; // windowSec / BAR_COUNT
    const barsWithinClip = Array.from(container.querySelectorAll('rect')).filter((_, i) => {
      const t = (i + 0.5) * gridSec;
      return t < duration;
    });
    expect(barsWithinClip.length).toBeGreaterThan(0);
    for (const bar of barsWithinClip) {
      expect(Number(bar.getAttribute('height'))).toBeGreaterThan(2); // > the silent-floor height
    }
  });
});

// ---------------------------------------------------------------------------
// Task 007 — zoom control + minimap wiring
// ---------------------------------------------------------------------------

describe('WaveformTape — zoom + minimap wiring (task 007)', () => {
  beforeEach(() => {
    const varied = Array.from({ length: PEAKS_COUNT }, (_, i) => (i % 7) / 7);
    installAudioContextMock(makeMockAudioBuffer(varied));
  });

  it('re-exports snapZoom from WaveformTape', () => {
    expect(snapZoom(30, 'out')).toBe(60);
    expect(snapZoom(30, 'in')).toBe(15);
  });

  it('renders the WaveformTapeZoom control above the canvas', async () => {
    const audioEl = makeAudioEl();
    render(
      <WaveformTape
        audioEl={audioEl}
        audioUrl="https://example.com/a.mp3"
        duration={120}
        windowSec={30}
        peaks={null}
        onZoomChange={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByRole('slider', { name: 'Zoom level' })).toBeInTheDocument());
  });

  it('renders the WaveformTapeMinimap below the canvas', async () => {
    const audioEl = makeAudioEl();
    render(
      <WaveformTape
        audioEl={audioEl}
        audioUrl="https://example.com/a.mp3"
        duration={120}
        windowSec={30}
        peaks={null}
        onZoomChange={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Clip overview — drag to navigate' })).toBeInTheDocument(),
    );
  });

  it('scrolling the wheel down over the tape canvas zooms out (calls onZoomChange with the next larger preset)', async () => {
    const audioEl = makeAudioEl();
    const onZoomChange = vi.fn();
    const { container } = render(
      <WaveformTape
        audioEl={audioEl}
        audioUrl="https://example.com/a.mp3"
        duration={120}
        windowSec={30}
        peaks={null}
        onZoomChange={onZoomChange}
      />,
    );
    await waitFor(() => expect(container.querySelector('svg.tape-canvas')).toBeInTheDocument());

    const svg = container.querySelector('svg.tape-canvas') as SVGSVGElement;
    fireEvent.wheel(svg, { deltaY: 100 });

    expect(onZoomChange).toHaveBeenCalledWith(60);
  });

  it('scrolling the wheel up over the tape canvas zooms in (calls onZoomChange with the next smaller preset)', async () => {
    const audioEl = makeAudioEl();
    const onZoomChange = vi.fn();
    const { container } = render(
      <WaveformTape
        audioEl={audioEl}
        audioUrl="https://example.com/a.mp3"
        duration={120}
        windowSec={30}
        peaks={null}
        onZoomChange={onZoomChange}
      />,
    );
    await waitFor(() => expect(container.querySelector('svg.tape-canvas')).toBeInTheDocument());

    const svg = container.querySelector('svg.tape-canvas') as SVGSVGElement;
    fireEvent.wheel(svg, { deltaY: -100 });

    expect(onZoomChange).toHaveBeenCalledWith(15);
  });

  it('registers the wheel-zoom listener as native and non-passive, so preventDefault actually suppresses page scroll', async () => {
    // React registers `wheel` at the document root as PASSIVE (React 17+), so
    // e.preventDefault() inside a React onWheel prop is a silent no-op in a
    // real browser — jsdom's fireEvent.wheel can't reproduce that restriction
    // (see the two zoom tests above), so this structural check is what
    // actually pins the fix: the listener must be attached via a real
    // addEventListener('wheel', ..., { passive: false }) call, not the React
    // onWheel prop.
    const addEventListenerSpy = vi.spyOn(SVGElement.prototype, 'addEventListener');
    const audioEl = makeAudioEl();
    const { container } = render(
      <WaveformTape
        audioEl={audioEl}
        audioUrl="https://example.com/a.mp3"
        duration={120}
        windowSec={30}
        peaks={null}
        onZoomChange={vi.fn()}
      />,
    );
    await waitFor(() => expect(container.querySelector('svg.tape-canvas')).toBeInTheDocument());

    const wheelRegistration = addEventListenerSpy.mock.calls.find(([type]) => type === 'wheel');
    expect(wheelRegistration).toBeDefined();
    expect(wheelRegistration?.[2]).toMatchObject({ passive: false });

    addEventListenerSpy.mockRestore();
  });

  it('keyboard "-" on the focused tape zooms out; "+" zooms in', async () => {
    // windowSec is controlled by the parent (PlayerBar, task 008); this test
    // double keeps the prop fixed at 30, so each keypress independently
    // proposes a step from that same base via onZoomChange — it does not
    // simulate the parent committing the new preset back down as a prop.
    const audioEl = makeAudioEl();
    const onZoomChange = vi.fn();
    render(
      <WaveformTape
        audioEl={audioEl}
        audioUrl="https://example.com/a.mp3"
        duration={120}
        windowSec={30}
        peaks={null}
        onZoomChange={onZoomChange}
      />,
    );
    await waitFor(() => expect(screen.getByRole('region', { name: 'Audio tape' })).toBeInTheDocument());

    const root = screen.getByRole('region', { name: 'Audio tape' });
    fireEvent.keyDown(root, { key: '-' });
    expect(onZoomChange).toHaveBeenLastCalledWith(60); // step 'out' from 30

    fireEvent.keyDown(root, { key: '+' });
    expect(onZoomChange).toHaveBeenLastCalledWith(15); // step 'in' from 30 (prop unchanged)
  });

  it('existing ArrowLeft/ArrowRight scrub behavior is unaffected by the zoom keyboard extension', async () => {
    const audioEl = makeAudioEl();
    audioEl.currentTime = 20;
    render(
      <WaveformTape
        audioEl={audioEl}
        audioUrl="https://example.com/a.mp3"
        duration={120}
        windowSec={30}
        peaks={null}
        onZoomChange={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByRole('region', { name: 'Audio tape' })).toBeInTheDocument());

    const root = screen.getByRole('region', { name: 'Audio tape' });
    fireEvent.keyDown(root, { key: 'ArrowRight' });
    expect(playerBus.seek).toHaveBeenLastCalledWith(25);
  });

  it('feeds the internally decoded peaks into the minimap when peaks={null} (under-cap case), not flat fallback bars', async () => {
    // PlayerBar passes peaks={sidecarPeaks}, which is `null` for every
    // under-cap clip (the common case). The minimap must render from the
    // internally decoded peakArray (varied sawtooth from the describe-block's
    // AudioContext mock), NOT the raw null prop — a null prop collapses the
    // minimap to uniform FALLBACK_AMP bars even though the canvas shows a real
    // decoded shape.
    const audioEl = makeAudioEl();
    const { container } = render(
      <WaveformTape
        audioEl={audioEl}
        audioUrl="https://example.com/a.mp3"
        duration={120}
        windowSec={30}
        peaks={null}
        onZoomChange={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(container.querySelectorAll('rect.tape-minimap-bar').length).toBeGreaterThan(0),
    );
    // Wait for the decode to resolve and flow into the minimap.
    await waitFor(() => {
      const heights = Array.from(container.querySelectorAll('rect.tape-minimap-bar')).map((b) =>
        b.getAttribute('height'),
      );
      // A varied decoded shape produces multiple distinct bar heights; flat
      // fallback bars would all be identical.
      expect(new Set(heights).size).toBeGreaterThan(1);
    });
  });

  it('passes the peaks prop through to the minimap so it reflects real audio shape', async () => {
    const audioEl = makeAudioEl();
    const peaks = Array.from({ length: 1000 }, (_, i) => i / 999);
    const { container } = render(
      <WaveformTape
        audioEl={audioEl}
        audioUrl="https://example.com/a.mp3"
        duration={120}
        windowSec={30}
        peaks={peaks}
        onZoomChange={vi.fn()}
      />,
    );
    await waitFor(() => expect(container.querySelectorAll('rect.tape-minimap-bar').length).toBeGreaterThan(0));
    const bars = Array.from(container.querySelectorAll('rect.tape-minimap-bar'));
    const firstHeight = Number(bars[0].getAttribute('height'));
    const lastHeight = Number(bars[bars.length - 1].getAttribute('height'));
    expect(lastHeight).toBeGreaterThan(firstHeight);
  });
});

// ---------------------------------------------------------------------------
// computeTapeBarCount — dynamic visual resolution (owner report: wide zoom
// levels stayed blocky because bar count was a fixed 180 regardless of how
// much real peak detail the window actually held)
// ---------------------------------------------------------------------------

describe('computeTapeBarCount', () => {
  it('falls back to TAPE_BAR_COUNT (180) when container width is not yet known', () => {
    expect(computeTapeBarCount(7200, 600, 120, 0)).toBe(180);
  });

  it('falls back to TAPE_BAR_COUNT (180) when peak data is not yet available', () => {
    expect(computeTapeBarCount(null, 600, 120, 1400)).toBe(180);
  });

  it('renders more bars at a wide zoom window than at the tightest zoom, for the same real peak density', () => {
    // 60 real peaks/sec (the sidecar density), a 600s chapter, 1400px canvas.
    const availablePeaks = 60 * 600;
    const duration = 600;
    const containerWidthPx = 1400;

    const tightest = computeTapeBarCount(availablePeaks, duration, 3, containerWidthPx);
    const widest = computeTapeBarCount(availablePeaks, duration, 120, containerWidthPx);

    // Tightest zoom (3s * 60/sec = 180 real samples) matches the old fixed
    // bar count exactly — one real peak per bar, unchanged behavior.
    expect(tightest).toBe(180);
    // Widest zoom used to render the SAME 180 bars even though 7200 real
    // peaks are available in the window — this is the reported bug. Now it
    // must render substantially more (thinner, more distinct) bars.
    expect(widest).toBeGreaterThan(tightest);
  });

  it('never exceeds the pixel budget (never renders bars thinner than MIN_SLOT_PX)', () => {
    const availablePeaks = 60 * 600;
    const containerWidthPx = 400; // narrow container
    const widest = computeTapeBarCount(availablePeaks, 600, 120, containerWidthPx);
    // 400px / 2px-per-slot floor = 200 bars max.
    expect(widest).toBeLessThanOrEqual(200);
  });

  it('never fabricates: bar count growth reflects more REAL samples per bar, not invented resolution', () => {
    // With only 500 real peaks total in a 600s clip (well under the sidecar
    // density), widening the zoom should not be capped below the old floor,
    // but it also must not be inflated past what a generous pixel budget
    // allows — computeTapeBarCount only ever caps toward real density or
    // pixel budget, it never adds a term that isn't one of those two.
    const availablePeaks = 500;
    const duration = 600;
    const containerWidthPx = 1400;
    const widest = computeTapeBarCount(availablePeaks, duration, 120, containerWidthPx);
    const peaksPerSec = availablePeaks / duration;
    const dataTarget = Math.round(120 * peaksPerSec);
    expect(widest).toBe(Math.max(180, dataTarget));
  });
});
