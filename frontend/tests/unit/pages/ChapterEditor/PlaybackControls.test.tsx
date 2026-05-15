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
    currentLabel: 'Test Segment'
  };

  it('renders all controls', () => {
    render(<PlaybackControls {...defaultProps} />);
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
    expect(screen.getByLabelText('Stop')).toBeInTheDocument();
    expect(screen.getByLabelText('Previous Segment')).toBeInTheDocument();
    expect(screen.getByLabelText('Next Segment')).toBeInTheDocument();
  });

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
});
