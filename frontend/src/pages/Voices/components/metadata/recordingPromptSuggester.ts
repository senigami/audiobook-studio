/**
 * recordingPromptSuggester.ts — dynamic recording guide (Task 002)
 *
 * suggestRecordingPrompt(attrs: VoiceAttributes): SuggestionResult | null
 *
 * Pure deterministic function, no API call — mirrors the shape of
 * `buildIconPrompt()` (frontend/src/pages/VoiceLab/iconPrompt.ts): given a
 * voice's tagged attributes, either (a) match against the 39 curated
 * archetypes in `recordingArchetypes.ts` and reuse a hand-authored prompt
 * verbatim, or (b) compose a fallback prompt from Class-opening lines +
 * Pace-rhythm cues + Tone/Timbre fragments (`recordingFragments.ts`).
 *
 * design-docs/plans/active/dynamic_recording_guide/01-map.md — map + invariants.
 * design-docs/plans/active/dynamic_recording_guide/tasks/002-suggester-function.md — spec.
 */

import type { VoiceAttributes } from '@/types';
import { recordingArchetypes, type RecordingArchetype } from './recordingArchetypes';
import { getFragment } from './recordingFragments';

export interface SuggestionResult {
    prompt: string;
    directionNote: string;
    matchedArchetype: string | null;
    confidence: 'exact' | 'close' | 'composed';
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

function scoreArchetype(attrs: VoiceAttributes, archetype: RecordingArchetype): number {
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

// --- Composition fallback (task spec, "Algorithm" step 4) -----------------

/** One narrative opening line per Class taxonomy value. */
const CLASS_OPENINGS: Record<string, string> = {
    human: 'A person is about to speak.',
    synthetic: 'This is a synthetic, AI-generated voice.',
    creature: "Something not quite human is about to speak.",
    character: 'A stylized, larger-than-life character is about to speak.',
    deity: 'A voice older than the room it is speaking in is about to be heard.',
};

/** One rhythm direction per Pace taxonomy value. */
const PACE_CUES: Record<string, string> = {
    slow: 'Let the pace stay unhurried, giving every word room to land.',
    measured: 'Keep the rhythm steady and deliberate, never rushed.',
    moderate: 'Deliver it at a natural, conversational pace.',
    brisk: 'Move briskly, with energy pushing each phrase forward.',
    fast: 'Keep the pace quick, barely pausing for breath.',
    variable: 'Let the pace shift unpredictably, speeding up and slowing down as the moment demands.',
};

function capitalize(s: string): string {
    return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function composeFallback(attrs: VoiceAttributes): SuggestionResult {
    const fragments: string[] = [];
    for (const tone of attrs.tone ?? []) {
        const fragment = getFragment('tone', tone);
        if (fragment) fragments.push(fragment);
    }
    for (const timbre of attrs.timbre ?? []) {
        const fragment = getFragment('timbre', timbre);
        if (fragment) fragments.push(fragment);
    }

    const opening = attrs.class ? CLASS_OPENINGS[attrs.class] : undefined;
    const paceCue = attrs.pace ? PACE_CUES[attrs.pace] : undefined;

    const sentences: string[] = [];
    if (opening) sentences.push(opening);
    if (fragments.length > 0) {
        sentences.push(`Read a line that feels ${fragments.join(', ')}.`);
    }
    if (paceCue) sentences.push(paceCue);

    const prompt = sentences.length > 0
        ? sentences.join(' ')
        : "Read a line that captures this voice's character.";

    const directionNote = fragments.length > 0
        ? `${capitalize(fragments[0])}.`
        : (opening ?? "Let the performance reflect this voice's intended character.");

    return {
        prompt,
        directionNote,
        matchedArchetype: null,
        confidence: 'composed',
    };
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

    let bestArchetype: RecordingArchetype | null = null;
    let bestScore = -1;
    for (const archetype of recordingArchetypes) {
        const score = scoreArchetype(attrs, archetype);
        if (score > bestScore) {
            bestScore = score;
            bestArchetype = archetype;
        }
    }

    if (bestArchetype && bestScore >= CLOSE_THRESHOLD) {
        return {
            prompt: bestArchetype.recording_prompt,
            directionNote: bestArchetype.direction_note,
            matchedArchetype: bestArchetype.archetype_name,
            confidence: bestScore >= EXACT_THRESHOLD ? 'exact' : 'close',
        };
    }

    return composeFallback(attrs);
}
