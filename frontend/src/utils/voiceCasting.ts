import type { Character, Speaker, SpeakerProfile, TtsEngine, VoiceMetadata } from '@/types';
import { getDefaultVoiceProfileName } from '@/utils/voiceProfiles';

/**
 * Casting helpers — bridge the AI casting contract (POST /api/voices/cast,
 * design-docs/specs/voice-bundles.md §9) to the voice catalog data the app
 * already has in memory. Pure, side-effect-free — no network calls here.
 */

/** Build one casting-card catalog entry (plan §2.2) from a voice's installed metadata. */
export function voiceMetadataToCastingCard(voice: VoiceMetadata): Record<string, unknown> {
  return {
    voice_id: voice.id,
    card_version: '1.0',
    description: voice.description || '',
    languages: voice.languages || [],
    class: voice.attributes?.class,
    gender: voice.attributes?.gender,
    age: voice.attributes?.age,
    accent: voice.attributes?.accent,
    tone: voice.attributes?.tone || [],
    timbre: voice.attributes?.timbre || [],
  };
}

/** Build the full casting catalog from every installed voice's metadata. */
export function buildCastingCatalog(voices: VoiceMetadata[]): Array<Record<string, unknown>> {
  return voices.map(voiceMetadataToCastingCard);
}

/**
 * Build the character brief sent to POST /api/voices/cast from the (currently
 * attribute-light) Character record. There is no description/notes field on
 * Character today, so the brief carries only name — cast_voices() degrades
 * gracefully (attribute-match score contributions simply don't fire).
 */
export function characterToCastingBrief(character: Pick<Character, 'name'>): {
  name: string;
} {
  return { name: character.name };
}

/**
 * Resolve a casting recommendation's `voice_id` (a voice.json id, e.g. "gravel-road")
 * back to an assignable `speaker_profile_name` — the same value the real voice
 * assignment mutation (api.updateCharacter's speaker_profile_name field) expects.
 *
 * Matches by voice display name (VoiceMetadata.name === Speaker.name), then picks
 * that speaker's default/selectable profile — mirroring the resolution used in
 * CastPalette/CharacterSidebar. Returns null when the voice can't be resolved to
 * a live speaker (e.g. it was deleted after the catalog snapshot was taken), or
 * when engines is an empty array — a real, reachable "not hydrated yet" / "TTS
 * server unavailable" state (see App.tsx's initial `engines={initialData?.engines
 * || []}` and GET /api/home's engines: [] on EngineUnavailableError) in which
 * engine readiness can't be verified. getDefaultVoiceProfileName treats an empty
 * engines array as "no filter" for its other (non-casting) callers that
 * intentionally omit engines to pick a display-only default name, so that
 * fail-open behavior can't be safely reused here — this call site fails closed
 * instead, matching isVoiceProfileSelectable's fail-closed handling of engines=[].
 */
export function resolveCastingVoiceIdToProfileName(
  voiceId: string,
  voiceMetadataList: VoiceMetadata[],
  speakers: Speaker[],
  speakerProfiles: SpeakerProfile[],
  engines?: TtsEngine[]
): string | null {
  if (engines && engines.length === 0) return null;
  const meta = voiceMetadataList.find(v => v.id === voiceId);
  if (!meta) return null;
  const speaker = speakers.find(s => s.name === meta.name);
  if (!speaker) return null;
  const profiles = speakerProfiles.filter(p => p.speaker_id === speaker.id);
  return getDefaultVoiceProfileName(profiles, engines);
}
