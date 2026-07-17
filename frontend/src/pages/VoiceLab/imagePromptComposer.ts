/**
 * imagePromptComposer.ts — mad-lib composed-path upgrade for buildIconPrompt.
 *
 * Owner ask (2026-07-17): "did we get a mad lib style image generation prompt
 * as well? it was pretty generic before" — the composed (no-archetype-match)
 * path of buildIconPrompt used to just semicolon-join a handful of fragment
 * phrases from iconPromptFragments.ts. This mirrors the mad-lib upgrade
 * cueComposer.ts already got for the text recording cue: CLASS changes the
 * opening sentence's framing, TONE count changes the expression sentence's
 * STRUCTURE (not just its words), and TIMBRE independently changes a second
 * sentence's structure by its own count — so selections visibly reshape the
 * composed prose, not just fill one static template with different words.
 *
 * This file owns SENTENCE STRUCTURE/COMPOSITION only. All visual vocabulary
 * (CLASS_VISUALS / AGE_VISUALS / GENDER_VISUALS / TONE_VISUALS /
 * TIMBRE_VISUALS) is imported unchanged from iconPromptFragments.ts — no
 * parallel word-level vocabulary is introduced here.
 *
 * Pure, deterministic, no API calls, no randomness. Scope stays visual/
 * portrait description (expression, lighting, texture, apparent age /
 * presentation) — no narrative or backstory content.
 */

import type { VoiceAttributes } from '@/types';
import {
    CLASS_VISUALS,
    AGE_VISUALS,
    GENDER_VISUALS,
    TONE_VISUALS,
    TIMBRE_VISUALS,
} from '@/pages/VoiceLab/iconPromptFragments';

function capitalize(s: string): string {
    return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Strip a leading "with " so it can be re-attached exactly once by a template. */
function stripLeadingWith(s: string): string {
    return s.replace(/^with\s+/i, '');
}

/**
 * Resolve age + gender into an ordered list of non-empty descriptor
 * fragments. GENDER_VISUALS['not-applicable'] and unset fields drop out
 * silently — no dangling commas or empty clauses downstream.
 */
function ageGenderFragments(attrs: VoiceAttributes): string[] {
    const age = attrs.age ? (AGE_VISUALS[attrs.age] ?? attrs.age) : '';
    const gender = attrs.gender ? (GENDER_VISUALS[attrs.gender] ?? attrs.gender) : '';
    return [age, gender].filter(Boolean);
}

/**
 * CLASS opening sentence. Sentence SHAPE (not just the noun) varies by
 * class: human leads with an explicit "with" clause; character is framed
 * as an imperative ("Picture …"); synthetic as a terse declarative ("This
 * is …"); creature and deity lead with their base descriptor (deity's
 * luminous-aura framing, per the vocabulary) before any age/gender clause.
 * Degrades gracefully to a bare class sentence, or nothing at all, when
 * age/gender/class data is missing.
 */
function classOpening(attrs: VoiceAttributes): string {
    const cls = attrs.class;
    const frags = ageGenderFragments(attrs);
    const appositive = frags.length > 0 ? `, ${frags.join(', ')}` : '';

    if (!cls) {
        if (frags.length === 0) return '';
        const first = stripLeadingWith(frags[0]);
        const rest = frags.slice(1);
        return `A subject with ${[first, ...rest].join(', ')}.`;
    }

    switch (cls) {
        case 'human': {
            const base = CLASS_VISUALS.human;
            if (frags.length === 0) return `${capitalize(base)}.`;
            const first = stripLeadingWith(frags[0]);
            const rest = frags.slice(1);
            return `${capitalize(base)} with ${[first, ...rest].join(', ')}.`;
        }
        case 'character': {
            const base = CLASS_VISUALS.character;
            return `Picture ${base}${appositive}.`;
        }
        case 'synthetic': {
            const base = CLASS_VISUALS.synthetic;
            return `This is ${base}${appositive}.`;
        }
        case 'creature': {
            const base = CLASS_VISUALS.creature;
            return `${capitalize(base)}${appositive}.`;
        }
        case 'deity': {
            const base = CLASS_VISUALS.deity;
            return `${capitalize(base)}${appositive}.`;
        }
        default: {
            // Unknown taxonomy class value: pass through as the subject noun,
            // same "keep as keyword" spirit as visualFragmentsForAttributes.
            return `A ${cls} subject${appositive}.`;
        }
    }
}

/**
 * TONE sentence. STRUCTURE changes by tone count, not just word swaps:
 * 0 -> no sentence at all; 1 -> a direct "shows" clause; 2 -> a "blends X
 * with Y" clause; 3+ -> names the first two directly and folds the
 * remainder into a trailing "besides" clause.
 */
function toneSentence(attrs: VoiceAttributes): string {
    const tones = (attrs.tone ?? []).filter(Boolean);
    if (tones.length === 0) return '';
    const resolved = tones.map(t => TONE_VISUALS[t] ?? t);

    if (resolved.length === 1) {
        return `Their expression shows ${resolved[0]}.`;
    }
    if (resolved.length === 2) {
        return `Their expression blends ${resolved[0]} with ${resolved[1]}.`;
    }
    const [first, second, ...rest] = resolved;
    return `Their expression shows ${first} and ${second}, with a touch of ${rest.join(', ')} besides.`;
}

/**
 * TIMBRE sentence. Independent count-based structure from toneSentence so
 * the two don't read identically formulaic: 0 -> nothing; 1 -> a "carry"
 * clause; 2 -> a "meets … in the surface and lighting" clause; 3+ -> a
 * "meets … rounded out by …" clause folding the remainder.
 */
function timbreSentence(attrs: VoiceAttributes): string {
    const timbres = (attrs.timbre ?? []).filter(Boolean);
    if (timbres.length === 0) return '';
    const resolved = timbres.map(t => TIMBRE_VISUALS[t] ?? t);

    if (resolved.length === 1) {
        return `The surface and lighting carry ${resolved[0]}.`;
    }
    if (resolved.length === 2) {
        return `${capitalize(resolved[0])} meets ${resolved[1]} in the surface and lighting.`;
    }
    const [first, second, ...rest] = resolved;
    return `${capitalize(first)} meets ${second}, rounded out by ${rest.join(' and ')}.`;
}

/**
 * Compose a natural, varied prose description of a square head-and-shoulders
 * portrait subject from a voice's tagged class/gender/age/tone/timbre
 * attributes. Pure and deterministic — same attrs always produce the same
 * description. Returns '' when nothing is tagged at all.
 */
export function composeImageDescription(attrs: VoiceAttributes): string {
    const sentences = [classOpening(attrs), toneSentence(attrs), timbreSentence(attrs)].filter(Boolean);
    return sentences.join(' ');
}
