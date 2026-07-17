/**
 * iconPrompt.ts — R5-T7
 *
 * buildIconPrompt(meta: VoiceMetadata): string
 *
 * Pure deterministic string template for an image-generation prompt.
 * Built from voice attributes + description so uniform icons can be created
 * across the catalog. No API call is made — clipboard-only (R-F).
 *
 * Framing is square 1:1 head-and-shoulders (2026-07-17, owner request): the
 * archetype appearance_descriptions are portrait-framed to match, and manual
 * attribute selections (class/age/gender/tone/timbre) are translated into
 * visual descriptors via iconPromptFragments instead of bare keywords — on
 * BOTH the archetype-match and composed paths.
 *
 * Spec reference: design-docs/specs/voice-bundles.md §11.1 "Copy icon prompt (doc 04 C6)"
 * and design-docs/plans/final_release/04_voice_metadata_and_tagging.md item C6.
 */

import type { VoiceMetadata, VoiceAttributes } from '@/types';
import { findMatchingArchetype } from '@/pages/Voices/components/metadata/recordingPromptSuggester';
import { visualFragmentsForAttributes } from '@/pages/VoiceLab/iconPromptFragments';

/** Shared square-portrait framing (prefix) and constraints (suffix). */
const FRAME_PREFIX = 'Square 1:1 head-and-shoulders portrait, flat illustration, uniform style';
const FRAME_SUFFIX = 'Centered, neutral background, no text.';

/** Attribute keys rendered as visual fragments — excluded from the keyword tail. */
const VISUAL_KEYS = new Set<string>(['class', 'gender', 'age', 'tone', 'timbre']);

/** Non-visual attribute keys shown as keywords, in fixed order first */
const CORE_KEYWORD_KEYS: Array<keyof VoiceAttributes> = ['accent', 'pace'];

/**
 * Build a uniform square-portrait image-generation prompt from VoiceMetadata.
 * Only fields present on the object are included — taxonomy-agnostic,
 * same dynamic-walk approach as voicePillsFromMetadata.
 */
export function buildIconPrompt(meta: VoiceMetadata | null | undefined): string {
    if (!meta) return `${FRAME_PREFIX}. ${FRAME_SUFFIX}`;

    const attrs = meta.attributes ?? {};

    // Keyword tail: attributes NOT covered by the visual-fragment maps
    // (accent, pace, language, style, use_case, quality, …) + free tags.
    const keywords: string[] = [];
    const pushVal = (val: unknown) => {
        if (!val) return;
        if (Array.isArray(val)) keywords.push(...(val as string[]).filter(Boolean));
        else keywords.push(val as string);
    };
    for (const key of CORE_KEYWORD_KEYS) pushVal(attrs[key]);
    const extendedKeys = Object.keys(attrs)
        .filter(k => !VISUAL_KEYS.has(k) && !CORE_KEYWORD_KEYS.includes(k as keyof VoiceAttributes))
        .sort();
    for (const key of extendedKeys) pushVal((attrs as Record<string, unknown>)[key]);
    if (meta.tags && meta.tags.length > 0) keywords.push(...meta.tags);

    const keywordStr = keywords.length > 0 ? `voice character: ${keywords.join(', ')}` : '';
    const descStr = meta.description?.trim() ? `described as: ${meta.description.trim()}` : '';
    const tail = [keywordStr, descStr].filter(Boolean).join('; ');
    const tailSentence = tail ? ` Additional detail: ${tail}.` : '';

    // Archetype match (user-reported gap, 2026-07-16): the 103-row voice
    // archetype table (design-docs/reference/voice-archetypes/) carries a
    // hand-authored, portrait-framed `appearance_description` per archetype.
    // When the voice's tagged attributes score a close/exact match (same
    // scoring `suggestRecordingPrompt` uses, via the shared
    // `findMatchingArchetype`), lead with that description — then still let
    // manual selections that DIFFER from the archetype add visual detail.
    const archetype = findMatchingArchetype(attrs);
    if (archetype) {
        const { subject, details } = visualFragmentsForAttributes(attrs, {
            class: archetype.class,
            gender: archetype.gender,
            age: archetype.age,
            tones: archetype.dominant_tones,
            timbres: archetype.dominant_timbres,
        });
        const extras = [subject, ...details].filter(Boolean).join('; ');
        const extraSentence = extras ? ` Also: ${extras}.` : '';
        return `${FRAME_PREFIX}: ${archetype.appearance_description}${extraSentence}${tailSentence} ${FRAME_SUFFIX}`;
    }

    // Composed path: manual attributes rendered as visual descriptors.
    const { subject, details } = visualFragmentsForAttributes(attrs);
    const visual = [subject, ...details].filter(Boolean).join('; ');

    if (!visual && !tail) {
        // Untagged / name-only fallback
        return `${FRAME_PREFIX} of "${meta.name}". ${FRAME_SUFFIX}`;
    }

    const body = [visual, tail].filter(Boolean).join('. Additional detail: ');
    if (!visual) {
        return `${FRAME_PREFIX}: ${tail}. ${FRAME_SUFFIX}`;
    }
    return `${FRAME_PREFIX}: ${body}. ${FRAME_SUFFIX}`;
}
