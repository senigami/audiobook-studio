/**
 * iconPromptFragments.test.ts — square-portrait reframe, 2026-07-17
 *
 * - visualFragmentsForAttributes: composition, exclusion, unknown passthrough
 * - Portrait-safety regression guard: no appearance_description in the
 *   bundled archetype table (recordingArchetypes.ts, mirror of
 *   design-docs/reference/voice-archetypes/voice_archetypes.json) may
 *   reference below-the-shoulders anatomy — the icon prompt is a square
 *   head-and-shoulders portrait, so out-of-frame anatomy degrades the image.
 * - Fragment maps themselves must also be portrait-safe.
 */
import { describe, it, expect } from 'vitest';
import {
    visualFragmentsForAttributes,
    CLASS_VISUALS,
    AGE_VISUALS,
    GENDER_VISUALS,
    TONE_VISUALS,
    TIMBRE_VISUALS,
} from '@/pages/VoiceLab/iconPromptFragments';
import { recordingArchetypes } from '@/pages/Voices/components/metadata/recordingArchetypes';

describe('visualFragmentsForAttributes', () => {
    it('composes class/age/gender into the subject line', () => {
        const { subject } = visualFragmentsForAttributes({ class: 'human', age: 'senior', gender: 'masculine' });
        expect(subject).toContain(CLASS_VISUALS.human);
        expect(subject).toContain(AGE_VISUALS.senior);
        expect(subject).toContain(GENDER_VISUALS.masculine);
    });

    it('maps tones and timbres to visual details, tones first', () => {
        const { details } = visualFragmentsForAttributes({ tone: ['wise'], timbre: ['gravelly'] });
        expect(details).toEqual([TONE_VISUALS.wise, TIMBRE_VISUALS.gravelly]);
    });

    it('produces empty output for empty attributes', () => {
        expect(visualFragmentsForAttributes({})).toEqual({ subject: '', details: [] });
    });

    it('renders not-applicable gender as nothing (never stereotyped)', () => {
        const { subject } = visualFragmentsForAttributes({ gender: 'not-applicable' });
        expect(subject).toBe('');
    });

    it('passes unknown taxonomy values through as plain keywords', () => {
        const res = visualFragmentsForAttributes({ class: 'hologram', tone: ['zesty'], timbre: ['buzzy'] });
        expect(res.subject).toContain('hologram');
        expect(res.details).toEqual(['zesty', 'buzzy']);
    });

    it('excludes values already expressed by a matched archetype', () => {
        const res = visualFragmentsForAttributes(
            { class: 'human', age: 'adult', gender: 'feminine', tone: ['warm', 'menacing'], timbre: ['rich'] },
            { class: 'human', age: 'adult', gender: 'feminine', tones: 'warm, friendly, gentle', timbres: 'rich, velvety, smooth' },
        );
        expect(res.subject).toBe('');
        expect(res.details).toEqual([TONE_VISUALS.menacing]);
    });
});

// ---------------------------------------------------------------------------
// Portrait-safety regression guard (owner request 2026-07-16): the archetype
// appearance_descriptions drive a SQUARE HEAD-AND-SHOULDERS portrait prompt.
// Anything below the chest is out of frame. This denylist keeps full-body
// anatomy from creeping back in (it did exist: "hands folded over a walking
// stick", "boots planted", "scraped knees", "knuckles dragging", …).
// ---------------------------------------------------------------------------
const OUT_OF_FRAME = /\b(hands?|knuckles?|fingers?|fingernails?|fists?|palms?|wrists?|forearms?|arms?|elbows?|chest(ed)?|torso|waist|hips?|legs?|knees?|shins?|ankles?|feet|foot|toes?|boots?|shoes?|heels?|posture|standing|stands|kneeling|crouch(ed|ing)?|sitting|seated|perched|strid(e|ing)|gait|handshake|full[- ]body)\b/i;

describe('portrait safety — appearance_description denylist', () => {
    it('has 103 archetypes', () => {
        expect(recordingArchetypes).toHaveLength(103);
    });

    it.each(recordingArchetypes.map(a => [a.archetype_name, a.appearance_description] as const))(
        '%s appearance_description stays within head-and-shoulders framing',
        (_name, description) => {
            expect(description).not.toMatch(OUT_OF_FRAME);
        },
    );

    it('fragment map values are also portrait-safe', () => {
        const allFragments = [
            ...Object.values(CLASS_VISUALS),
            ...Object.values(AGE_VISUALS),
            ...Object.values(GENDER_VISUALS),
            ...Object.values(TONE_VISUALS),
            ...Object.values(TIMBRE_VISUALS),
        ];
        for (const fragment of allFragments) {
            expect(fragment).not.toMatch(OUT_OF_FRAME);
        }
    });
});
