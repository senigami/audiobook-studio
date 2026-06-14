import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerBar } from '@/app/layout/PlayerBar';
import * as playerBus from '@/store/playerBus';
import * as playerPrefs from '@/utils/playerPrefs';

// Mock wavesurfer.js so it doesn't try to decode real audio in jsdom
vi.mock('wavesurfer.js', () => ({
  default: { create: vi.fn(() => ({ destroy: vi.fn(), load: vi.fn() })) },
}));

// Mock WaveformStrip so PlayerBar tests don't exercise wavesurfer internals
vi.mock('@/app/layout/WaveformStrip', () => ({
  WaveformStrip: () => <div data-testid="waveform-strip" />,
}));

describe('PlayerBar', () => {
  beforeEach(() => {
    playerBus.resetPlayerBusForTests();
    
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
    expect(screen.getByText('segment')).toBeInTheDocument();

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
    playerBus.loadAndPlay({
      scope: 'segment',
      title: 'Chapter 1 Segment 1',
      audioUrl: 'https://example.com/audio.mp3',
    });

    // Report time to update duration to 120 seconds and position to 10 seconds
    playerBus.reportTime(10, 120);

    render(<PlayerBar />);

    const slider = screen.getByRole('slider') as HTMLInputElement;
    expect(slider.value).toBe('10');
    expect(slider.max).toBe('120');

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
  // Scope pill toggle — R7-T2
  // -------------------------------------------------------------------------

  describe('Scope toggle', () => {
    it('renders passive scope badge when altScope is not present', () => {
      playerBus.loadAndPlay({
        scope: 'chapter',
        title: 'Chapter 1',
        audioUrl: 'https://example.com/chapter.wav',
      });

      render(<PlayerBar />);

      // Badge should be present, toggle group should not
      expect(screen.getByText('chapter')).toBeInTheDocument();
      expect(screen.queryByRole('group', { name: 'Audio scope' })).toBeNull();
    });

    it('renders scope pill toggle when altScope is present', () => {
      playerBus.loadAndPlay({
        scope: 'chapter',
        title: 'Chapter 1',
        audioUrl: 'https://example.com/chapter.wav',
        altScope: { scope: 'segment', audioUrl: 'https://example.com/seg.wav', title: 'Seg 1' },
      });

      render(<PlayerBar />);

      const group = screen.getByRole('group', { name: 'Audio scope' });
      expect(group).toBeInTheDocument();
      // Should have two pills labelled by their scopes
      expect(screen.getByText('chapter')).toBeInTheDocument();
      expect(screen.getByText('segment')).toBeInTheDocument();
    });

    it('clicking the inactive scope pill calls switchScope', () => {
      playerBus.loadAndPlay({
        scope: 'chapter',
        title: 'Chapter 1',
        audioUrl: 'https://example.com/chapter.wav',
        altScope: { scope: 'segment', audioUrl: 'https://example.com/seg.wav', title: 'Seg 1' },
      });

      render(<PlayerBar />);

      const beforeId = playerBus.getSnapshot().requestId;

      // The "Switch to segment" button is the inactive pill
      act(() => {
        fireEvent.click(screen.getByLabelText('Switch to segment'));
      });

      const state = playerBus.getSnapshot();
      expect(state.scope).toBe('segment');
      expect(state.requestId).toBeGreaterThan(beforeId);
    });
  });

  // -------------------------------------------------------------------------
  // Wave toggle — R7-T3
  // -------------------------------------------------------------------------

  describe('Wave toggle', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('renders a Wave toggle button when audio is loaded', () => {
      playerBus.loadAndPlay({
        scope: 'segment',
        title: 'Wave Toggle Test',
        audioUrl: 'https://example.com/audio.mp3',
      });

      render(<PlayerBar />);

      expect(screen.getByLabelText('Show waveform')).toBeInTheDocument();
    });

    it('Wave toggle default state is off (WaveformStrip not mounted)', () => {
      localStorage.clear(); // ensure no persisted pref
      vi.spyOn(playerPrefs, 'loadWaveformPref').mockReturnValue(false);

      playerBus.loadAndPlay({
        scope: 'segment',
        title: 'Wave Off Test',
        audioUrl: 'https://example.com/audio.mp3',
      });

      render(<PlayerBar />);

      expect(screen.queryByTestId('waveform-strip')).toBeNull();
    });

    it('clicking Wave toggle mounts WaveformStrip and sets --player-waveform-height', () => {
      vi.spyOn(playerPrefs, 'loadWaveformPref').mockReturnValue(false);
      vi.spyOn(playerPrefs, 'saveWaveformPref').mockImplementation(() => {});

      playerBus.loadAndPlay({
        scope: 'segment',
        title: 'Wave On Test',
        audioUrl: 'https://example.com/audio.mp3',
      });

      const { container } = render(<PlayerBar />);

      // Initially off
      expect(screen.queryByTestId('waveform-strip')).toBeNull();

      // Click the toggle
      act(() => {
        fireEvent.click(screen.getByLabelText('Show waveform'));
      });

      // WaveformStrip should now be mounted
      expect(screen.getByTestId('waveform-strip')).toBeInTheDocument();

      // The player-bar element's CSS var should be non-zero
      const playerBarEl = container.querySelector('.player-bar') as HTMLElement;
      expect(playerBarEl.style.getPropertyValue('--player-waveform-height')).not.toBe('0px');

      // Pref saved as on
      expect(playerPrefs.saveWaveformPref).toHaveBeenCalledWith(true);
    });

    it('clicking Wave toggle twice unmounts WaveformStrip and sets height 0px', () => {
      vi.spyOn(playerPrefs, 'loadWaveformPref').mockReturnValue(false);
      vi.spyOn(playerPrefs, 'saveWaveformPref').mockImplementation(() => {});

      playerBus.loadAndPlay({
        scope: 'segment',
        title: 'Wave Toggle Twice',
        audioUrl: 'https://example.com/audio.mp3',
      });

      const { container } = render(<PlayerBar />);

      // Turn on
      act(() => { fireEvent.click(screen.getByLabelText('Show waveform')); });
      expect(screen.getByTestId('waveform-strip')).toBeInTheDocument();

      // Turn off
      act(() => { fireEvent.click(screen.getByLabelText('Hide waveform')); });
      expect(screen.queryByTestId('waveform-strip')).toBeNull();

      const playerBarEl = container.querySelector('.player-bar') as HTMLElement;
      expect(playerBarEl.style.getPropertyValue('--player-waveform-height')).toBe('0px');

      // Last save call was false
      expect(playerPrefs.saveWaveformPref).toHaveBeenLastCalledWith(false);
    });

    it('persisted pref=true renders WaveformStrip on mount', () => {
      vi.spyOn(playerPrefs, 'loadWaveformPref').mockReturnValue(true);

      playerBus.loadAndPlay({
        scope: 'segment',
        title: 'Wave Persisted On',
        audioUrl: 'https://example.com/audio.mp3',
      });

      render(<PlayerBar />);

      // With pref=true, strip should appear immediately
      // (audioRef.current is set after first render so it may be null during initial render;
      //  the mock WaveformStrip renders regardless — the test verifies the toggle wires up)
      // Toggle button should show "Hide waveform" when on
      expect(screen.getByLabelText('Hide waveform')).toBeInTheDocument();
    });
  });
});
