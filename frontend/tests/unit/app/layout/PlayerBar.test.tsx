import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerBar } from '@/app/layout/PlayerBar';
import * as playerBus from '@/store/playerBus';

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
    // Chapter scope renders the plain slider (segment scope uses the waveform).
    playerBus.loadAndPlay({
      scope: 'chapter',
      title: 'Chapter 1',
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
  // Waveform — representation follows scope (U16)
  // -------------------------------------------------------------------------

  describe('Waveform follows scope (U16)', () => {
    it('segment scope renders the inline WaveformStrip as the scrub track (no slider)', () => {
      playerBus.loadAndPlay({
        scope: 'segment',
        title: 'Segment audio',
        audioUrl: 'https://example.com/seg.mp3',
      });

      render(<PlayerBar />);

      // The waveform is the scrub surface in segment scope...
      expect(screen.getByTestId('waveform-strip')).toBeInTheDocument();
      // ...and there is no plain range slider.
      expect(screen.queryByRole('slider')).toBeNull();
    });

    it('chapter scope renders a plain seek slider and no waveform', () => {
      playerBus.loadAndPlay({
        scope: 'chapter',
        title: 'Chapter audio',
        audioUrl: 'https://example.com/chapter.wav',
      });

      render(<PlayerBar />);

      expect(screen.getByRole('slider')).toBeInTheDocument();
      expect(screen.queryByTestId('waveform-strip')).toBeNull();
    });

    it('representation defaults to scope but the toggle flips segment waveform → bar', () => {
      playerBus.loadAndPlay({
        scope: 'segment',
        title: 'Flip Seg',
        audioUrl: 'https://example.com/seg.mp3',
      });

      render(<PlayerBar />);

      // Default for segment scope: waveform shown; toggle offers "Show progress bar".
      expect(screen.getByTestId('waveform-strip')).toBeInTheDocument();
      const toggle = screen.getByLabelText('Show progress bar');

      act(() => { fireEvent.click(toggle); });

      // After flip: slider shown, waveform gone, toggle now offers "Show waveform".
      expect(screen.queryByTestId('waveform-strip')).toBeNull();
      expect(screen.getByRole('slider')).toBeInTheDocument();
      expect(screen.getByLabelText('Show waveform')).toBeInTheDocument();
    });

    it('representation defaults to scope but the toggle flips chapter bar → waveform', () => {
      playerBus.loadAndPlay({
        scope: 'chapter',
        title: 'Flip Chap',
        audioUrl: 'https://example.com/chapter.wav',
      });

      render(<PlayerBar />);

      // Default for chapter scope: slider shown; toggle offers "Show waveform".
      expect(screen.getByRole('slider')).toBeInTheDocument();
      const toggle = screen.getByLabelText('Show waveform');

      act(() => { fireEvent.click(toggle); });

      // After flip: waveform shown, slider gone.
      expect(screen.getByTestId('waveform-strip')).toBeInTheDocument();
      expect(screen.queryByRole('slider')).toBeNull();
    });

    it('preview scope renders the plain slider (only segment uses the waveform)', () => {
      playerBus.loadAndPlay({
        scope: 'preview',
        title: 'Voice preview',
        audioUrl: 'https://example.com/preview.mp3',
      });

      render(<PlayerBar />);

      expect(screen.getByRole('slider')).toBeInTheDocument();
      expect(screen.queryByTestId('waveform-strip')).toBeNull();
    });
  });
});
