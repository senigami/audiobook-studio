import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScriptView } from './ScriptView';
import type { ScriptViewResponse } from '../../types';

describe('ScriptView', () => {
  const mockData: ScriptViewResponse = {
    chapter_id: 'chap-1',
    base_revision_id: 'rev-1',
    paragraphs: [
      { id: 'p1', span_ids: ['s1', 's2'] },
      { id: 'p2', span_ids: ['s3'] }
    ],
    spans: [
      {
        id: 's1',
        order_index: 0,
        text: 'Sentence one.',
        sanitized_text: 'Sentence one.',
        character_id: 'char-1',
        speaker_profile_name: 'Voice 1',
        status: 'rendered',
        audio_file_path: 's1.wav',
        audio_generated_at: 1000,
        char_count: 13,
        sanitized_char_count: 13
      },
      {
        id: 's2',
        order_index: 1,
        text: 'Sentence two.',
        sanitized_text: 'Sentence two.',
        character_id: 'char-1',
        speaker_profile_name: 'Voice 1',
        status: 'draft',
        audio_file_path: null,
        audio_generated_at: null,
        char_count: 13,
        sanitized_char_count: 13
      },
      {
        id: 's3',
        order_index: 2,
        text: 'Different paragraph.',
        sanitized_text: 'Diff para.',
        character_id: null,
        speaker_profile_name: null,
        status: 'draft',
        audio_file_path: null,
        audio_generated_at: null,
        char_count: 20,
        sanitized_char_count: 10
      }
    ],
    render_batches: [
      { id: 'b1', span_ids: ['s1', 's2'], status: 'draft', estimated_work_weight: 1 }
    ]
  };

  const mockCharacters = [
    { id: 'char-1', name: 'Albus', color: '#ff0000', project_id: 'p1', speaker_profile_name: 'Voice 1' } as any
  ];

  const onGenerateBatch = vi.fn();
  const onPlaySpan = vi.fn();

  it('renders in Book mode by default', () => {
    render(
      <ScriptView 
        data={mockData} 
        characters={mockCharacters} 
        onGenerateBatch={onGenerateBatch} 
        pendingSpanIds={new Set()}
        onPlaySpan={onPlaySpan}
      />
    );

    expect(screen.getByText('Sentence one.')).toBeInTheDocument();
    expect(screen.getByText('Sentence two.')).toBeInTheDocument();
    expect(screen.getByText('Different paragraph.')).toBeInTheDocument();
    expect(screen.queryByText('Albus')).not.toBeInTheDocument(); // In book mode, speaker names are usually hidden (gutter only)
  });

  it('switches to Script mode and shows speaker names', () => {
    render(
      <ScriptView 
        data={mockData} 
        characters={mockCharacters} 
        onGenerateBatch={onGenerateBatch} 
        pendingSpanIds={new Set()}
        onPlaySpan={onPlaySpan}
      />
    );

    fireEvent.click(screen.getByText('Script'));
    expect(screen.getByText('Albus')).toBeInTheDocument();
    expect(screen.getByText('Narrator')).toBeInTheDocument();
  });

  it('toggles safe text overlay', () => {
    render(
      <ScriptView 
        data={mockData} 
        characters={mockCharacters} 
        onGenerateBatch={onGenerateBatch} 
        pendingSpanIds={new Set()}
        onPlaySpan={onPlaySpan}
      />
    );

    expect(screen.getByText('Different paragraph.')).toBeInTheDocument();
    expect(screen.queryByText('Diff para.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Toggle Safe Text'));
    expect(screen.queryByText('Different paragraph.')).not.toBeInTheDocument();
    expect(screen.getByText('Diff para.')).toBeInTheDocument();
  });

  it('highlights the playing span when playingSpanId is set', () => {
    render(
      <ScriptView
        data={mockData}
        characters={mockCharacters}
        onGenerateBatch={onGenerateBatch}
        pendingSpanIds={new Set()}
        playingSpanId="s2"
        onPlaySpan={onPlaySpan}
      />
    );

    expect(screen.getByText('Sentence two.').closest('.script-span')).toHaveClass('is-playing');
  });

  it('highlights all spans in the active playback batch', () => {
    render(
      <ScriptView
        data={mockData}
        characters={mockCharacters}
        onGenerateBatch={onGenerateBatch}
        pendingSpanIds={new Set()}
        playingSpanIds={new Set(['s1', 's2'])}
        onPlaySpan={onPlaySpan}
      />
    );

    expect(screen.getByText('Sentence one.').closest('.script-span')).toHaveClass('is-playing');
    expect(screen.getByText('Sentence two.').closest('.script-span')).toHaveClass('is-playing');
    expect(screen.getByText('Different paragraph.').closest('.script-span')).not.toHaveClass('is-playing');
  });

  it('toggles segment numbers', () => {
    render(
      <ScriptView 
        data={mockData} 
        characters={mockCharacters} 
        onGenerateBatch={onGenerateBatch} 
        pendingSpanIds={new Set()}
        onPlaySpan={onPlaySpan}
      />
    );

    expect(screen.queryByText('1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Toggle Segment Numbers'));
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('calls onGenerateBatch when generate button is clicked', () => {
    render(
      <ScriptView 
        data={mockData} 
        characters={mockCharacters} 
        onGenerateBatch={onGenerateBatch} 
        pendingSpanIds={new Set()}
        onPlaySpan={onPlaySpan}
      />
    );

    // Hover logic is hard to test in vitest/jsdom without specialized setup,
    // but we can query by role or title if available.
    const genButtons = screen.getAllByTitle(/Generate|Rebuild/);
    fireEvent.click(genButtons[0]);
    expect(onGenerateBatch).toHaveBeenCalledWith(['s1', 's2']);
  });

  it('calls onPlaySpan when play button is clicked', () => {
    render(
      <ScriptView 
        data={mockData} 
        characters={mockCharacters} 
        onGenerateBatch={onGenerateBatch} 
        pendingSpanIds={new Set()}
        onPlaySpan={onPlaySpan}
      />
    );

    const playButtons = screen.getAllByTitle('Play Audio');
    fireEvent.click(playButtons[0]);
    expect(onPlaySpan).toHaveBeenCalledWith('s1');
  });

  it('calls onAssign when clicking a span in paint mode', () => {
    const onAssign = vi.fn();
    render(
      <ScriptView 
        data={mockData} 
        characters={mockCharacters} 
        onGenerateBatch={onGenerateBatch} 
        pendingSpanIds={new Set()}
        onPlaySpan={onPlaySpan}
        onAssign={onAssign}
        activeCharacterId="char-1"
      />
    );

    const span = screen.getByText('Different paragraph.').closest('.script-span');
    fireEvent.click(span!);
    expect(onAssign).toHaveBeenCalledWith(['s3']);
  });

  it('calls onAssign with whole paragraph spans when clicking a paragraph in paint mode', () => {
    const onAssign = vi.fn();
    render(
      <ScriptView 
        data={mockData} 
        characters={mockCharacters} 
        onGenerateBatch={onGenerateBatch} 
        pendingSpanIds={new Set()}
        onPlaySpan={onPlaySpan}
        onAssign={onAssign}
        activeCharacterId="char-1"
      />
    );

    // Click the first paragraph
    const paragraph = screen.getByText('Sentence one.').closest('.book-paragraph');
    fireEvent.click(paragraph!);
    expect(onAssign).toHaveBeenCalledWith(['s1', 's2']);
  });

  it('calls onCompact when "Clean Up" button is clicked', () => {
    const onCompact = vi.fn();
    render(
      <ScriptView 
        data={mockData} 
        characters={mockCharacters} 
        onGenerateBatch={onGenerateBatch} 
        pendingSpanIds={new Set()}
        onPlaySpan={onPlaySpan}
        onCompact={onCompact}
      />
    );

    const compactButton = screen.getByText('Clean Up');
    fireEvent.click(compactButton);
    expect(onCompact).toHaveBeenCalled();
  });

  it('shows loading state on "Clean Up" button while compacting', () => {
    render(
      <ScriptView 
        data={mockData} 
        characters={mockCharacters} 
        onGenerateBatch={onGenerateBatch} 
        pendingSpanIds={new Set()}
        onPlaySpan={onPlaySpan}
        isCompacting={true}
      />
    );

    expect(screen.getByText('Cleaning...')).toBeInTheDocument();
    expect(screen.getByText('Cleaning...').closest('button')).toBeDisabled();
  });
});
