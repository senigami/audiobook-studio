import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScriptView } from '@/pages/ChapterEditor/components/ScriptView';
import type { ScriptViewResponse } from '@/types';

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
    ],
    audio_groups: [
      { id: 'g1', span_ids: ['s1', 's2'], status: 'draft', audio_file_path: null, asset_url: null, order_index: 0, estimated_work_weight: 1 }
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
    expect(screen.getAllByText('Albus').length).toBeGreaterThan(0);
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

  it('marks pending spans as processing and keeps hover affordance in book mode', () => {
    render(
      <ScriptView
        data={mockData}
        characters={mockCharacters}
        onGenerateBatch={onGenerateBatch}
        pendingSpanIds={new Set(['s2'])}
        onPlaySpan={onPlaySpan}
      />
    );

    const pendingParagraph = screen.getByText('Sentence one.').closest('.book-paragraph');
    expect(pendingParagraph).not.toHaveClass('is-pending');
    expect(screen.getByText('Sentence two.').closest('.script-span')).toHaveClass('is-book-pending');
    expect(screen.getByText('Sentence two.').closest('.script-span-text')).toHaveClass('script-span-text-book-pending');
    expect(screen.getByText('Sentence one.').closest('.script-span')).toBeTruthy();
    expect(screen.getByText('Sentence one.').closest('.script-span')).toHaveClass('script-span');
  });

  it('marks pending script lines at the block level in script mode', () => {
    render(
      <ScriptView
        data={mockData}
        characters={mockCharacters}
        onGenerateBatch={onGenerateBatch}
        pendingSpanIds={new Set(['s2'])}
        onPlaySpan={onPlaySpan}
      />
    );

    fireEvent.click(screen.getByText('Script'));
    expect(screen.getByText('Sentence two.').closest('.script-line')).toHaveClass('is-pending');
  });

  it('renders active batch progress as lit letters with a cursor across the whole batch', () => {
    render(
      <ScriptView
        data={mockData}
        characters={mockCharacters}
        onGenerateBatch={onGenerateBatch}
        pendingSpanIds={new Set(['s1', 's2'])}
        renderingSpanIds={new Set(['s1', 's2'])}
        renderingBatchProgressById={{ b1: 0.5 }}
        onPlaySpan={onPlaySpan}
      />
    );

    const firstSpan = screen.getByTestId('script-span-s1');
    const activeSpan = screen.getByTestId('script-span-s2');
    const activeSpanText = activeSpan.querySelector('.script-span-text');
    const firstLetters = firstSpan.querySelectorAll('.script-progress-letter');
    const secondLetters = activeSpan.querySelectorAll('.script-progress-letter');
    const litLetters = document.querySelectorAll('.script-progress-letter.is-lit');
    const cursorLetters = document.querySelectorAll('.script-progress-letter.is-cursor');

    expect(activeSpanText).toHaveClass('script-span-text-book-rendering');
    expect(firstLetters.length + secondLetters.length).toBe('Sentence one.Sentence two.'.length);
    expect(firstLetters[0]).toHaveStyle({ '--script-progress-letter-index': '0' });
    expect(firstLetters[1]).toHaveStyle({ '--script-progress-letter-index': '1' });
    expect(litLetters).toHaveLength(Math.floor('Sentence one.Sentence two.'.length * 0.5));
    expect(cursorLetters).toHaveLength(1);
    expect(firstSpan.querySelectorAll('.script-progress-letter.is-lit')).toHaveLength('Sentence one.'.length);
    expect(activeSpan.querySelectorAll('.script-progress-letter.is-lit')).toHaveLength(0);
    expect(activeSpan).toHaveClass('is-book-rendering');
    expect(firstSpan).toHaveClass('is-book-rendering');
    expect(screen.getByTestId('script-render-group-b1')).toContainElement(firstSpan);
    expect(screen.getByTestId('script-render-group-b1')).toContainElement(activeSpan);
    expect(screen.getByText('Different paragraph.').querySelector('.script-progress-letter')).toBeNull();
  });

  it('maps batch progress across the full batch even when only the active span is marked rendering', () => {
    const shortBatchData: ScriptViewResponse = {
      chapter_id: 'chap-2',
      base_revision_id: 'rev-2',
      paragraphs: [{ id: 'p-short', span_ids: ['short-1', 'short-2'] }],
      spans: [
        {
          id: 'short-1',
          order_index: 0,
          text: 'One.',
          sanitized_text: 'One.',
          character_id: 'char-1',
          speaker_profile_name: 'Voice 1',
          status: 'draft',
          audio_file_path: null,
          audio_generated_at: null,
          char_count: 4,
          sanitized_char_count: 4,
        },
        {
          id: 'short-2',
          order_index: 1,
          text: 'Two.',
          sanitized_text: 'Two.',
          character_id: 'char-1',
          speaker_profile_name: 'Voice 1',
          status: 'draft',
          audio_file_path: null,
          audio_generated_at: null,
          char_count: 4,
          sanitized_char_count: 4,
        },
      ],
      render_batches: [
        { id: 'short-batch', span_ids: ['short-1', 'short-2'], status: 'draft', estimated_work_weight: 1 },
      ],
      audio_groups: [],
    };

    render(
      <ScriptView
        data={shortBatchData}
        characters={mockCharacters}
        onGenerateBatch={onGenerateBatch}
        pendingSpanIds={new Set(['short-1', 'short-2'])}
        renderingSpanIds={new Set(['short-1'])}
        renderingBatchProgressById={{ 'short-batch': 0.25 }}
        onPlaySpan={onPlaySpan}
      />
    );

    const firstSpan = screen.getByTestId('script-span-short-1');
    const secondSpan = screen.getByTestId('script-span-short-2');

    expect(firstSpan.querySelectorAll('.script-progress-letter.is-lit')).toHaveLength(2);
    expect(firstSpan.querySelectorAll('.script-progress-letter.is-cursor')).toHaveLength(1);
    expect(secondSpan.querySelectorAll('.script-progress-letter.is-lit')).toHaveLength(0);
    expect(secondSpan.querySelectorAll('.script-progress-letter.is-cursor')).toHaveLength(0);
  });

  it('renders complete batch progress without a cursor', () => {
    render(
      <ScriptView
        data={mockData}
        characters={mockCharacters}
        onGenerateBatch={onGenerateBatch}
        pendingSpanIds={new Set(['s1', 's2'])}
        renderingSpanIds={new Set(['s1', 's2'])}
        renderingBatchProgressById={{ b1: 1 }}
        onPlaySpan={onPlaySpan}
      />
    );

    const progressLetters = document.querySelectorAll('.script-progress-letter');
    const litLetters = document.querySelectorAll('.script-progress-letter.is-lit');
    const cursorLetters = document.querySelectorAll('.script-progress-letter.is-cursor');

    expect(progressLetters.length).toBe('Sentence one.Sentence two.'.length);
    expect(litLetters.length).toBe(progressLetters.length);
    expect(cursorLetters).toHaveLength(0);
  });

  it('wraps adjacent rendering sentences in a shared book-mode progress group', () => {
    render(
      <ScriptView
        data={mockData}
        characters={mockCharacters}
        onGenerateBatch={onGenerateBatch}
        pendingSpanIds={new Set(['s1', 's2'])}
        renderingSpanIds={new Set(['s1', 's2'])}
        renderingBatchProgressById={{ b1: 0.35 }}
        onPlaySpan={onPlaySpan}
      />
    );

    const renderGroup = screen.getByTestId('script-render-group-b1');
    expect(renderGroup).toHaveClass('is-rendering');
    expect(renderGroup).toContainElement(screen.getByTestId('script-span-s1'));
    expect(renderGroup).toContainElement(screen.getByTestId('script-span-s2'));
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
        engines={[{ engine_id: 'xtts', enabled: true, status: 'ready' } as any]}
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

    // Click the first block
    const paragraph = screen.getByText('Sentence one.').closest('.book-paragraph');
    fireEvent.click(paragraph!);
    expect(onAssign).toHaveBeenCalledWith(['s1', 's2']);
  });

  it('filters availableVoices to show only characters in reassignment dropdown', () => {
    const mockProfiles = [
      { name: 'V1', speaker_id: 's1' } as any,
      { name: 'Orphan' } as any,
    ];
    const mockSpeakers = [{ id: 's1', name: 'Speaker 1' } as any];
    const mockEngines = [{ engine_id: 'xtts', enabled: true, status: 'ready' } as any];
    const mockChars = [{ id: 'char-1', name: 'Albus', speaker_profile_name: 'V1' } as any];

    render(
      <ScriptView
        data={mockData}
        characters={mockChars}
        speakerProfiles={mockProfiles}
        speakers={mockSpeakers}
        engines={mockEngines}
        onGenerateBatch={onGenerateBatch}
        pendingSpanIds={new Set()}
        onPlaySpan={onPlaySpan}
      />
    );

    // In a real browser, we'd check the options of the select.
    // Here we can check if buildVoiceOptions was called and filtered.
    // Since we're using VoiceProfileSelect, we can check for labels.
    // The dropdown should contain "Albus" but NOT "Orphan" or "Speaker 1".

    // Switch to script mode to see the dropdown
    fireEvent.click(screen.getByText('Script'));

    // The select should have "Albus" as an option.
    const options = screen.getAllByRole('option');
    const optionLabels = options.map(o => o.textContent);

    expect(optionLabels).toContain('Default');
    expect(optionLabels).toContain('Albus');
    expect(optionLabels).not.toContain('Orphan');
    expect(optionLabels).not.toContain('Speaker 1');
  });

  it('keeps sentence reassignment options clickable even when the voices are disabled', () => {
    const mockProfiles = [
      { name: 'V1', speaker_id: 's1', engine: 'xtts' } as any,
    ];
    const mockSpeakers = [{ id: 's1', name: 'Speaker 1' } as any];
    const mockEngines = [{ engine_id: 'xtts', enabled: false, status: 'needs_setup' } as any];
    const mockChars = [{ id: 'char-1', name: 'Albus', speaker_profile_name: 'V1' } as any];

    render(
      <ScriptView
        data={mockData}
        characters={mockChars}
        speakerProfiles={mockProfiles}
        speakers={mockSpeakers}
        engines={mockEngines}
        onGenerateBatch={onGenerateBatch}
        pendingSpanIds={new Set()}
        onPlaySpan={onPlaySpan}
      />
    );

    fireEvent.click(screen.getByText('Script'));

    const options = screen.getAllByRole('option');
    const albusOption = options.find(o => o.textContent === 'Albus 🚫');
    expect(albusOption).toBeTruthy();
    expect(albusOption).not.toHaveAttribute('disabled');
  });

  it('assigns the selected character when the sentence dropdown changes', () => {
    const onAssignToCharacter = vi.fn();
    const mockProfiles = [
      { name: 'V1', speaker_id: 's1' } as any,
    ];
    const mockSpeakers = [{ id: 's1', name: 'Speaker 1' } as any];
    const mockChars = [{ id: 'char-1', name: 'Albus', speaker_profile_name: 'V1' } as any];

    render(
      <ScriptView
        data={mockData}
        characters={mockChars}
        speakerProfiles={mockProfiles}
        speakers={mockSpeakers}
        onGenerateBatch={onGenerateBatch}
        pendingSpanIds={new Set()}
        onPlaySpan={onPlaySpan}
        onAssignToCharacter={onAssignToCharacter}
      />
    );

    fireEvent.click(screen.getByText('Script'));
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'V1' } });

    expect(onAssignToCharacter).toHaveBeenCalledWith(['s1'], 'char-1', 'V1');
  });

  it('does not trigger paint assignment when using the sentence dropdown', () => {
    const onAssign = vi.fn();
    const onAssignToCharacter = vi.fn();
    const mockProfiles = [
      { name: 'V1', speaker_id: 's1' } as any,
    ];
    const mockSpeakers = [{ id: 's1', name: 'Speaker 1' } as any];
    const mockChars = [{ id: 'char-1', name: 'Albus', speaker_profile_name: 'V1' } as any];

    render(
      <ScriptView
        data={mockData}
        characters={mockChars}
        speakerProfiles={mockProfiles}
        speakers={mockSpeakers}
        onGenerateBatch={onGenerateBatch}
        pendingSpanIds={new Set()}
        onPlaySpan={onPlaySpan}
        onAssign={onAssign}
        onAssignToCharacter={onAssignToCharacter}
        activeCharacterId="char-1"
      />
    );

    fireEvent.click(screen.getByText('Script'));

    const select = screen.getAllByRole('combobox')[0];
    fireEvent.mouseDown(select);
    fireEvent.click(select);
    fireEvent.change(select, { target: { value: 'V1' } });

    expect(onAssign).not.toHaveBeenCalled();
    expect(onAssignToCharacter).toHaveBeenCalledWith(['s1'], 'char-1', 'V1');
  });

  it('renders non-leader spans in a completed group as ready, rebuildable, and playable', () => {
    const completedGroupData: ScriptViewResponse = {
      chapter_id: 'chap-1',
      base_revision_id: 'rev-1',
      paragraphs: [
        { id: 'p1', span_ids: ['s1', 's2'] }
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
        }
      ],
      render_batches: [
        { id: 'b1', span_ids: ['s1', 's2'], status: 'draft', estimated_work_weight: 1 }
      ],
      audio_groups: [
        { id: 'g1', span_ids: ['s1', 's2'], status: 'draft', audio_file_path: 's1.wav', asset_url: '/api/assets/s1.wav', order_index: 0, estimated_work_weight: 1 }
      ]
    };

    render(
      <ScriptView
        data={completedGroupData}
        characters={mockCharacters}
        onGenerateBatch={onGenerateBatch}
        pendingSpanIds={new Set()}
        onPlaySpan={onPlaySpan}
        engines={[{ engine_id: 'xtts', enabled: true, status: 'ready' } as any]}
      />
    );

    // Switch to Script mode
    fireEvent.click(screen.getByText('Script'));

    // Check sentence one (leader)
    const s1Text = screen.getByText('Sentence one.');
    expect(s1Text).toHaveClass('script-span-text-ready');

    // Check sentence two (non-leader)
    const s2Text = screen.getByText('Sentence two.');
    expect(s2Text).toHaveClass('script-span-text-ready');

    // The play button for sentence two should be enabled
    const s2Span = s2Text.closest('.script-span');
    const playButtons = s2Span?.querySelectorAll('button[title="Play Audio"]');
    expect(playButtons?.[0]).not.toHaveAttribute('disabled');

    // The generate button for sentence two should show 'Rebuild' title
    const rebuildButtons = s2Span?.querySelectorAll('button[title="Rebuild"]');
    expect(rebuildButtons?.length).toBe(1);
  });

  it('shows Narrator label for all-null character_id spans in script mode', () => {
    const allNullData: ScriptViewResponse = {
      chapter_id: 'chap-null',
      base_revision_id: 'rev-null',
      paragraphs: [
        { id: 'pn1', span_ids: ['sn1'] },
        { id: 'pn2', span_ids: ['sn2'] },
      ],
      spans: [
        {
          id: 'sn1',
          order_index: 0,
          text: 'First narrator line.',
          sanitized_text: 'First narrator line.',
          character_id: null,
          speaker_profile_name: null,
          status: 'draft',
          audio_file_path: null,
          audio_generated_at: null,
          char_count: 20,
          sanitized_char_count: 20,
        },
        {
          id: 'sn2',
          order_index: 1,
          text: 'Second narrator line.',
          sanitized_text: 'Second narrator line.',
          character_id: null,
          speaker_profile_name: null,
          status: 'draft',
          audio_file_path: null,
          audio_generated_at: null,
          char_count: 21,
          sanitized_char_count: 21,
        },
      ],
      render_batches: [],
      audio_groups: [],
    };

    render(
      <ScriptView
        data={allNullData}
        characters={[]}
        onGenerateBatch={onGenerateBatch}
        pendingSpanIds={new Set()}
        onPlaySpan={onPlaySpan}
      />
    );

    fireEvent.click(screen.getByText('Script'));
    // The first span must show 'Narrator' even though lastCharId starts as null
    expect(screen.getAllByText('Narrator').length).toBeGreaterThan(0);
  });

  it('renders a preparing span with data-render-status="preparing", preparing class, and no rendering cursor', () => {
    render(
      <ScriptView
        data={mockData}
        characters={mockCharacters}
        onGenerateBatch={onGenerateBatch}
        pendingSpanIds={new Set(['s2'])}
        renderingSpanIds={new Set(['s2'])}
        preparingSpanIds={new Set(['s2'])}
        renderingBatchProgressById={{ b1: 0.4 }}
        onPlaySpan={onPlaySpan}
      />
    );

    const spanEl = screen.getByTestId('script-span-s2');

    // data-render-status must be 'preparing'
    expect(spanEl).toHaveAttribute('data-render-status', 'preparing');

    // the text element must carry the preparing class (book mode)
    const textEl = spanEl.querySelector('.script-span-text');
    expect(textEl).toHaveClass('script-span-text-book-preparing');

    // the span container must carry the book-mode preparing class
    expect(spanEl).toHaveClass('is-book-preparing');

    // no rendering cursor (SegmentProgressText) — no .script-progress-letter elements on this span
    expect(spanEl.querySelectorAll('.script-progress-letter')).toHaveLength(0);
  });

  it('resolves a span in both preparingSpanIds and renderingSpanIds as preparing (precedence)', () => {
    render(
      <ScriptView
        data={mockData}
        characters={mockCharacters}
        onGenerateBatch={onGenerateBatch}
        pendingSpanIds={new Set(['s2'])}
        renderingSpanIds={new Set(['s2'])}
        preparingSpanIds={new Set(['s2'])}
        renderingBatchProgressById={{ b1: 0.4 }}
        onPlaySpan={onPlaySpan}
      />
    );

    const spanEl = screen.getByTestId('script-span-s2');

    // Must resolve to preparing, not rendering
    expect(spanEl).toHaveAttribute('data-render-status', 'preparing');
    expect(spanEl).not.toHaveAttribute('data-render-status', 'rendering');

    // Must not have any rendering classes
    const textEl = spanEl.querySelector('.script-span-text');
    expect(textEl).not.toHaveClass('script-span-text-book-rendering');
    expect(textEl).not.toHaveClass('script-span-text-rendering');
  });

  it('batch group gets is-preparing class when any span is preparing', () => {
    render(
      <ScriptView
        data={mockData}
        characters={mockCharacters}
        onGenerateBatch={onGenerateBatch}
        pendingSpanIds={new Set(['s1', 's2'])}
        renderingSpanIds={new Set(['s1', 's2'])}
        preparingSpanIds={new Set(['s1'])}
        renderingBatchProgressById={{ b1: 0.3 }}
        onPlaySpan={onPlaySpan}
      />
    );

    const renderGroup = screen.getByTestId('script-render-group-b1');
    expect(renderGroup).toHaveClass('is-preparing');
    expect(renderGroup).not.toHaveClass('is-rendering');
  });

  // ── W-PAR 006: multi-active segments — two batches rendering simultaneously ──
  it('[W-PAR 006] two spans in different batches render simultaneously with independent progress', () => {
    const multiActiveData: ScriptViewResponse = {
      ...mockData,
      render_batches: [
        { id: 'b1', span_ids: ['s1'], status: 'draft', estimated_work_weight: 1 },
        { id: 'b2', span_ids: ['s3'], status: 'draft', estimated_work_weight: 1 },
      ],
    };

    render(
      <ScriptView
        data={multiActiveData}
        characters={mockCharacters}
        onGenerateBatch={onGenerateBatch}
        pendingSpanIds={new Set(['s1', 's3'])}
        renderingSpanIds={new Set(['s1', 's3'])}
        renderingBatchProgressById={{ b1: 0.3, b2: 0.6 }}
        onPlaySpan={onPlaySpan}
      />
    );

    const span1 = screen.getByTestId('script-span-s1');
    const span3 = screen.getByTestId('script-span-s3');

    // Both spans must be simultaneously non-idle (rendering), not just the last-emitted one.
    expect(span1).toHaveAttribute('data-render-status', 'rendering');
    expect(span3).toHaveAttribute('data-render-status', 'rendering');

    // Each span's progress bar reflects its OWN batch's progress independently.
    const litLetters1 = span1.querySelectorAll('.script-progress-letter.is-lit');
    const litLetters3 = span3.querySelectorAll('.script-progress-letter.is-lit');

    expect(litLetters1.length).toBe(Math.floor('Sentence one.'.length * 0.3));
    expect(litLetters3.length).toBe(Math.floor('Different paragraph.'.length * 0.6));
  });
});
