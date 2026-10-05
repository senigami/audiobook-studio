import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlaybackControls } from '@/pages/ChapterEditor/components/PlaybackControls';

describe('PlaybackControls Component', () => {
  const defaultProps = {
    isPlaying: false,
    isPaused: false,
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onStop: vi.fn(),
    onPrev: vi.fn(),
    onNext: vi.fn(),
    hasPrev: true,
    hasNext: true,
    activeLabel: 'Test Segment'
  };

  it('shows Play when not playing', () => {
    render(<PlaybackControls {...defaultProps} isPlaying={false} />);
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
    expect(screen.queryByText('Play')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Pause')).not.toBeInTheDocument();
  });

  it('shows Pause when playing and not paused', () => {
    render(<PlaybackControls {...defaultProps} isPlaying={true} isPaused={false} />);
    expect(screen.getByLabelText('Pause')).toBeInTheDocument();
    expect(screen.queryByText('Pause')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Play')).not.toBeInTheDocument();
  });

  it('shows Play when playing and paused', () => {
    render(<PlaybackControls {...defaultProps} isPlaying={true} isPaused={true} />);
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
  });

  it('disables Prev when hasPrev is false', () => {
    render(<PlaybackControls {...defaultProps} hasPrev={false} />);
    expect(screen.getByLabelText('Previous Segment')).toBeDisabled();
  });

  it('disables Next when hasNext is false', () => {
    render(<PlaybackControls {...defaultProps} hasNext={false} />);
    expect(screen.getByLabelText('Next Segment')).toBeDisabled();
  });

  it('disables Stop when not playing', () => {
    render(<PlaybackControls {...defaultProps} isPlaying={false} />);
    expect(screen.getByLabelText('Stop')).toBeDisabled();
  });

  it('calls handlers correctly', () => {
    const onPlay = vi.fn();
    const onPause = vi.fn();
    const onStop = vi.fn();
    const onPrev = vi.fn();
    const onNext = vi.fn();

    const { rerender } = render(
      <PlaybackControls
        {...defaultProps}
        onPlay={onPlay}
        onPause={onPause}
        onStop={onStop}
        onPrev={onPrev}
        onNext={onNext}
        isPlaying={false}
      />
    );

    fireEvent.click(screen.getByLabelText('Play'));
    expect(onPlay).toHaveBeenCalled();

    rerender(
      <PlaybackControls
        {...defaultProps}
        onPlay={onPlay}
        onPause={onPause}
        onStop={onStop}
        onPrev={onPrev}
        onNext={onNext}
        isPlaying={true}
        isPaused={false}
      />
    );

    fireEvent.click(screen.getByLabelText('Pause'));
    expect(onPause).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Stop'));
    expect(onStop).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Previous Segment'));
    expect(onPrev).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Next Segment'));
    expect(onNext).toHaveBeenCalled();
  });

  it('triggers skim handlers', () => {
    const onSkimStart = vi.fn();
    const onSkimStop = vi.fn();
    render(
      <PlaybackControls
        {...defaultProps}
        isPlaying={true}
        onSkimStart={onSkimStart}
        onSkimStop={onSkimStop}
      />
    );

    const forward = screen.getByLabelText('Skim Forward');
    fireEvent.pointerDown(forward);
    expect(onSkimStart).toHaveBeenCalledWith('forward');

    fireEvent.pointerUp(forward);
    expect(onSkimStop).toHaveBeenCalled();

    const backward = screen.getByLabelText('Skim Backward');
    fireEvent.pointerDown(backward);
    expect(onSkimStart).toHaveBeenCalledWith('backward');

    fireEvent.pointerLeave(backward);
    expect(onSkimStop).toHaveBeenCalled();
  });

  it('renders seek bar and time labels when playing', () => {
    render(
      <PlaybackControls
        {...defaultProps}
        isPlaying={true}
        currentTime={125.5}
        duration={300}
        activeLabel="Speaker A: Hello world"
      />
    );

    expect(screen.getByText('2:05')).toBeInTheDocument(); // 125.5s
    expect(screen.getByText('5:00')).toBeInTheDocument(); // 300s
    expect(screen.getByText('Speaker A: Hello world')).toBeInTheDocument();
    expect(screen.getByLabelText('Seek')).toBeInTheDocument();
    expect(screen.getByLabelText('Seek')).toHaveValue('125.5');
  });

  it('calls onSeek when slider changes', () => {
    const onSeek = vi.fn();
    render(
      <PlaybackControls
        {...defaultProps}
        isPlaying={true}
        currentTime={0}
        duration={100}
        onSeek={onSeek}
      />
    );

    const slider = screen.getByLabelText('Seek');
    fireEvent.change(slider, { target: { value: '50' } });
    expect(onSeek).toHaveBeenCalledWith(50);
  });
});
