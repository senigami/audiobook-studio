/**
 * recordingPromptSuggester.ts — dynamic recording guide (Task 002)
 *
 * suggestRecordingPrompt(attrs: VoiceAttributes): SuggestionResult | null
 *
 * Pure deterministic function, no API call — mirrors the shape of
 * `buildIconPrompt()` (frontend/src/pages/VoiceLab/iconPrompt.ts): given a
 * voice's tagged attributes, either (a) match against the 103 curated
 * archetypes in `recordingArchetypes.ts` and reuse a hand-authored prompt
 * verbatim, or (b) compose a fallback read-aloud passage with the mad-lib
 * slot composer (`cueComposer.ts`) driven by Class/Tone/Timbre/Pace/Age.
 *
 * design-docs/plans/active/dynamic_recording_guide/01-map.md — map + invariants.
 * design-docs/plans/active/dynamic_recording_guide/tasks/002-suggester-function.md — spec.
 */

import type { VoiceAttributes } from '@/types';
import { recordingArchetypes, type RecordingArchetype } from './recordingArchetypes';
import { composeCuePassage } from './cueComposer';

export interface SuggestionResult {
    prompt: string;
    directionNote: string;
    matchedArchetype: string | null;
    confidence: 'exact' | 'close' | 'composed';
    /**
     * Short showcase line for TTS-generated voice-sample previews, distinct from
     * `prompt` which is written for a human voice actor. On a close/exact archetype
     * match this is the archetype's hand-authored `sample_text` (highest trust);
     * on the composed path it is a theme-matched line from `composeCuePassage()`.
     * `null` only for the no-meaningful-attrs case, where the whole suggestion is
     * null anyway — callers keep treating null as "don't touch what's already set."
     */
    sampleText: string | null;
}

// --- Scoring weights (task spec, "Algorithm" step 2) ---------------------
const CLASS_MATCH_POINTS = 3;
const GENDER_MATCH_POINTS = 1;
const AGE_MATCH_POINTS = 1;
const TONE_OVERLAP_WEIGHT = 3;
const TIMBRE_OVERLAP_WEIGHT = 3;
const PACE_MATCH_POINTS = 1;
/** CLASS_MATCH_POINTS + GENDER_MATCH_POINTS + AGE_MATCH_POINTS + TONE_OVERLAP_WEIGHT + TIMBRE_OVERLAP_WEIGHT + PACE_MATCH_POINTS */
export const MAX_SCORE =
    CLASS_MATCH_POINTS + GENDER_MATCH_POINTS + AGE_MATCH_POINTS + TONE_OVERLAP_WEIGHT + TIMBRE_OVERLAP_WEIGHT + PACE_MATCH_POINTS; // = 12

/**
 * Tier thresholds, out of MAX_SCORE = 12.
 *
 * EXACT_THRESHOLD = 10 (~83% of max): reachable only when class/gender/age/pace
 * all match (6 points) plus tone+timbre overlap is high (Jaccard ~0.67+ on both,
 * ~4 of the remaining 6 points) — i.e. the voice's tags are nearly identical to
 * the archetype, so its curated prompt can be reused with full confidence.
 *
 * CLOSE_THRESHOLD = 6 (50% of max): reachable with a class match (3) plus a
 * partial match on the remaining fields/tag overlap — "recognizably similar"
 * to a curated archetype without being a near-duplicate. Below this, tag
 * overlap is too thin to trust a curated prompt verbatim, so we compose
 * instead.
 */
export const EXACT_THRESHOLD = 10;
export const CLOSE_THRESHOLD = 6;

function jaccard(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) return 0;
    const setA = new Set(a);
    const setB = new Set(b);
    let intersection = 0;
    for (const v of setA) {
        if (setB.has(v)) intersection += 1;
    }
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
}

function splitList(csv: string): string[] {
    return csv.split(',').map(s => s.trim()).filter(Boolean);
}

export function scoreArchetype(attrs: VoiceAttributes, archetype: RecordingArchetype): number {
    let score = 0;

    if (attrs.class && archetype.class && attrs.class === archetype.class) {
        score += CLASS_MATCH_POINTS;
    }
    if (attrs.gender && archetype.gender && attrs.gender === archetype.gender) {
        score += GENDER_MATCH_POINTS;
    }
    if (attrs.age && archetype.age && attrs.age === archetype.age) {
        score += AGE_MATCH_POINTS;
    }

    const archetypeTones = splitList(archetype.dominant_tones);
    const archetypeTimbres = splitList(archetype.dominant_timbres);
    score += jaccard(attrs.tone ?? [], archetypeTones) * TONE_OVERLAP_WEIGHT;
    score += jaccard(attrs.timbre ?? [], archetypeTimbres) * TIMBRE_OVERLAP_WEIGHT;

    if (attrs.pace && archetype.pace && attrs.pace === archetype.pace) {
        score += PACE_MATCH_POINTS;
    }

    return score;
}

/** True if attrs has at least one non-empty field — guards against a generic suggestion for an untagged voice (INV-4). */
function hasMeaningfulAttrs(attrs: VoiceAttributes): boolean {
    return Object.values(attrs).some(value => {
        if (Array.isArray(value)) return value.length > 0;
        return value !== undefined && value !== null && value !== '';
    });
}

// --- Composition fallback (mad-lib composer, cueComposer.ts) --------------

/**
 * Compose a suggestion when no archetype scores close enough. Delegates to
 * `composeCuePassage()` — the passage becomes `prompt` (a real read-aloud
 * text, not just direction), the theme-matched showcase line becomes
 * `sampleText`, and the direction note is still built from the tone/timbre
 * fragment dictionary.
 */
function composeFallback(attrs: VoiceAttributes): SuggestionResult {
    const composed = composeCuePassage(attrs);
    return {
        prompt: composed.passage,
        directionNote: composed.directionNote,
        matchedArchetype: null,
        confidence: 'composed',
        sampleText: composed.sampleText,
    };
}

/**
 * Find the best-scoring archetype for a set of voice attributes, if any
 * score at least CLOSE_THRESHOLD. Shared by `suggestRecordingPrompt` (below)
 * and `buildIconPrompt` (frontend/src/pages/VoiceLab/iconPrompt.ts) so both
 * consumers of the 103-archetype table agree on what counts as "close enough
 * to reuse" rather than maintaining two scoring implementations.
 */
export function findMatchingArchetype(attrs: VoiceAttributes | null | undefined): RecordingArchetype | null {
    if (!attrs || !hasMeaningfulAttrs(attrs)) return null;

    let bestArchetype: RecordingArchetype | null = null;
    let bestScore = -1;
    for (const archetype of recordingArchetypes) {
        const score = scoreArchetype(attrs, archetype);
        if (score > bestScore) {
            bestScore = score;
            bestArchetype = archetype;
        }
    }

    return bestArchetype && bestScore >= CLOSE_THRESHOLD ? bestArchetype : null;
}

/**
 * Suggest a recording prompt from a voice's tagged attributes.
 *
 * Returns null when attrs is absent or has no meaningful fields set (INV-4) —
 * the caller disables the "Suggest from voice qualities" button in that case
 * rather than showing a generic suggestion.
 */
export function suggestRecordingPrompt(attrs: VoiceAttributes | null | undefined): SuggestionResult | null {
    if (!attrs || !hasMeaningfulAttrs(attrs)) return null;

    const bestArchetype = findMatchingArchetype(attrs);

    if (bestArchetype) {
        const score = scoreArchetype(attrs, bestArchetype);
        return {
            prompt: bestArchetype.recording_prompt,
            directionNote: bestArchetype.direction_note,
            matchedArchetype: bestArchetype.archetype_name,
            confidence: score >= EXACT_THRESHOLD ? 'exact' : 'close',
            sampleText: bestArchetype.sample_text,
        };
    }

    return composeFallback(attrs);
}
