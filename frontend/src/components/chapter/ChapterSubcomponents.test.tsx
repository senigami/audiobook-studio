import { render, screen, fireEvent, within } from '@testing-library/react';
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
    });

    it('triggers bulk assign when a character is selected', () => {
      const onBulkAssign = vi.fn();
      render(
        <ProductionTab 
          paragraphGroups={mockGroups} 
          characters={mockCharacters} 
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
      fireEvent.click(screen.getByRole('button', { name: /listen/i }));
      expect(onPlay).toHaveBeenCalledWith('seg-1', ['seg-1']);
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

    it('stays at zero until active segment progress arrives', () => {
      const activeJob = {
        id: 'job-1',
        status: 'running',
        active_segment_id: null,
        active_segment_progress: undefined,
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
      expect(within(activeCard as HTMLElement).getAllByText('0%').length).toBeGreaterThan(0);
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
  });
});
