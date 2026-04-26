import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PerformanceTab } from './PerformanceTab';
import { mockSegments, mockCharacters, mockChunkGroups } from './PerformanceTabTestMocks';

describe('PerformanceTab - Rendering', () => {
  it('renders and handles playback', () => {
    const onPlay = vi.fn();
    render(
      <PerformanceTab 
        chunkGroups={mockChunkGroups} 
        characters={mockCharacters} 
        playingSegmentId={null} 
        playbackQueue={['seg-1']} 
        generatingSegmentIds={new Set()} 
        allSegmentIds={['seg-1']} 
        segments={mockSegments} 
        onPlay={onPlay} 
        onStop={vi.fn()} 
        onGenerate={vi.fn()} 
      />
    );

    expect(screen.getByText('Sentence one.')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /listen/i }));
    expect(onPlay).toHaveBeenCalledWith('seg-1', ['seg-1']);
  });

  it('starts listen playback from the selected block instead of the chapter start', () => {
    const onPlay = vi.fn();
    render(
      <PerformanceTab
        chunkGroups={[
          { characterId: 'char-1', engine: 'xtts', segments: [mockSegments[0]] },
          { characterId: null, engine: 'xtts', segments: [mockSegments[1]] }
        ] as any}
        characters={mockCharacters}
        playingSegmentId={null}
        playbackQueue={['seg-1', 'seg-2']}
        generatingSegmentIds={new Set()}
        allSegmentIds={['seg-1', 'seg-2']}
        segments={mockSegments}
        onPlay={onPlay}
        onStop={vi.fn()}
        onGenerate={vi.fn()}
      />
    );

    const listenButtons = screen.getAllByRole('button', { name: /listen/i });
    fireEvent.click(listenButtons[1]);
    expect(onPlay).toHaveBeenCalledWith('seg-2', ['seg-2']);
  });

  it('falls back to the clicked segment when the queue list is temporarily out of sync', () => {
    const onPlay = vi.fn();
    render(
      <PerformanceTab
        chunkGroups={[
          { characterId: null, engine: 'xtts', segments: [mockSegments[1]] }
        ] as any}
        characters={mockCharacters}
        playingSegmentId={null}
        playbackQueue={[]}
        generatingSegmentIds={new Set()}
        allSegmentIds={['seg-missing']}
        segments={mockSegments}
        onPlay={onPlay}
        onStop={vi.fn()}
        onGenerate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /listen/i }));
    expect(onPlay).toHaveBeenCalledWith('seg-2', ['seg-2']);
  });
});
