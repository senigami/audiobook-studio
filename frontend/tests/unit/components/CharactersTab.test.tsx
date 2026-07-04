/**
 * CharactersTab — "Suggest voices for this character" wiring (AI casting UI gap).
 *
 * The real character-casting surface (Book > Cast, CastingStage.tsx) renders this
 * component. These tests confirm the "Suggest voices" action opens the casting
 * modal for the right character, fetches the voice catalog via the existing
 * GET /api/voices/ endpoint, and that confirming a suggestion assigns through
 * the existing real api.updateCharacter mutation — never a new one.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Speaker, SpeakerProfile, TtsEngine, VoiceMetadata } from '@/types';

const character = {
  id: 'char-1',
  project_id: 'proj-1',
  name: 'Sheriff Boone',
  speaker_profile_name: null,
  default_emotion: null,
  color: '#8b5cf6',
};

const voiceMetadataList: VoiceMetadata[] = [
  {
    id: 'gravel-road',
    name: 'Gravel Road',
    is_untagged: false,
    description: 'A weathered, low Southern drawl.',
    attributes: { class: 'human', gender: 'masculine', age: 'senior' },
  },
];

const speakers: Speaker[] = [
  { id: 'speaker-1', name: 'Gravel Road', default_profile_name: 'Gravel Road - Default', created_at: 0, updated_at: 0 },
];

const speakerProfiles: SpeakerProfile[] = [
  {
    name: 'Gravel Road - Default',
    wav_count: 3,
    speed: 1,
    is_default: true,
    speaker_id: 'speaker-1',
    variant_name: 'Default',
    engine: 'xtts',
    preview_url: null,
    samples: [],
  } as SpeakerProfile,
];

const engines: TtsEngine[] = [
  { engine_id: 'xtts', enabled: true, status: 'ready', display_name: 'XTTS' } as TtsEngine,
];

const mockApi = {
  fetchCharacters: vi.fn().mockResolvedValue([character]),
  listVoicesWithMetadata: vi.fn().mockResolvedValue(voiceMetadataList),
  updateCharacter: vi.fn().mockResolvedValue({ status: 'ok' }),
  castVoices: vi.fn().mockResolvedValue({
    contract_version: '1.0',
    character: 'Sheriff Boone',
    recommendations: [{ voice_id: 'gravel-road', score: 0.85, reason: 'class matches (human); gender matches (masculine)' }],
    needs_input: false,
  }),
};

vi.mock('@/api', () => ({ api: mockApi }));

describe('CharactersTab — Suggest voices action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.fetchCharacters.mockResolvedValue([character]);
    mockApi.listVoicesWithMetadata.mockResolvedValue(voiceMetadataList);
    mockApi.updateCharacter.mockResolvedValue({ status: 'ok' });
    mockApi.castVoices.mockResolvedValue({
      contract_version: '1.0',
      character: 'Sheriff Boone',
      recommendations: [{ voice_id: 'gravel-road', score: 0.85, reason: 'class matches (human); gender matches (masculine)' }],
      needs_input: false,
    });
  });

  it('opens the casting modal for the clicked character and calls api.castVoices with its brief + the voice catalog', async () => {
    const { CharactersTab } = await import('@/components/CharactersTab');

    render(
      <CharactersTab
        projectId="proj-1"
        speakers={speakers}
        speakerProfiles={speakerProfiles}
        engines={engines}
      />
    );

    await waitFor(() => expect(screen.getByDisplayValue('Sheriff Boone')).toBeInTheDocument());

    fireEvent.click(screen.getByTitle('Suggest voices for this character'));

    await waitFor(() => {
      expect(mockApi.castVoices).toHaveBeenCalledWith(
        expect.objectContaining({
          character: { name: 'Sheriff Boone' },
          catalog: [expect.objectContaining({ voice_id: 'gravel-road' })],
        })
      );
    });

    expect(await screen.findByText('85% match')).toBeInTheDocument();
  });

  it('confirming a suggestion assigns through the existing real api.updateCharacter mutation', async () => {
    const { CharactersTab } = await import('@/components/CharactersTab');

    render(
      <CharactersTab
        projectId="proj-1"
        speakers={speakers}
        speakerProfiles={speakerProfiles}
        engines={engines}
      />
    );

    await waitFor(() => expect(screen.getByDisplayValue('Sheriff Boone')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Suggest voices for this character'));
    await waitFor(() => screen.getByRole('dialog'));
    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByText('Gravel Road')).toBeInTheDocument();
    });

    // No assignment call from opening the modal / fetching suggestions alone.
    expect(mockApi.updateCharacter).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /use this voice/i }));

    await waitFor(() => {
      expect(mockApi.updateCharacter).toHaveBeenCalledWith('char-1', undefined, 'Gravel Road - Default');
    });
  });
});
