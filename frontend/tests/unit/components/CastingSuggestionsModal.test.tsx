/**
 * CastingSuggestionsModal — "Suggest voices for this character" (AI casting UI gap).
 *
 * Covers:
 *  1. Calls POST /api/voices/cast with the casting contract shape (character brief + catalog)
 *  2. Renders ranked recommendations: voice name, score, reason
 *  3. Confirming a suggestion calls onAssign with the resolved speaker_profile_name — never auto-assigns
 *  4. needs_input: true renders the thin-description empty-state copy
 *  5. Unknown contract/card version (422) surfaces a sane error state
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Character, Speaker, SpeakerProfile, TtsEngine, VoiceMetadata } from '@/types';

const character: Character = {
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

describe('CastingSuggestionsModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls POST /api/voices/cast with the casting contract shape', async () => {
    const { CastingSuggestionsModal } = await import('@/components/CastingSuggestionsModal');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        contract_version: '1.0',
        character: 'Sheriff Boone',
        recommendations: [{ voice_id: 'gravel-road', score: 0.85, reason: 'class matches (human); gender matches (masculine)' }],
        needs_input: false,
      }),
    }) as any;

    render(
      <CastingSuggestionsModal
        isOpen={true}
        character={character}
        voiceMetadataList={voiceMetadataList}
        speakers={speakers}
        speakerProfiles={speakerProfiles}
        engines={engines}
        onClose={vi.fn()}
        onAssign={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/voices/cast',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.contract_version).toBe('1.0');
    expect(body.character).toEqual({ name: 'Sheriff Boone' });
    expect(body.catalog).toEqual([
      expect.objectContaining({ voice_id: 'gravel-road', card_version: '1.0' }),
    ]);
  });

  it('renders ranked recommendations with name, score, and reason', async () => {
    const { CastingSuggestionsModal } = await import('@/components/CastingSuggestionsModal');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        contract_version: '1.0',
        character: 'Sheriff Boone',
        recommendations: [{ voice_id: 'gravel-road', score: 0.85, reason: 'class matches (human); gender matches (masculine)' }],
        needs_input: false,
      }),
    }) as any;

    render(
      <CastingSuggestionsModal
        isOpen={true}
        character={character}
        voiceMetadataList={voiceMetadataList}
        speakers={speakers}
        speakerProfiles={speakerProfiles}
        engines={engines}
        onClose={vi.fn()}
        onAssign={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Gravel Road')).toBeInTheDocument();
    });
    expect(screen.getByText('85% match')).toBeInTheDocument();
    expect(screen.getByText('class matches (human); gender matches (masculine)')).toBeInTheDocument();
  });

  it('confirming a suggestion resolves the speaker_profile_name and calls onAssign — never auto-assigns', async () => {
    const { CastingSuggestionsModal } = await import('@/components/CastingSuggestionsModal');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        contract_version: '1.0',
        character: 'Sheriff Boone',
        recommendations: [{ voice_id: 'gravel-road', score: 0.85, reason: 'class matches (human)' }],
        needs_input: false,
      }),
    }) as any;

    const onAssign = vi.fn();

    render(
      <CastingSuggestionsModal
        isOpen={true}
        character={character}
        voiceMetadataList={voiceMetadataList}
        speakers={speakers}
        speakerProfiles={speakerProfiles}
        engines={engines}
        onClose={vi.fn()}
        onAssign={onAssign}
      />
    );

    await waitFor(() => screen.getByText('Gravel Road'));

    // No assignment happens merely from fetching/rendering suggestions.
    expect(onAssign).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /use this voice/i }));

    expect(onAssign).toHaveBeenCalledTimes(1);
    expect(onAssign).toHaveBeenCalledWith('char-1', 'Gravel Road - Default');
  });

  it('shows thin-description empty-state copy when needs_input is true', async () => {
    const { CastingSuggestionsModal } = await import('@/components/CastingSuggestionsModal');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        contract_version: '1.0',
        character: 'Sheriff Boone',
        recommendations: [{ voice_id: 'gravel-road', score: 0.1, reason: 'no attribute match; description-only fallback' }],
        needs_input: true,
      }),
    }) as any;

    render(
      <CastingSuggestionsModal
        isOpen={true}
        character={character}
        voiceMetadataList={voiceMetadataList}
        speakers={speakers}
        speakerProfiles={speakerProfiles}
        engines={engines}
        onClose={vi.fn()}
        onAssign={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/not enough eligible voices/i)).toBeInTheDocument();
    });
  });

  it('surfaces a graceful error instead of silently assigning when engines is empty (not hydrated yet)', async () => {
    // Regression: engines=[] is reachable on first paint (App.tsx renders before hydration
    // completes) and from the server during TTS watchdog startup/circuit-open. Confirming a
    // suggestion in this window must not silently assign a profile of unknown engine readiness.
    const { CastingSuggestionsModal } = await import('@/components/CastingSuggestionsModal');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        contract_version: '1.0',
        character: 'Sheriff Boone',
        recommendations: [{ voice_id: 'gravel-road', score: 0.85, reason: 'class matches (human)' }],
        needs_input: false,
      }),
    }) as any;

    const onAssign = vi.fn();

    render(
      <CastingSuggestionsModal
        isOpen={true}
        character={character}
        voiceMetadataList={voiceMetadataList}
        speakers={speakers}
        speakerProfiles={speakerProfiles}
        engines={[]}
        onClose={vi.fn()}
        onAssign={onAssign}
      />
    );

    await waitFor(() => screen.getByText('Gravel Road'));

    fireEvent.click(screen.getByRole('button', { name: /use this voice/i }));

    expect(onAssign).not.toHaveBeenCalled();
    expect(screen.getByText(/no longer available to assign/i)).toBeInTheDocument();
  });

  it('surfaces a 422 (unknown contract/card version) error state', async () => {
    const { CastingSuggestionsModal } = await import('@/components/CastingSuggestionsModal');

    const errorMessage = "Unknown contract_version '99.0'. Supported: 1.0";
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ detail: errorMessage }),
    }) as any;

    render(
      <CastingSuggestionsModal
        isOpen={true}
        character={character}
        voiceMetadataList={voiceMetadataList}
        speakers={speakers}
        speakerProfiles={speakerProfiles}
        engines={engines}
        onClose={vi.fn()}
        onAssign={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });
});
