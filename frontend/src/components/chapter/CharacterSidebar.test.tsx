import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CharacterSidebar } from './CharacterSidebar';
import type { Character, SpeakerProfile } from '../../types';

describe('CharacterSidebar', () => {
  const mockCharacters: Character[] = [
    { id: 'char-1', project_id: 'proj-1', name: 'Char 1', color: '#ff0000', speaker_profile_name: 'Voice 1' } as any
  ];

  const mockProfiles: SpeakerProfile[] = [
    { name: 'Profile 1', speaker_id: 'speaker-1', variant_name: 'Standard', voice_id: 'v1', provider: 'elevenlabs', engine: 'elevenlabs' } as any
  ];

  const mockSpeakers = [
    { id: 'speaker-1', name: 'Voice 1' }
  ];

  const mockEngines = [
    { engine_id: 'elevenlabs', display_name: 'ElevenLabs', enabled: true, status: 'ready' }
  ];

  it('renders characters and narrator options', () => {
    const setSelectedCharacterId = vi.fn();
    render(
      <CharacterSidebar 
        characters={mockCharacters} 
        speakers={mockSpeakers as any} 
        speakerProfiles={mockProfiles} 
        engines={mockEngines as any}
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

    expect(screen.getByText(/Char 1/)).toBeInTheDocument();
    expect(screen.getByText('None / Default')).toBeInTheDocument();
    
    // Click the character name - the parent div should handle the click
    fireEvent.click(screen.getByText(/Char 1/).parentElement!);
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
        engines={mockEngines as any}
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

    fireEvent.click(screen.getByText(/Char 1/).parentElement!);
    expect(setSelectedCharacterId).toHaveBeenCalledWith('char-1');
    expect(setSelectedProfileName).toHaveBeenCalledWith('Profile 1');
  });

  it('shows the variant display name when a variant is selected', () => {
    render(
      <CharacterSidebar
        characters={mockCharacters}
        speakers={mockSpeakers as any}
        speakerProfiles={mockProfiles}
        engines={mockEngines as any}
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
        speakerProfiles={[{ name: 'Voice 1 - Angry', speaker_id: 'speaker-1', variant_name: null, voice_id: 'v1', provider: 'elevenlabs', engine: 'elevenlabs' } as any]}
        engines={mockEngines as any}
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
        speakerProfiles={[{ name: 'Voice 1', speaker_id: 'speaker-1', variant_name: null, voice_id: 'v1', provider: 'elevenlabs', engine: 'elevenlabs' } as any]}
        engines={mockEngines as any}
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
        speakerProfiles={[{ name: 'Voice 1', speaker_id: 'speaker-1', variant_name: null, voice_id: 'v1', provider: 'elevenlabs', engine: 'elevenlabs' } as any]}
        engines={mockEngines as any}
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

  it('permits assignment even if the engine is not ready', () => {
    const setSelectedCharacterId = vi.fn();
    const setSelectedProfileName = vi.fn();
    const mockEnginesError = [
      { engine_id: 'elevenlabs', display_name: 'ElevenLabs', enabled: true, status: 'error' }
    ];

    render(
      <CharacterSidebar
        characters={mockCharacters}
        speakers={mockSpeakers as any}
        speakerProfiles={mockProfiles}
        engines={mockEnginesError as any}
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

    expect(screen.getByText(/Char 1.*🚫/)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Char 1/).parentElement!);

    // Assignment should still be triggered
    expect(setSelectedCharacterId).toHaveBeenCalledWith('char-1');
    expect(setSelectedProfileName).toHaveBeenCalledWith('Profile 1');
  });

  it('shows 🚫 for XTTS voices when XTTS is disabled', () => {
    const mockProfilesNoEngine: SpeakerProfile[] = [
      { name: 'Legacy Voice', speaker_id: 'speaker-1', variant_name: 'Standard', voice_id: 'v1', provider: 'elevenlabs' } as any
    ];
    const mockEnginesDisabled = [
      { engine_id: 'xtts', display_name: 'XTTS', enabled: false, status: 'ready' }
    ];

    render(
      <CharacterSidebar
        characters={[{ id: 'char-1', project_id: 'p1', name: 'Legacy Char', color: '#f00', speaker_profile_name: 'Voice 1' } as any]}
        speakers={mockSpeakers as any}
        speakerProfiles={mockProfilesNoEngine}
        engines={mockEnginesDisabled as any}
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

    expect(screen.getByText(/Legacy Char.*🚫/)).toBeInTheDocument();
  });
});
