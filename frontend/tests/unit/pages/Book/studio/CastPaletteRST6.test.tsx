/**
 * RST-6 — Chapter default-voice picker in CastPalette.
 *
 * The chapter default voice is merged into the "Narrator (default)" entry: it shows the
 * effective voice in small print, with an "Override voice" select beneath it (rendered only
 * when handleVoiceChange is supplied). These tests cover the select's presence/absence,
 * the change callback, and the small-print effective-voice display.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CastPalette } from '@/pages/Book/studio/CastPalette';
import type { ChapterSegment, Character, Speaker, SpeakerProfile, TtsEngine } from '@/types';

vi.mock('@/components/forms/ColorSwatchPicker', () => ({
  ColorSwatchPicker: ({ value }: { value: string }) => <div data-testid={`swatch-${value}`} />,
}));

const mockEngines: TtsEngine[] = [
  {
    engine_id: 'xtts',
    display_name: 'XTTS',
    status: 'ready',
    verified: true,
    enabled: true,
    version: '1.0',
    local: true,
    cloud: false,
    network: false,
    languages: [],
    capabilities: [],
    resource: {},
    author: '',
    homepage: '',
    settings_schema: {},
  } as TtsEngine,
];

const mockSpeakers: Speaker[] = [{ id: 'speaker-1', name: 'Narrator' } as Speaker];

const mockProfiles: SpeakerProfile[] = [
  { name: 'Narrator Default', speaker_id: 'speaker-1', variant_name: 'Default', engine: 'xtts', provider: 'test' } as SpeakerProfile,
];

const mockCharacters: Character[] = [
  {
    id: 'char-1',
    project_id: 'book-1',
    name: 'Narrator',
    speaker_profile_name: 'Narrator Default',
    default_emotion: null,
    color: '#22c55e',
  } as Character,
];

const mockSegments: ChapterSegment[] = [
  {
    id: 'seg-1',
    chapter_id: 'chapter-1',
    segment_order: 0,
    text_content: 'Hello',
    sanitized_text: 'Hello',
    character_id: 'char-1',
    speaker_profile_name: 'Narrator Default',
    audio_file_path: null,
    audio_status: 'done',
    audio_generated_at: null,
  },
];

const voiceOptions = [
  { id: 'narrator-default', name: 'Narrator Default', value: 'Narrator Default', disabled: false },
];

function basePaletteProps() {
  return {
    characters: mockCharacters,
    segments: mockSegments,
    speakers: mockSpeakers,
    speakerProfiles: mockProfiles,
    engines: mockEngines,
    selectedCharacterId: null as string | null,
    setSelectedCharacterId: vi.fn(),
    selectedProfileName: null as string | null,
    setSelectedProfileName: vi.fn(),
    expandedCharacterId: null as string | null,
    setExpandedCharacterId: vi.fn(),
    onUpdateCharacterColor: vi.fn(),
  };
}

describe('RST-6 — CastPalette default-voice picker', () => {
  it('renders the chapter default voice select when handleVoiceChange is supplied', () => {
    render(
      <CastPalette
        {...basePaletteProps()}
        localVoice="Narrator Default"
        handleVoiceChange={vi.fn()}
        availableVoices={voiceOptions}
        chapterDefaultVoiceLabel="Use Project Default"
      />,
    );

    // Label is wrapped around the select — getByLabelText resolves via implicit label
    expect(screen.getByLabelText('Override voice')).toBeInTheDocument();
  });

  it('does not render the voice select when handleVoiceChange is not supplied', () => {
    render(<CastPalette {...basePaletteProps()} />);

    expect(screen.queryByLabelText('Override voice')).not.toBeInTheDocument();
  });

  it('calls handleVoiceChange when the select value changes', () => {
    const handleVoiceChange = vi.fn();
    render(
      <CastPalette
        {...basePaletteProps()}
        localVoice=""
        handleVoiceChange={handleVoiceChange}
        availableVoices={voiceOptions}
        chapterDefaultVoiceLabel="Use Project Default"
      />,
    );

    fireEvent.change(screen.getByLabelText('Override voice'), {
      target: { value: 'Narrator Default' },
    });
    expect(handleVoiceChange).toHaveBeenCalledWith('Narrator Default');
  });

  it("shows the project default voice as the narrator's voice in small print when no override is set", () => {
    render(
      <CastPalette
        {...basePaletteProps()}
        localVoice=""
        handleVoiceChange={vi.fn()}
        availableVoices={voiceOptions}
        chapterDefaultVoiceLabel="Use Project Default (David)"
        chapterDefaultVoiceName="David"
      />,
    );

    // The Narrator (default) entry surfaces the effective voice, not just the paint-mode hint.
    expect(screen.getByText('David')).toBeInTheDocument();
    expect(screen.queryByText('revert lines to narrator')).not.toBeInTheDocument();
  });
});
