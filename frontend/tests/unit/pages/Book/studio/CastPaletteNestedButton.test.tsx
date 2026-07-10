/**
 * Design-critique fix #1: CharacterRow's outer button used to wrap
 * ColorSwatchPicker, which renders its own <button> internally — invalid
 * HTML (a button cannot contain another button). This file deliberately does
 * NOT mock ColorSwatchPicker (unlike CastPalette.test.tsx) so the assertion
 * exercises the real nested-button structure, not a stubbed-out div.
 */
import { render } from '@testing-library/react';
import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CastPalette } from '@/pages/Book/studio/CastPalette';
import type { ChapterSegment, Character, Speaker, SpeakerProfile, TtsEngine } from '@/types';

const mockEngines: TtsEngine[] = [
  { engine_id: 'xtts', display_name: 'XTTS', status: 'ready', verified: true, enabled: true, version: '1.0', local: true, cloud: false, network: false, languages: [], capabilities: [], resource: {}, author: 'OpenAI', homepage: '', settings_schema: {} } as TtsEngine,
];

const mockCharacters: Character[] = [
  { id: 'char-1', project_id: 'book-1', name: 'Narrator', speaker_profile_name: 'Narrator', default_emotion: null, color: '#22c55e' } as Character,
  { id: 'char-2', project_id: 'book-1', name: 'Maren', speaker_profile_name: 'Maren', default_emotion: null, color: '#6366f1' } as Character,
];

const mockSpeakers: Speaker[] = [];
const mockProfiles: SpeakerProfile[] = [];
const mockSegments: ChapterSegment[] = [];

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

describe('CastPalette — nested-button DOM check (real ColorSwatchPicker)', () => {
  it('never nests a <button> inside another <button>', () => {
    const { container } = render(<Harness />);
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.querySelector('button')).toBeNull();
    }
  });
});
