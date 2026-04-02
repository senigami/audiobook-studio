import { act, render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ProductionTab } from './ProductionTab';
import { PerformanceTab } from './PerformanceTab';
import { CharacterSidebar } from './CharacterSidebar';
import type { ChapterSegment, Character, SpeakerProfile } from '../../types';

describe('Chapter Subcomponents', () => {
  const mockSegments: ChapterSegment[] = [
    { 
      id: 'seg-1', 
      chapter_id: 'chap-1', 
      text_content: 'Sentence one.', 
      segment_order: 0, 
      audio_status: 'unprocessed',
      character_id: 'char-1',
      speaker_profile_name: 'Profile 1',
      audio_file_path: '',
      audio_generated_at: 0
    },
    { 
      id: 'seg-2', 
      chapter_id: 'chap-1', 
      text_content: 'Sentence two.', 
      segment_order: 1, 
      audio_status: 'done',
      character_id: null,
      speaker_profile_name: 'Narrator',
      audio_file_path: '/audio/2.wav',
      audio_generated_at: 1000
    }
  ];

  const mockCharacters: Character[] = [
    { id: 'char-1', project_id: 'proj-1', name: 'Char 1', color: '#ff0000', speaker_profile_name: 'Voice 1' } as any
  ];

  const mockProfiles: SpeakerProfile[] = [
    { name: 'Profile 1', speaker_id: 'speaker-1', variant_name: 'Standard', voice_id: 'v1', provider: 'elevenlabs' } as any,
    { name: 'Profile 2', speaker_id: 'speaker-1', variant_name: 'Warm', voice_id: 'v2', provider: 'elevenlabs' } as any
  ];

  const mockSpeakers = [
    { id: 'speaker-1', name: 'Voice 1' }
  ];

  describe('ProductionTab', () => {
    const mockGroups = [
      { characterId: 'char-1', segments: [mockSegments[0]] },
      { characterId: null, segments: [mockSegments[1]] }
    ];

    it('renders segments grouped by paragraph/character', () => {
      render(
        <ProductionTab 
          paragraphGroups={mockGroups} 
          characters={mockCharacters} 
          speakerProfiles={mockProfiles} 
          selectedCharacterId={null} 
          hoveredSegmentId={null} 
          setHoveredSegmentId={vi.fn()} 
          activeSegmentId={null} 
          setActiveSegmentId={vi.fn()} 
          onBulkAssign={vi.fn()} 
          onBulkReset={vi.fn()} 
          segmentsCount={2} 
        />
      );

      expect(screen.getByText('Sentence one.')).toBeInTheDocument();
      expect(screen.getByText('Sentence two.')).toBeInTheDocument();
      expect(screen.getByText('Char 1')).toBeInTheDocument();
      expect(screen.getByText('NARRATOR')).toBeInTheDocument();
      expect(screen.getByText('Standard')).toBeInTheDocument();
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('#2')).toBeInTheDocument();
    });

    it('triggers bulk assign when a character is selected', () => {
      const onBulkAssign = vi.fn();
      render(
        <ProductionTab 
          paragraphGroups={mockGroups} 
          characters={mockCharacters} 
          speakerProfiles={mockProfiles} 
          selectedCharacterId="char-1" 
          hoveredSegmentId={null} 
          setHoveredSegmentId={vi.fn()} 
          activeSegmentId={null} 
          setActiveSegmentId={vi.fn()} 
          onBulkAssign={onBulkAssign} 
          onBulkReset={vi.fn()} 
          segmentsCount={2} 
        />
      );

      fireEvent.click(screen.getByText('Sentence two.').parentElement!);
      expect(onBulkAssign).toHaveBeenCalledWith(['seg-2']);
    });
  });

  describe('PerformanceTab', () => {
    const mockChunkGroups = [
      { characterId: 'char-1', segments: [mockSegments[0]] }
    ];

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

    it('highlights only the active segment group for a live job', () => {
      const activeJob = {
        id: 'job-1',
        status: 'running',
        active_segment_id: 'seg-2',
        active_segment_progress: 0.5
      } as any;

      render(
        <>
          <PerformanceTab 
            chunkGroups={[
              { characterId: 'char-1', segments: [mockSegments[0]] },
              { characterId: null, segments: [mockSegments[1]] }
            ]} 
            characters={mockCharacters} 
            playingSegmentId={null} 
            playbackQueue={['seg-1', 'seg-2']} 
            generatingSegmentIds={new Set()} 
            allSegmentIds={['seg-1', 'seg-2']} 
            segments={mockSegments} 
            onPlay={vi.fn()} 
            onStop={vi.fn()} 
            onGenerate={vi.fn()} 
            generatingJob={activeJob}
            segmentProgress={{
              'seg-2': { job_id: 'job-1', segment_id: 'seg-2', progress: 0.5 }
            } as any}
          />
        </>
      );

      const activeCard = screen.getByText('Sentence two.').closest('div[style*="background: var(--surface)"]');
      const inactiveCard = screen.getByText('Sentence one.').closest('div[style*="background: var(--surface)"]');

      expect(activeCard).toBeTruthy();
      expect(inactiveCard).toBeTruthy();
      expect(within(activeCard as HTMLElement).getAllByText('50%').length).toBeGreaterThan(0);
      expect(within(inactiveCard as HTMLElement).queryByText('50%')).toBeNull();
    });

    it('falls back to learned job progress until active segment progress arrives', () => {
      const activeJob = {
        id: 'job-1',
        status: 'running',
        engine: 'xtts',
        active_segment_id: null,
        active_segment_progress: undefined,
        started_at: Date.now() / 1000 - 20,
        eta_seconds: 100,
        progress: 0.72
      } as any;

      render(
        <PerformanceTab 
          chunkGroups={[
            { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'unprocessed' }] },
            { characterId: null, segments: [mockSegments[1]] }
          ]} 
          characters={mockCharacters} 
          playingSegmentId={null} 
          playbackQueue={['seg-1', 'seg-2']} 
          generatingSegmentIds={new Set()} 
          allSegmentIds={['seg-1', 'seg-2']} 
          segments={mockSegments} 
          onPlay={vi.fn()} 
          onStop={vi.fn()} 
          onGenerate={vi.fn()} 
          generatingJob={activeJob}
        />
      );

      const activeCard = screen.getByText('Sentence one.').closest('div[style*="background: var(--surface)"]');
      expect(activeCard).toBeTruthy();
      expect(within(activeCard as HTMLElement).getByText('72%')).toBeInTheDocument();
      expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '72');
    });

    it('does not use chapter/job prediction for a mixed-engine segment once an active segment is known', () => {
      const activeJob = {
        id: 'job-mixed-1',
        status: 'running',
        engine: 'mixed',
        active_segment_id: 'seg-1',
        active_segment_progress: 0,
        started_at: Date.now() / 1000 - 20,
        eta_seconds: 100,
        progress: 0.72
      } as any;

      render(
        <PerformanceTab
          chunkGroups={[
            { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'processing' }] },
            { characterId: null, segments: [mockSegments[1]] }
          ]}
          characters={mockCharacters}
          playingSegmentId={null}
          playbackQueue={['seg-1', 'seg-2']}
          generatingSegmentIds={new Set(['seg-1'])}
          allSegmentIds={['seg-1', 'seg-2']}
          segments={mockSegments}
          onPlay={vi.fn()}
          onStop={vi.fn()}
          onGenerate={vi.fn()}
          generatingJob={activeJob}
          segmentProgress={{} as any}
        />
      );

      const activeCard = screen.getByText('Sentence one.').closest('div[style*="background: var(--surface)"]');
      expect(activeCard).toBeTruthy();
      expect(within(activeCard as HTMLElement).queryByText('72%')).toBeNull();
      expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '0');
      expect(within(activeCard as HTMLElement).getByText('0%')).toBeInTheDocument();
    });

    it('shows a determinate progress bar for running mixed segment jobs even before the first nonzero checkpoint', () => {
      vi.useFakeTimers();
      const activeJob = {
        id: 'job-mixed-2',
        status: 'running',
        engine: 'mixed',
        active_segment_id: 'seg-1',
        active_segment_progress: 0,
        started_at: Date.now() / 1000 - 5,
        eta_seconds: 57,
        progress: 0.05
      } as any;

      render(
        <PerformanceTab
          chunkGroups={[
            { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'processing' }] }
          ]}
          characters={mockCharacters}
          playingSegmentId={null}
          playbackQueue={['seg-1']}
          generatingSegmentIds={new Set(['seg-1'])}
          allSegmentIds={['seg-1']}
          segments={mockSegments}
          onPlay={vi.fn()}
          onStop={vi.fn()}
          onGenerate={vi.fn()}
          generatingJob={activeJob}
          segmentProgress={{} as any}
        />
      );

      expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '0');
      expect(screen.queryByText('Working...')).toBeNull();

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(Number(screen.getByTestId('performance-progress-0').getAttribute('data-progress'))).toBeGreaterThan(0);
      vi.useRealTimers();
    });

    it('shows Voxtral jobs as indeterminate while running instead of predictive percentages', () => {
      const activeJob = {
        id: 'job-vox-1',
        status: 'running',
        engine: 'voxtral',
        active_segment_id: null,
        active_segment_progress: undefined,
        started_at: Date.now() / 1000 - 20,
        eta_seconds: 100,
        progress: 1
      } as any;

      render(
        <PerformanceTab
          chunkGroups={[
            { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'unprocessed' }] }
          ]}
          characters={mockCharacters}
          playingSegmentId={null}
          playbackQueue={['seg-1']}
          generatingSegmentIds={new Set()}
          allSegmentIds={['seg-1']}
          segments={mockSegments}
          onPlay={vi.fn()}
          onStop={vi.fn()}
          onGenerate={vi.fn()}
          generatingJob={activeJob}
        />
      );

      expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '0');
      expect(screen.queryByText('100%')).toBeNull();
    });

    it('shows mixed segment jobs as determinate progress when real segment progress is present', () => {
      const activeJob = {
        id: 'job-mixed-seg-1',
        status: 'running',
        engine: 'mixed',
        segment_ids: ['seg-1', 'seg-2'],
        active_segment_id: 'seg-1',
        active_segment_progress: 0.2,
        started_at: Date.now() / 1000 - 20,
        eta_seconds: 100,
        progress: 0.05,
        custom_title: 'Chapter 1: segment #3'
      } as any;

      render(
        <PerformanceTab
          chunkGroups={[
            { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'unprocessed' }] }
          ]}
          characters={mockCharacters}
          playingSegmentId={null}
          playbackQueue={['seg-1']}
          generatingSegmentIds={new Set(['seg-1'])}
          allSegmentIds={['seg-1']}
          segments={mockSegments}
          onPlay={vi.fn()}
          onStop={vi.fn()}
          onGenerate={vi.fn()}
          generatingJob={activeJob}
        />
      );

      expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '20');
      expect(screen.getByText('20%')).toBeInTheDocument();
      expect(screen.queryByText('Working...')).toBeNull();
    });

    it('uses render-group weights to predict active mixed segment progress between sparse checkpoints', () => {
      vi.useFakeTimers();
      try {
        const activeJob = {
          id: 'job-mixed-weighted-1',
          status: 'running',
          engine: 'mixed',
          active_segment_id: 'seg-1',
          active_segment_progress: 0.1,
          started_at: Date.now() / 1000 - 40,
          eta_seconds: 100,
          progress: 0.37,
          total_render_weight: 100,
          completed_render_weight: 20,
          active_render_group_weight: 40
        } as any;

        render(
          <PerformanceTab
            chunkGroups={[
              { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'processing' }] }
            ]}
            characters={mockCharacters}
            playingSegmentId={null}
            playbackQueue={['seg-1']}
            generatingSegmentIds={new Set(['seg-1'])}
            allSegmentIds={['seg-1']}
            segments={mockSegments}
            onPlay={vi.fn()}
            onStop={vi.fn()}
            onGenerate={vi.fn()}
            generatingJob={activeJob}
            segmentProgress={{} as any}
          />
        );

        expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '50');
        expect(screen.getByText('50%')).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('treats backend mixed segment checkpoints as a floor over weighted prediction', () => {
      vi.useFakeTimers();
      try {
        const activeJob = {
          id: 'job-mixed-weighted-floor',
          status: 'running',
          engine: 'mixed',
          active_segment_id: 'seg-1',
          active_segment_progress: 0.75,
          started_at: Date.now() / 1000 - 25,
          eta_seconds: 100,
          progress: 0.37,
          total_render_weight: 100,
          completed_render_weight: 20,
          active_render_group_weight: 40
        } as any;

        render(
          <PerformanceTab
            chunkGroups={[
              { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'processing' }] }
            ]}
            characters={mockCharacters}
            playingSegmentId={null}
            playbackQueue={['seg-1']}
            generatingSegmentIds={new Set(['seg-1'])}
            allSegmentIds={['seg-1']}
            segments={mockSegments}
            onPlay={vi.fn()}
            onStop={vi.fn()}
            onGenerate={vi.fn()}
            generatingJob={activeJob}
            segmentProgress={{} as any}
          />
        );

        expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '75');
        expect(screen.getByText('75%')).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('pins Voxtral jobs at 100% while finalizing', () => {
      const activeJob = {
        id: 'job-vox-2',
        status: 'finalizing',
        engine: 'voxtral',
        active_segment_id: null,
        active_segment_progress: undefined
      } as any;

      render(
        <PerformanceTab
          chunkGroups={[
            { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'unprocessed' }] }
          ]}
          characters={mockCharacters}
          playingSegmentId={null}
          playbackQueue={['seg-1']}
          generatingSegmentIds={new Set()}
          allSegmentIds={['seg-1']}
          segments={mockSegments}
          onPlay={vi.fn()}
          onStop={vi.fn()}
          onGenerate={vi.fn()}
          generatingJob={activeJob}
        />
      );

      expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '100');
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('lets a completed segment linger at 100% before clearing when the job advances', () => {
      vi.useFakeTimers();
      try {
        const { rerender } = render(
          <PerformanceTab
            chunkGroups={[
              { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'processing' }] },
              { characterId: null, segments: [mockSegments[1]] }
            ]}
            characters={mockCharacters}
            playingSegmentId={null}
            playbackQueue={['seg-1', 'seg-2']}
            generatingSegmentIds={new Set()}
            allSegmentIds={['seg-1', 'seg-2']}
            segments={mockSegments}
            onPlay={vi.fn()}
            onStop={vi.fn()}
            onGenerate={vi.fn()}
            generatingJob={{
              id: 'job-1',
              status: 'running',
              active_segment_id: 'seg-1',
              active_segment_progress: 0.92
            } as any}
          />
        );

        expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '92');

        rerender(
          <PerformanceTab
            chunkGroups={[
              { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'done' }] },
              { characterId: null, segments: [{ ...mockSegments[1], audio_status: 'processing' }] }
            ]}
            characters={mockCharacters}
            playingSegmentId={null}
            playbackQueue={['seg-1', 'seg-2']}
            generatingSegmentIds={new Set()}
            allSegmentIds={['seg-1', 'seg-2']}
            segments={mockSegments}
            onPlay={vi.fn()}
            onStop={vi.fn()}
            onGenerate={vi.fn()}
            generatingJob={{
              id: 'job-1',
              status: 'running',
              active_segment_id: 'seg-2',
              active_segment_progress: 0.08
            } as any}
          />
        );

        expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '100');

        act(() => {
          vi.advanceTimersByTime(700);
        });

        expect(screen.queryByTestId('performance-progress-0')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not reuse a stale 100% settle state when a new local generate starts', () => {
      vi.useFakeTimers();
      try {
        const { rerender } = render(
          <PerformanceTab
            chunkGroups={[
              { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'processing' }] },
              { characterId: null, segments: [mockSegments[1]] }
            ]}
            characters={mockCharacters}
            playingSegmentId={null}
            playbackQueue={['seg-1', 'seg-2']}
            generatingSegmentIds={new Set()}
            allSegmentIds={['seg-1', 'seg-2']}
            segments={mockSegments}
            onPlay={vi.fn()}
            onStop={vi.fn()}
            onGenerate={vi.fn()}
            generatingJob={{
              id: 'job-1',
              status: 'running',
              active_segment_id: 'seg-1',
              active_segment_progress: 0.95
            } as any}
          />
        );

        rerender(
          <PerformanceTab
            chunkGroups={[
              { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'done', audio_file_path: '/audio/1.wav' }] },
              { characterId: null, segments: [{ ...mockSegments[1], audio_status: 'processing' }] }
            ]}
            characters={mockCharacters}
            playingSegmentId={null}
            playbackQueue={['seg-1', 'seg-2']}
            generatingSegmentIds={new Set()}
            allSegmentIds={['seg-1', 'seg-2']}
            segments={mockSegments}
            onPlay={vi.fn()}
            onStop={vi.fn()}
            onGenerate={vi.fn()}
            generatingJob={{
              id: 'job-1',
              status: 'running',
              active_segment_id: 'seg-2',
              active_segment_progress: 0.08
            } as any}
          />
        );

        expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '100');

        rerender(
          <PerformanceTab
            chunkGroups={[
              { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'processing' }] },
              { characterId: null, segments: [mockSegments[1]] }
            ]}
            characters={mockCharacters}
            playingSegmentId={null}
            playbackQueue={['seg-1', 'seg-2']}
            generatingSegmentIds={new Set(['seg-1'])}
            allSegmentIds={['seg-1', 'seg-2']}
            segments={mockSegments}
            onPlay={vi.fn()}
            onStop={vi.fn()}
            onGenerate={vi.fn()}
          />
        );

        expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '0');
        expect(screen.getByText('Working...')).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('shows a moving partial bar during indeterminate work instead of a full-width fill', () => {
      render(
        <PerformanceTab
          chunkGroups={[
            { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'processing' }] }
          ]}
          characters={mockCharacters}
          playingSegmentId={null}
          playbackQueue={['seg-1']}
          generatingSegmentIds={new Set(['seg-1'])}
          allSegmentIds={['seg-1']}
          segments={mockSegments}
          onPlay={vi.fn()}
          onStop={vi.fn()}
          onGenerate={vi.fn()}
          generatingJob={{
            id: 'job-queued',
            status: 'queued',
            progress: 0,
            active_segment_id: null,
            active_segment_progress: 0
          } as any}
        />
      );

      expect(screen.getByText('Working...')).toBeInTheDocument();
      expect(screen.getByTestId('performance-progress-0')).toHaveAttribute('data-progress', '0');
      expect(screen.getByTestId('performance-progress-0')).toHaveStyle({ width: '28%' });
      expect(screen.getByTestId('performance-progress-0')).toHaveClass('progress-bar-pending');
    });

    it('keeps sibling queued groups visibly queued instead of reverting to generate', () => {
      render(
        <PerformanceTab
          chunkGroups={[
            { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'unprocessed' }] },
            { characterId: null, segments: [{ ...mockSegments[1], audio_status: 'processing' }] }
          ]}
          characters={mockCharacters}
          playingSegmentId={null}
          playbackQueue={['seg-1', 'seg-2']}
          generatingSegmentIds={new Set()}
          queuedSegmentIds={new Set(['seg-1'])}
          allSegmentIds={['seg-1', 'seg-2']}
          segments={mockSegments}
          onPlay={vi.fn()}
          onStop={vi.fn()}
          onGenerate={vi.fn()}
          generatingJob={{
            id: 'job-running',
            status: 'running',
            segment_ids: ['seg-2'],
            active_segment_id: 'seg-2',
            active_segment_progress: 0.5
          } as any}
        />
      );

      expect(screen.getByText('Queued')).toBeInTheDocument();
      expect(screen.queryByText('Generate')).toBeNull();
    });

    it('keeps a live chapter-level job visibly attached even when all groups were already done', () => {
      render(
        <PerformanceTab
          chunkGroups={[
            { characterId: 'char-1', segments: [{ ...mockSegments[0], audio_status: 'done', audio_file_path: 'seg-1.wav' }] },
            { characterId: null, segments: [{ ...mockSegments[1], audio_status: 'done', audio_file_path: 'seg-2.wav' }] }
          ]}
          characters={mockCharacters}
          playingSegmentId={null}
          playbackQueue={['seg-1', 'seg-2']}
          generatingSegmentIds={new Set()}
          allSegmentIds={['seg-1', 'seg-2']}
          segments={[
            { ...mockSegments[0], audio_status: 'done', audio_file_path: 'seg-1.wav' } as any,
            { ...mockSegments[1], audio_status: 'done', audio_file_path: 'seg-2.wav' } as any
          ]}
          onPlay={vi.fn()}
          onStop={vi.fn()}
          onGenerate={vi.fn()}
          generatingJob={{
            id: 'job-voxtral',
            status: 'preparing',
            progress: 0,
            active_segment_id: null,
            active_segment_progress: 0
          } as any}
        />
      );

      expect(screen.getByText('Working...')).toBeInTheDocument();
      expect(screen.getByTestId('performance-progress-0')).toBeInTheDocument();
    });
  });

  describe('CharacterSidebar', () => {
    it('renders characters and narrator options', () => {
      const setSelectedCharacterId = vi.fn();
      render(
        <CharacterSidebar 
          characters={mockCharacters} 
          speakers={mockSpeakers as any} 
          speakerProfiles={mockProfiles} 
          selectedCharacterId={null} 
          setSelectedCharacterId={setSelectedCharacterId} 
          selectedProfileName={null} 
          setSelectedProfileName={vi.fn()} 
          expandedCharacterId={null} 
          setExpandedCharacterId={vi.fn()} 
          onUpdateCharacterColor={vi.fn()} 
          segmentsCount={2} 
          wordCount={10} 
        />
      );

      expect(screen.getByText('Char 1')).toBeInTheDocument();
      expect(screen.getByText('None / Default')).toBeInTheDocument();
      
      // Click the character name - the parent div should handle the click
      fireEvent.click(screen.getByText('Char 1').parentElement!);
      expect(setSelectedCharacterId).toHaveBeenCalledWith('char-1');
    });

    it('defaults to the first variant when a character is selected', () => {
      const setSelectedCharacterId = vi.fn();
      const setSelectedProfileName = vi.fn();
      render(
        <CharacterSidebar
          characters={mockCharacters}
          speakers={mockSpeakers as any}
          speakerProfiles={mockProfiles}
          selectedCharacterId={null}
          setSelectedCharacterId={setSelectedCharacterId}
          selectedProfileName={null}
          setSelectedProfileName={setSelectedProfileName}
          expandedCharacterId={null}
          setExpandedCharacterId={vi.fn()}
          onUpdateCharacterColor={vi.fn()}
          segmentsCount={2}
          wordCount={10}
        />
      );

      fireEvent.click(screen.getByText('Char 1').parentElement!);
      expect(setSelectedCharacterId).toHaveBeenCalledWith('char-1');
      expect(setSelectedProfileName).toHaveBeenCalledWith('Profile 1');
    });

    it('shows the variant display name when a variant is selected', () => {
      render(
        <CharacterSidebar
          characters={mockCharacters}
          speakers={mockSpeakers as any}
          speakerProfiles={mockProfiles}
          selectedCharacterId="char-1"
          setSelectedCharacterId={vi.fn()}
          selectedProfileName="Profile 1"
          setSelectedProfileName={vi.fn()}
          expandedCharacterId={null}
          setExpandedCharacterId={vi.fn()}
          onUpdateCharacterColor={vi.fn()}
          segmentsCount={2}
          wordCount={10}
        />
      );

      expect(screen.getByText('Standard')).toBeInTheDocument();
    });

    it('falls back to the suffix of the folder name when variant metadata is missing', () => {
      const setSelectedCharacterId = vi.fn();
      render(
        <CharacterSidebar
          characters={mockCharacters}
          speakers={mockSpeakers as any}
          speakerProfiles={[{ name: 'Voice 1 - Angry', speaker_id: 'speaker-1', variant_name: null, voice_id: 'v1', provider: 'elevenlabs' } as any]}
          selectedCharacterId="char-1"
          setSelectedCharacterId={setSelectedCharacterId}
          selectedProfileName="Voice 1 - Angry"
          setSelectedProfileName={vi.fn()}
          expandedCharacterId={null}
          setExpandedCharacterId={vi.fn()}
          onUpdateCharacterColor={vi.fn()}
          segmentsCount={2}
          wordCount={10}
        />
      );

      expect(screen.getByText('Angry')).toBeInTheDocument();
    });

    it('shows Default when a profile has no variant suffix', () => {
      render(
        <CharacterSidebar
          characters={mockCharacters}
          speakers={mockSpeakers as any}
          speakerProfiles={[{ name: 'Voice 1', speaker_id: 'speaker-1', variant_name: null, voice_id: 'v1', provider: 'elevenlabs' } as any]}
          selectedCharacterId="char-1"
          setSelectedCharacterId={vi.fn()}
          selectedProfileName="Voice 1"
          setSelectedProfileName={vi.fn()}
          expandedCharacterId={null}
          setExpandedCharacterId={vi.fn()}
          onUpdateCharacterColor={vi.fn()}
          segmentsCount={2}
          wordCount={10}
        />
      );

      expect(screen.getByText('Default')).toBeInTheDocument();
    });

    it('shows Default for a base profile without a suffix', () => {
      render(
        <CharacterSidebar
          characters={[{ id: 'char-base', project_id: 'proj-1', name: 'Base Char', color: '#00ff00', speaker_profile_name: 'Voice 1' } as any]}
          speakers={mockSpeakers as any}
          speakerProfiles={[{ name: 'Voice 1', speaker_id: 'speaker-1', variant_name: null, voice_id: 'v1', provider: 'elevenlabs' } as any]}
          selectedCharacterId={null}
          setSelectedCharacterId={vi.fn()}
          selectedProfileName={null}
          setSelectedProfileName={vi.fn()}
          expandedCharacterId={null}
          setExpandedCharacterId={vi.fn()}
          onUpdateCharacterColor={vi.fn()}
          segmentsCount={1}
          wordCount={10}
        />
      );

      expect(screen.getByText('Default')).toBeInTheDocument();
    });
  });
});
