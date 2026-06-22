import { fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CastPalette } from '@/pages/Book/studio/CastPalette';
import type { ChapterSegment, Character, Speaker, SpeakerProfile, TtsEngine } from '@/types';

vi.mock('@/components/forms/ColorSwatchPicker', () => ({
  ColorSwatchPicker: ({ value }: { value: string }) => <div data-testid={`swatch-${value}`} />,
}));

const mockEngines: TtsEngine[] = [
  { engine_id: 'xtts', display_name: 'XTTS', status: 'ready', verified: true, enabled: true, version: '1.0', local: true, cloud: false, network: false, languages: [], capabilities: [], resource: {}, author: 'OpenAI', homepage: '', settings_schema: {} } as TtsEngine,
];

const mockSpeakers: Speaker[] = [
  { id: 'speaker-1', name: 'Narrator' } as Speaker,
  { id: 'speaker-2', name: 'Maren' } as Speaker,
];

const mockProfiles: SpeakerProfile[] = [
  { name: 'Narrator Default', speaker_id: 'speaker-1', variant_name: 'Default', engine: 'xtts', provider: 'test' } as SpeakerProfile,
  { name: 'Maren A', speaker_id: 'speaker-2', variant_name: 'A', engine: 'xtts', provider: 'test' } as SpeakerProfile,
  { name: 'Maren B', speaker_id: 'speaker-2', variant_name: 'B', engine: 'xtts', provider: 'test' } as SpeakerProfile,
];

const mockCharacters: Character[] = [
  { id: 'char-1', project_id: 'book-1', name: 'Narrator', speaker_profile_name: 'Narrator', default_emotion: null, color: '#22c55e' } as Character,
  { id: 'char-2', project_id: 'book-1', name: 'Maren', speaker_profile_name: 'Maren', default_emotion: null, color: '#6366f1' } as Character,
];

const mockSegments: ChapterSegment[] = [
  { id: 'seg-1', chapter_id: 'chapter-1', segment_order: 0, text_content: 'Hello', sanitized_text: 'Hello', character_id: 'char-1', speaker_profile_name: 'Narrator Default', audio_file_path: null, audio_status: 'done', audio_generated_at: null },
  { id: 'seg-2', chapter_id: 'chapter-1', segment_order: 1, text_content: 'World', sanitized_text: 'World', character_id: 'char-1', speaker_profile_name: 'Narrator Default', audio_file_path: null, audio_status: 'done', audio_generated_at: null },
  { id: 'seg-3', chapter_id: 'chapter-1', segment_order: 2, text_content: 'Maren', sanitized_text: 'Maren', character_id: 'char-2', speaker_profile_name: 'Maren A', audio_file_path: null, audio_status: 'done', audio_generated_at: null },
];

function Harness() {
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedProfileName, setSelectedProfileName] = useState<string | null>(null);
  const [expandedCharacterId, setExpandedCharacterId] = useState<string | null>(null);

  return (
    <CastPalette
      characters={mockCharacters}
      segments={mockSegments}
      speakers={mockSpeakers}
      speakerProfiles={mockProfiles}
      engines={mockEngines}
      selectedCharacterId={selectedCharacterId}
      setSelectedCharacterId={setSelectedCharacterId}
      selectedProfileName={selectedProfileName}
      setSelectedProfileName={setSelectedProfileName}
      expandedCharacterId={expandedCharacterId}
      setExpandedCharacterId={setExpandedCharacterId}
      onUpdateCharacterColor={vi.fn()}
    />
  );
}

describe('CastPalette', () => {
  it('arms and disarms a cast row while showing the segment count', () => {
    render(<Harness />);

    // The character row's accessible name includes the initial, name, profile and count
    const narratorRow = screen.getByRole('button', { name: /N Narrator Default 2/i });
    expect(narratorRow).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);

    fireEvent.click(narratorRow);
    expect(narratorRow).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(narratorRow);
    expect(narratorRow).toHaveAttribute('aria-pressed', 'false');
  });

  it('does not render a voice-select dropdown', () => {
    render(<Harness />);
    expect(screen.queryByTestId('voice-select')).not.toBeInTheDocument();
  });

  it('arms CLEAR_ASSIGNMENT when Narrator (default) is clicked, and disarms on second click', () => {
    render(<Harness />);

    const clearBtn = screen.getByRole('button', { name: /narrator \(default\)/i });
    expect(clearBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(clearBtn);
    expect(clearBtn).toHaveAttribute('aria-pressed', 'true');

    // Second click disarms
    fireEvent.click(clearBtn);
    expect(clearBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows "click sentences to clear" subtitle when CLEAR_ASSIGNMENT is armed', () => {
    render(<Harness />);

    const clearBtn = screen.getByRole('button', { name: /narrator \(default\)/i });
    // Before arming: shows revert hint
    expect(screen.getByText(/revert lines to narrator/i)).toBeInTheDocument();

    fireEvent.click(clearBtn);
    expect(screen.getByText(/click sentences to clear/i)).toBeInTheDocument();
  });

  it('labels the line-count pill and shows a chevron (not a bare number) for variants', () => {
    render(<Harness />);

    // The line-count pill carries a clear label (Narrator has 2 assigned lines)...
    expect(screen.getByLabelText(/2 lines assigned/i)).toBeInTheDocument();
    // ...and the multi-voice character exposes a labelled disclosure, not a 2nd raw count.
    expect(screen.getByLabelText(/2 voices available/i)).toBeInTheDocument();
  });

  it('expands variants for a character with multiple profiles', () => {
    render(<Harness />);

    // Maren has 2 variants; accessible name includes initial, name, profile and count
    const marenRow = screen.getByRole('button', { name: /M Maren/i });
    fireEvent.click(marenRow);
    expect(marenRow).toHaveAttribute('aria-pressed', 'true');

    // Selecting a multi-profile character auto-expands its variant list
    // (no separate "variants" toggle).
    expect(screen.getByRole('button', { name: /^a$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^b$/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 3-tier tests

/** Build a character with optional chapter_id. */
function makeChar(id: string, name: string, chapterId?: string | null): Character {
  return { id, project_id: 'proj-1', name, speaker_profile_name: null, default_emotion: null, color: '#8b5cf6', chapter_id: chapterId ?? null };
}

/** Build a segment assigned to characterId for the given chapterId. */
function makeSeg(id: string, chapterId: string, characterId: string | null): ChapterSegment {
  return { id, chapter_id: chapterId, segment_order: 0, text_content: 'text', character_id: characterId, speaker_profile_name: null, audio_file_path: null, audio_status: 'unprocessed', audio_generated_at: null };
}

interface TieredHarnessProps {
  characters: Character[];
  segments: ChapterSegment[];
  currentChapterId: string;
  onCreateTempCharacter?: () => void;
  onPromoteCharacter?: (id: string) => void;
  onDeleteCharacter?: (id: string) => void;
  availableVoices?: import('@/utils/voiceProfiles').VoiceOption[];
}

function TieredHarness({ characters, segments, currentChapterId, onCreateTempCharacter, onPromoteCharacter, onDeleteCharacter, availableVoices }: TieredHarnessProps) {
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedProfileName, setSelectedProfileName] = useState<string | null>(null);
  const [expandedCharacterId, setExpandedCharacterId] = useState<string | null>(null);
  return (
    <CastPalette
      characters={characters}
      segments={segments}
      speakers={[]}
      speakerProfiles={[]}
      engines={[]}
      selectedCharacterId={selectedCharacterId}
      setSelectedCharacterId={setSelectedCharacterId}
      selectedProfileName={selectedProfileName}
      setSelectedProfileName={setSelectedProfileName}
      expandedCharacterId={expandedCharacterId}
      setExpandedCharacterId={setExpandedCharacterId}
      onUpdateCharacterColor={vi.fn()}
      currentChapterId={currentChapterId}
      onCreateTempCharacter={onCreateTempCharacter}
      onPromoteCharacter={onPromoteCharacter}
      onDeleteCharacter={onDeleteCharacter}
      availableVoices={availableVoices}
    />
  );
}

describe('CastPalette — 3-tier grouping', () => {
  const CHAPTER_A = 'chapter-a';
  const CHAPTER_B = 'chapter-b';

  // alice is a book char assigned in chapter-a (tier 1)
  const alice = makeChar('alice', 'Alice');
  // bob is a book char NOT assigned in chapter-a (tier 3)
  const bob = makeChar('bob', 'Bob');
  // tempChar is scoped to chapter-a (tier 2)
  const tempChar = makeChar('temp-1', 'Temp One', CHAPTER_A);
  // otherTemp is scoped to chapter-b (should NOT appear in chapter-a view)
  const otherTemp = makeChar('temp-b', 'Bob Temp', CHAPTER_B);

  const segments = [
    makeSeg('seg-a1', CHAPTER_A, 'alice'),
  ];

  it('places book chars with ≥1 segment in tier 1 (In this chapter)', () => {
    render(
      <TieredHarness
        characters={[alice, bob, tempChar]}
        segments={segments}
        currentChapterId={CHAPTER_A}
      />
    );
    // "In this chapter" header should be present
    expect(screen.getByText(/in this chapter/i)).toBeInTheDocument();
    // Alice has a segment in chapter-a, so she's in tier 1
    expect(screen.getByRole('button', { name: /A Alice/i })).toBeInTheDocument();
  });

  it('places book chars with no assignment in this chapter in tier 3 (Everyone else)', () => {
    render(
      <TieredHarness
        characters={[alice, bob, tempChar]}
        segments={segments}
        currentChapterId={CHAPTER_A}
      />
    );
    expect(screen.getByText(/everyone else/i)).toBeInTheDocument();
    // Bob has no segment in chapter-a; he's hidden until tier 3 is expanded
    // (tier3 defaults to collapsed — button is not visible yet)
    // Expand tier 3
    fireEvent.click(screen.getByText(/everyone else/i));
    expect(screen.getByRole('button', { name: /B Bob/i })).toBeInTheDocument();
  });

  it('places characters whose chapter_id matches currentChapterId in tier 2 (Chapter cast)', () => {
    render(
      <TieredHarness
        characters={[alice, bob, tempChar]}
        segments={segments}
        currentChapterId={CHAPTER_A}
      />
    );
    expect(screen.getByText(/chapter cast/i)).toBeInTheDocument();
    // Temp One has chapter_id === chapter-a
    expect(screen.getByRole('button', { name: /T Temp One/i })).toBeInTheDocument();
  });

  it('does NOT render characters scoped to a different chapter', () => {
    render(
      <TieredHarness
        characters={[alice, otherTemp]}
        segments={segments}
        currentChapterId={CHAPTER_A}
      />
    );
    // Bob Temp is scoped to chapter-b — should not appear in chapter-a view
    expect(screen.queryByRole('button', { name: /B Bob Temp/i })).not.toBeInTheDocument();
  });

  it('calls onCreateTempCharacter when "+ Temp character" button is clicked', () => {
    const onCreate = vi.fn();
    render(
      <TieredHarness
        characters={[alice]}
        segments={segments}
        currentChapterId={CHAPTER_A}
        onCreateTempCharacter={onCreate}
      />
    );
    const addBtn = screen.getByRole('button', { name: /temp character/i });
    fireEvent.click(addBtn);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('calls onPromoteCharacter with the correct characterId from the kebab menu', () => {
    const onPromote = vi.fn();
    render(
      <TieredHarness
        characters={[alice, tempChar]}
        segments={segments}
        currentChapterId={CHAPTER_A}
        onPromoteCharacter={onPromote}
      />
    );

    const rowBtn = screen.getByRole('button', { name: /T Temp One/i });
    fireEvent.mouseEnter(rowBtn.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /promote to book cast/i }));
    expect(onPromote).toHaveBeenCalledWith('temp-1');
  });

  it('calls onDeleteCharacter from the kebab menu', () => {
    const onDelete = vi.fn();
    render(
      <TieredHarness
        characters={[alice, tempChar]}
        segments={segments}
        currentChapterId={CHAPTER_A}
        onDeleteCharacter={onDelete}
      />
    );

    const rowBtn = screen.getByRole('button', { name: /T Temp One/i });
    fireEvent.mouseEnter(rowBtn.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: /more actions/i }));
    fireEvent.click(screen.getByRole('button', { name: /delete character/i }));
    expect(onDelete).toHaveBeenCalledWith('temp-1');
  });

  it('does not show a kebab on book (tier-1) characters', () => {
    render(
      <TieredHarness
        characters={[alice, tempChar]}
        segments={segments}
        currentChapterId={CHAPTER_A}
        onPromoteCharacter={vi.fn()}
        onDeleteCharacter={vi.fn()}
      />
    );

    // alice is tier-1 — hovering her row should NOT produce a kebab
    const aliceBtn = screen.getByRole('button', { name: /A Alice/i });
    fireEvent.mouseEnter(aliceBtn.parentElement as HTMLElement);
    expect(screen.queryByRole('button', { name: /more actions/i })).not.toBeInTheDocument();

    // tempChar is tier-2 — hovering its row DOES produce a kebab
    const tempBtn = screen.getByRole('button', { name: /T Temp One/i });
    fireEvent.mouseEnter(tempBtn.parentElement as HTMLElement);
    expect(screen.getByRole('button', { name: /more actions/i })).toBeInTheDocument();
  });
});
