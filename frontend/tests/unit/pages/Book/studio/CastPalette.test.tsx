import { fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CastPalette } from '@/pages/Book/studio/CastPalette';
import type { ChapterSegment, Character, Speaker, SpeakerProfile, TtsEngine } from '@/types';

vi.mock('@/components/forms/ColorSwatchPicker', () => ({
  ColorSwatchPicker: ({ value }: { value: string }) => <div data-testid={`swatch-${value}`} />,
}));

vi.mock('@/pages/ChapterEditor/components/VoiceProfileSelect', () => ({
  VoiceProfileSelect: ({ value, options, onChange, defaultLabel }: any) => (
    <label>
      {defaultLabel}
      <select data-testid="voice-select" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{defaultLabel}</option>
        {options.map((option: { value: string; label: string }) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  ),
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
  const [selectedVoice, setSelectedVoice] = useState('');

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
      selectedVoice={selectedVoice}
      onVoiceChange={setSelectedVoice}
      availableVoices={[
        { id: 'default', label: 'Project Default', value: 'project-default', character_name: undefined } as any,
      ]}
      defaultVoiceLabel="Use Project Default (Narrator)"
    />
  );
}

describe('CastPalette', () => {
  it('arms and disarms a cast row while showing the segment count', () => {
    render(<Harness />);

    const narratorRow = screen.getByRole('button', { name: /narrator/i });
    expect(narratorRow).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);

    fireEvent.click(narratorRow);
    expect(narratorRow).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(narratorRow);
    expect(narratorRow).toHaveAttribute('aria-pressed', 'false');
  });

  it('changes the default voice and expands variants for a character', () => {
    render(<Harness />);

    fireEvent.change(screen.getByTestId('voice-select'), { target: { value: 'project-default' } });
    expect(screen.getByTestId('voice-select')).toHaveValue('project-default');

    fireEvent.click(screen.getByRole('button', { name: /maren/i }));
    expect(screen.getByRole('button', { name: /maren/i })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /variants/i }));
    expect(screen.getByRole('button', { name: /^a$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^b$/i })).toBeInTheDocument();
  });
});
