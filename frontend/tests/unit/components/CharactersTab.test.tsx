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

const tempCharacter = {
  id: 'char-2',
  project_id: 'proj-1',
  name: 'Chapter Extra',
  speaker_profile_name: null,
  default_emotion: null,
  color: '#8b5cf6',
  chapter_id: 'chapter-1',
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
  createCharacter: vi.fn().mockResolvedValue({ status: 'ok', character_id: 'char-new' }),
  updateCharacter: vi.fn().mockResolvedValue({ status: 'ok' }),
  deleteCharacter: vi.fn().mockResolvedValue({ status: 'ok' }),
  promoteCharacter: vi.fn().mockResolvedValue({ status: 'ok' }),
  castVoices: vi.fn().mockResolvedValue({
    contract_version: '1.0',
    character: 'Sheriff Boone',
    recommendations: [{ voice_id: 'gravel-road', score: 0.85, reason: 'class matches (human); gender matches (masculine)' }],
    needs_input: false,
  }),
};

const emitToastMock = vi.fn();
vi.mock('@/utils/toast', () => ({ emitToast: (...args: unknown[]) => emitToastMock(...args), TOAST_VISIBLE_MS: 4000 }));

vi.mock('@/api', () => ({ api: mockApi }));

describe('CharactersTab — Suggest voices action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.fetchCharacters.mockResolvedValue([character]);
    mockApi.listVoicesWithMetadata.mockResolvedValue(voiceMetadataList);
    mockApi.createCharacter.mockResolvedValue({ status: 'ok', character_id: 'char-new' });
    mockApi.updateCharacter.mockResolvedValue({ status: 'ok' });
    mockApi.deleteCharacter.mockResolvedValue({ status: 'ok' });
    mockApi.promoteCharacter.mockResolvedValue({ status: 'ok' });
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

  it('has an accessible label on the per-row rename input', async () => {
    const { CharactersTab } = await import('@/components/CharactersTab');

    render(
      <CharactersTab
        projectId="proj-1"
        speakers={speakers}
        speakerProfiles={speakerProfiles}
        engines={engines}
      />
    );

    expect(await screen.findByLabelText('Character name: Sheriff Boone')).toBeInTheDocument();
  });

  it('shows a toast when adding a character fails', async () => {
    mockApi.createCharacter.mockRejectedValueOnce(new Error('create failed'));
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

    fireEvent.change(screen.getByPlaceholderText('e.g. Wizard, Captain...'), { target: { value: 'New Guy' } });
    fireEvent.click(screen.getByTitle('Create Character'));

    await waitFor(() => expect(emitToastMock).toHaveBeenCalled());
  });

  it('shows a toast and reverts the optimistic update when renaming a character fails', async () => {
    mockApi.updateCharacter.mockRejectedValueOnce(new Error('rename failed'));
    const { CharactersTab } = await import('@/components/CharactersTab');

    render(
      <CharactersTab
        projectId="proj-1"
        speakers={speakers}
        speakerProfiles={speakerProfiles}
        engines={engines}
      />
    );

    const input = await screen.findByDisplayValue('Sheriff Boone');
    fireEvent.change(input, { target: { value: 'Deputy Boone' } });
    fireEvent.blur(input);

    await waitFor(() => expect(emitToastMock).toHaveBeenCalled());
    // Reverted: loadCharacters() re-fetches and the original name reappears.
    await waitFor(() => expect(screen.getByDisplayValue('Sheriff Boone')).toBeInTheDocument());
    expect(screen.queryByDisplayValue('Deputy Boone')).not.toBeInTheDocument();
  });

  it('shows an undo toast immediately on delete, then defers the actual delete', async () => {
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
    fireEvent.click(screen.getByTitle('Delete Character'));
    await waitFor(() => screen.getByRole('dialog'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    // The delete toast (with an Undo action) fires immediately, but the row
    // and the actual api.deleteCharacter call are both deferred.
    await waitFor(() => expect(emitToastMock).toHaveBeenCalledWith(
      expect.stringContaining('Deleted'),
      expect.objectContaining({ label: 'Undo', onClick: expect.any(Function) })
    ));
    expect(screen.getByDisplayValue('Sheriff Boone')).toBeInTheDocument();
    expect(mockApi.deleteCharacter).not.toHaveBeenCalled();
  });

  it('clicking Undo cancels the deferred delete — the character is never removed', async () => {
    const { CharactersTab } = await import('@/components/CharactersTab');
    vi.useFakeTimers();

    render(
      <CharactersTab
        projectId="proj-1"
        speakers={speakers}
        speakerProfiles={speakerProfiles}
        engines={engines}
      />
    );

    await vi.waitFor(() => expect(screen.getByDisplayValue('Sheriff Boone')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Delete Character'));
    await vi.waitFor(() => screen.getByRole('dialog'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await vi.waitFor(() => expect(emitToastMock).toHaveBeenCalled());
    const [, action] = emitToastMock.mock.calls[emitToastMock.mock.calls.length - 1];
    action.onClick();

    await vi.advanceTimersByTimeAsync(4000);

    expect(mockApi.deleteCharacter).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Sheriff Boone')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('lets the deferred delete commit if Undo is never clicked, and shows a failure toast if it fails', async () => {
    mockApi.deleteCharacter.mockRejectedValueOnce(new Error('delete failed'));
    const { CharactersTab } = await import('@/components/CharactersTab');
    vi.useFakeTimers();

    render(
      <CharactersTab
        projectId="proj-1"
        speakers={speakers}
        speakerProfiles={speakerProfiles}
        engines={engines}
      />
    );

    await vi.waitFor(() => expect(screen.getByDisplayValue('Sheriff Boone')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Delete Character'));
    await vi.waitFor(() => screen.getByRole('dialog'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await vi.advanceTimersByTimeAsync(4000);

    expect(mockApi.deleteCharacter).toHaveBeenCalledWith('char-1');
    expect(emitToastMock).toHaveBeenCalledWith('Failed to delete character.');
    expect(screen.getByDisplayValue('Sheriff Boone')).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('renders a Promote action only for chapter-scoped temp characters, and promotes via api.promoteCharacter', async () => {
    mockApi.fetchCharacters.mockResolvedValue([character, tempCharacter]);
    const { CharactersTab } = await import('@/components/CharactersTab');

    render(
      <CharactersTab
        projectId="proj-1"
        speakers={speakers}
        speakerProfiles={speakerProfiles}
        engines={engines}
      />
    );

    await waitFor(() => expect(screen.getByDisplayValue('Chapter Extra')).toBeInTheDocument());

    // Only one temp badge / promote button, scoped to the chapter-scoped character.
    expect(screen.getAllByTitle('Chapter-scoped temporary character')).toHaveLength(1);
    const promoteButton = screen.getByTitle('Promote to a permanent book-level character');
    expect(screen.getAllByTitle('Promote to a permanent book-level character')).toHaveLength(1);

    fireEvent.click(promoteButton);

    await waitFor(() => expect(mockApi.promoteCharacter).toHaveBeenCalledWith('char-2'));
  });
});
