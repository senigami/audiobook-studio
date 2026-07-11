import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerBar } from '@/app/layout/PlayerBar';
import * as playerBus from '@/store/playerBus';
import { DURATION_BOOTSTRAP } from '@/app/layout/playerRepresentation';

// Mock wavesurfer.js so it doesn't try to decode real audio in jsdom
vi.mock('wavesurfer.js', () => ({
  default: { create: vi.fn(() => ({ destroy: vi.fn(), load: vi.fn() })) },
}));

// Mock WaveformStrip so PlayerBar tests don't exercise wavesurfer internals
vi.mock('@/app/layout/WaveformStrip', () => ({
  WaveformStrip: () => <div data-testid="waveform-strip" />,
}));

// jsdom does not implement ResizeObserver. PlayerBar uses it purely to measure
// the scrub container's width (a browser layout API — outside the unit under
// test per R2), so we stub it here rather than mock any playerBar/playerBus
// internals. Tests that care about a specific measured width invoke the
// captured callback with a synthetic contentRect.
let lastResizeObserverCallback: ResizeObserverCallback | null = null;

class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    lastResizeObserverCallback = callback;
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

function fireResize(width: number) {
  act(() => {
    lastResizeObserverCallback?.(
      [{ contentRect: { width } } as ResizeObserverEntry],
      {} as ResizeObserver,
    );
  });
}

describe('PlayerBar', () => {
  beforeEach(() => {
    playerBus.resetPlayerBusForTests();
    lastResizeObserverCallback = null;

    vi.stubGlobal('ResizeObserver', MockResizeObserver);

    // Mock HTMLMediaElement prototype methods that JSDOM doesn't implement or stub fully
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  it('renders nothing when audioUrl is null', () => {
    const { container } = render(<PlayerBar />);
    expect(container.firstChild).toBeNull();
  });

  it('renders correctly when active audio is loaded', () => {
    playerBus.loadAndPlay({
      scope: 'segment',
      title: 'Chapter 1 Segment 1',
      subtitle: 'Preview audio',
      audioUrl: 'https://example.com/audio.mp3',
      hasPrev: true,
      hasNext: false,
    });

    render(<PlayerBar />);

    expect(screen.getByText('Chapter 1 Segment 1')).toBeInTheDocument();
    expect(screen.getByText('Preview audio')).toBeInTheDocument();
    // Scope is informational-only (audio-player.md 1.6.0 §2.1) and no longer
    // renders as a passive badge — see "Scope toggle removal" below.
    expect(screen.queryByText('segment')).toBeNull();

    const prevButton = screen.getByLabelText('Previous');
    const nextButton = screen.getByLabelText('Next');
    const stopButton = screen.getByLabelText('Stop');
    const playPauseButton = screen.getByLabelText('Pause'); // Should show Pause because loadAndPlay sets playing to true

    expect(prevButton).not.toBeDisabled();
    expect(nextButton).toBeDisabled();
    expect(stopButton).not.toBeDisabled();
    expect(playPauseButton).not.toBeDisabled();
  });

  it('handles play and pause toggle', () => {
    playerBus.loadAndPlay({
      scope: 'chapter',
      title: 'Chapter 1',
      audioUrl: 'https://example.com/audio.mp3',
    });

    render(<PlayerBar />);

    const playPauseButton = screen.getByLabelText('Pause');
    
    // Currently playing, click to pause
    fireEvent.click(playPauseButton);
    expect(playerBus.getSnapshot().playing).toBe(false);
  });

  it('handles prev, next, stop clicks', () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    
    playerBus.loadAndPlay({
      scope: 'preview',
      title: 'Preview',
      audioUrl: 'https://example.com/audio.mp3',
      hasPrev: true,
      hasNext: true,
      onPrev,
      onNext,
    });

    render(<PlayerBar />);

    const prevButton = screen.getByLabelText('Previous');
    const nextButton = screen.getByLabelText('Next');
    const stopButton = screen.getByLabelText('Stop');

    fireEvent.click(prevButton);
    expect(onPrev).toHaveBeenCalled();

    fireEvent.click(nextButton);
    expect(onNext).toHaveBeenCalled();

    fireEvent.click(stopButton);
    expect(playerBus.getSnapshot().audioUrl).toBeNull();
  });

  it('handles seek slider changes', () => {
    // Long clip renders the plain slider (representation is duration-driven,
    // not scope-driven — see playerRepresentation.test.ts).
    playerBus.loadAndPlay({
      scope: 'chapter',
      title: 'Chapter 1',
      audioUrl: 'https://example.com/audio.mp3',
    });

    // Report time to update duration to 600 seconds (past the legibility
    // floor/bootstrap) and position to 10 seconds.
    playerBus.reportTime(10, 600);

    render(<PlayerBar />);
    fireResize(600); // 1 px/sec at 600s — below the legibility floor

    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.value).toBe('10');
    expect(slider.max).toBe('600');

    fireEvent.change(slider, { target: { value: '50' } });
    expect(playerBus.getSnapshot().position).toBe(50);
  });

  it('renders all 5 VCR transport controls plus Stop', () => {
    playerBus.loadAndPlay({
      scope: 'segment',
      title: 'VCR Test',
      audioUrl: 'https://example.com/audio.mp3',
      hasPrev: true,
      hasNext: true,
    });

    render(<PlayerBar />);

    expect(screen.getByLabelText('Previous')).toBeInTheDocument();
    expect(screen.getByLabelText('Skip back 10 seconds')).toBeInTheDocument();
    // loadAndPlay sets playing:true so the button shows "Pause"
    expect(screen.getByLabelText('Pause')).toBeInTheDocument();
    expect(screen.getByLabelText('Skip forward 10 seconds')).toBeInTheDocument();
    expect(screen.getByLabelText('Next')).toBeInTheDocument();
    expect(screen.getByLabelText('Stop')).toBeInTheDocument();
  });

  it('skip-back button calls skip(-10) and moves audio currentTime', () => {
    playerBus.loadAndPlay({
      scope: 'segment',
      title: 'Skim Test',
      audioUrl: 'https://example.com/audio.mp3',
    });
    // duration=120 is arbitrary here — transport controls render outside the
    // scrub representation conditional (see PlayerBar.tsx), so this is
    // deliberately not asserting wave-vs-bar; that boundary is covered by
    // playerRepresentation.test.ts.
    playerBus.reportTime(30, 120);

    render(<PlayerBar />);

    const audioEl = document.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(audioEl, 'currentTime', { writable: true, value: 30 });

    act(() => {
      fireEvent.click(screen.getByLabelText('Skip back 10 seconds'));
    });

    expect(playerBus.getSnapshot().position).toBe(20);
    expect(audioEl.currentTime).toBe(20);
  });

  it('skip-forward button calls skip(+10) and moves audio currentTime', () => {
    playerBus.loadAndPlay({
      scope: 'segment',
      title: 'Skim Fwd Test',
      audioUrl: 'https://example.com/audio.mp3',
    });
    playerBus.reportTime(30, 120);

    render(<PlayerBar />);

    const audioEl = document.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(audioEl, 'currentTime', { writable: true, value: 30 });

    act(() => {
      fireEvent.click(screen.getByLabelText('Skip forward 10 seconds'));
    });

    expect(playerBus.getSnapshot().position).toBe(40);
    expect(audioEl.currentTime).toBe(40);
  });

  it('bus seek() moves the audio element currentTime', async () => {
    playerBus.loadAndPlay({
      scope: 'segment',
      title: 'Seek Test',
      audioUrl: 'https://example.com/seek-test.mp3',
    });

    render(<PlayerBar />);

    // Get the audio element that was rendered
    const audioEl = document.querySelector('audio') as HTMLAudioElement;
    expect(audioEl).toBeTruthy();

    // Simulate the audio element having a current time
    Object.defineProperty(audioEl, 'currentTime', {
      writable: true,
      value: 0,
    });

    // Dispatch a seek via the bus (not via the slider)
    act(() => {
      playerBus.seek(42);
    });

    // The effect keyed on seekRequestId must have set currentTime
    expect(audioEl.currentTime).toBe(42);
  });

  // -------------------------------------------------------------------------
  // Scope toggle removal (audio-player.md 1.6.0) — no scope UI renders at all.
  // Replaces the old "Scope toggle" describe block (R7-T2); switchScope/altScope
  // no longer exist, so there is nothing to switch between.
  // -------------------------------------------------------------------------

  describe('Scope toggle removal', () => {
    it('renders no scope badge, pill, or toggle group for any scope', () => {
      playerBus.loadAndPlay({
        scope: 'chapter',
        title: 'Chapter 1',
        audioUrl: 'https://example.com/chapter.wav',
      });

      render(<PlayerBar />);

      expect(screen.queryByRole('group', { name: 'Audio scope' })).toBeNull();
      expect(screen.queryByText('chapter')).toBeNull();
      expect(document.querySelector('.player-scope-toggle')).toBeNull();
      expect(document.querySelector('.player-scope-pill')).toBeNull();
      expect(document.querySelector('.player-scope-badge')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Waveform — representation is duration-driven, scope-blind (audio-player.md 1.6.0)
  // Replaces the old "Waveform follows scope (U16)" describe block: scope no
  // longer plays any part in the wave-vs-bar decision — see
  // playerRepresentation.test.ts for the fitsLegibly() unit contract.
  // -------------------------------------------------------------------------

  describe('Waveform representation is duration-driven (scope-blind)', () => {
    it('short clip renders the inline WaveformStrip as the scrub track (no slider)', () => {
      playerBus.loadAndPlay({
        scope: 'chapter',
        title: 'Short chapter',
        audioUrl: 'https://example.com/seg.mp3',
      });
      playerBus.reportTime(0, 10);

      render(<PlayerBar />);
      fireResize(600); // 60 px/sec — well above the legibility floor

      expect(screen.getByTestId('waveform-strip')).toBeInTheDocument();
      expect(screen.queryByRole('slider')).toBeNull();
    });

    it('long clip renders a plain seek slider and no waveform, even for a segment', () => {
      playerBus.loadAndPlay({
        scope: 'segment',
        title: 'Long segment',
        audioUrl: 'https://example.com/seg.mp3',
      });
      playerBus.reportTime(0, 600);

      render(<PlayerBar />);
      fireResize(600); // 1 px/sec — below the legibility floor

      expect(screen.getByRole('slider')).toBeInTheDocument();
      expect(screen.queryByTestId('waveform-strip')).toBeNull();
    });

    it('a long chapter and a long segment of the same duration/width both fall back to the bar (scope-blind)', () => {
      playerBus.loadAndPlay({
        scope: 'chapter',
        title: 'Long chapter',
        audioUrl: 'https://example.com/chapter.wav',
      });
      playerBus.reportTime(0, 600);

      render(<PlayerBar />);
      fireResize(600);

      expect(screen.getByRole('slider')).toBeInTheDocument();
      expect(screen.queryByTestId('waveform-strip')).toBeNull();
    });

    it('before the bar width is measured, falls back to the duration bootstrap threshold', () => {
      playerBus.loadAndPlay({
        scope: 'preview',
        title: 'Voice preview',
        audioUrl: 'https://example.com/preview.mp3',
      });
      playerBus.reportTime(0, DURATION_BOOTSTRAP + 1);

      render(<PlayerBar />);
      // No fireResize() — measuredWidth stays 0, so the bootstrap threshold applies.

      expect(screen.getByRole('slider')).toBeInTheDocument();
      expect(screen.queryByTestId('waveform-strip')).toBeNull();
    });

    it('the AudioLines toggle still flips waveform → bar regardless of scope', () => {
      playerBus.loadAndPlay({
        scope: 'chapter',
        title: 'Flip test',
        audioUrl: 'https://example.com/seg.mp3',
      });
      playerBus.reportTime(0, 10);

      render(<PlayerBar />);
      fireResize(600);

      expect(screen.getByTestId('waveform-strip')).toBeInTheDocument();
      const toggle = screen.getByLabelText('Show progress bar');

      act(() => { fireEvent.click(toggle); });

      expect(screen.queryByTestId('waveform-strip')).toBeNull();
      expect(screen.getByRole('slider')).toBeInTheDocument();
      expect(screen.getByLabelText('Show waveform')).toBeInTheDocument();
    });

    it('the AudioLines toggle still flips bar → waveform regardless of scope', () => {
      playerBus.loadAndPlay({
        scope: 'segment',
        title: 'Flip test 2',
        audioUrl: 'https://example.com/chapter.wav',
      });
      playerBus.reportTime(0, 600);

      render(<PlayerBar />);
      fireResize(600);

      expect(screen.getByRole('slider')).toBeInTheDocument();
      const toggle = screen.getByLabelText('Show waveform');

      act(() => { fireEvent.click(toggle); });

      expect(screen.getByTestId('waveform-strip')).toBeInTheDocument();
      expect(screen.queryByRole('slider')).toBeNull();
    });

    it('resets the forceWave override to the duration default on a new source (requestId bump)', () => {
      playerBus.loadAndPlay({
        scope: 'chapter',
        title: 'First source',
        audioUrl: 'https://example.com/first.mp3',
      });
      playerBus.reportTime(0, 10);

      render(<PlayerBar />);
      fireResize(600);

      // Flip short clip's waveform to a bar via the override.
      act(() => { fireEvent.click(screen.getByLabelText('Show progress bar')); });
      expect(screen.getByRole('slider')).toBeInTheDocument();

      // Loading a new (also short) source should clear the override and fall
      // back to the duration default (waveform), not stay forced to bar.
      act(() => {
        playerBus.loadAndPlay({
          scope: 'chapter',
          title: 'Second source',
          audioUrl: 'https://example.com/second.mp3',
        });
        playerBus.reportTime(0, 10);
      });

      expect(screen.getByTestId('waveform-strip')).toBeInTheDocument();
    });
  });
});
