/**
 * iconPromptFragments.ts
 *
 * Visual-fragment vocabulary for buildIconPrompt: translates voice-taxonomy
 * attribute values (design-docs/specs/voice-taxonomy.json v2.0) into concrete
 * visual descriptors for a square head-and-shoulders portrait, so manually
 * selected attributes genuinely shape the generated image instead of being
 * pasted in as bare keywords.
 *
 * Pure data + one pure composition helper — no API calls, deterministic.
 * Gender fragments deliberately describe presentation only (never
 * stereotyped wardrobe or props).
 */

import type { VoiceAttributes } from '@/types';

/** class → what kind of being the portrait depicts */
export const CLASS_VISUALS: Record<string, string> = {
    human: 'a human subject',
    synthetic: 'a synthetic android subject with sleek machined surfaces and a subtle interface glow',
    creature: 'a fantastical creature subject with distinctly non-human features',
    character: 'a stylized fictional character subject',
    deity: 'an otherworldly divine being with a faint luminous aura',
};

/** age → apparent-age phrasing (visual, not numeric) */
export const AGE_VISUALS: Record<string, string> = {
    child: 'with the round-cheeked, bright-eyed look of a young child',
    teen: 'with youthful teenage features',
    'young-adult': 'with the fresh, unlined features of early adulthood',
    adult: 'with the settled features of an adult in their prime',
    'middle-aged': 'with the first grey and faint lines of middle age',
    senior: 'elderly, with deeply lined features and grey or white hair',
    ageless: 'of indeterminate, ageless appearance',
};

/** gender → presentation phrasing only — never wardrobe, props, or roles */
export const GENDER_VISUALS: Record<string, string> = {
    feminine: 'with a feminine presentation',
    masculine: 'with a masculine presentation',
    neutral: 'with a gender-neutral presentation',
    ambiguous: 'with a deliberately ambiguous presentation',
    'not-applicable': '',
};

/** tone → expression / mood / lighting for the portrait */
export const TONE_VISUALS: Record<string, string> = {
    warm: 'a soft genuine smile, warm golden light',
    friendly: 'an open, approachable expression and relaxed eyes',
    calm: 'a serene, unhurried expression, even soft lighting',
    soothing: 'gentle half-lidded eyes, low warm lamplight',
    cheerful: 'a wide bright smile and lively eyes',
    upbeat: 'an eager grin, bright airy lighting',
    energetic: 'animated eyes and raised brows, vivid high-key lighting',
    confident: 'a level, self-assured gaze and slightly lifted chin',
    authoritative: 'a firm, commanding gaze, strong directional light',
    professional: 'a composed, polished expression, clean studio lighting',
    serious: 'an unsmiling, focused expression, restrained lighting',
    somber: 'downcast, heavy-lidded eyes, muted grey light',
    dramatic: 'an intense theatrical expression, high-contrast chiaroscuro lighting',
    intense: 'a piercing, unwavering stare, hard-edged light',
    epic: 'a grand, far-seeing gaze, sweeping cinematic backlight',
    mysterious: 'features half-veiled in shadow, an unreadable expression',
    menacing: 'a hard-set jaw and narrowed eyes, shadowed low-key lighting',
    sinister: 'a thin knowing smile that never reaches the eyes, cold underlighting',
    playful: 'a mischievous smirk and one arched eyebrow',
    quirky: 'an off-kilter grin and a bright, curious tilt of the head',
    sarcastic: 'a wry half-smile and skeptical, sidelong eyes',
    deadpan: 'a perfectly flat, expressionless face',
    gentle: 'soft kind eyes and a faint reassuring smile',
    wise: 'deep-set knowing eyes and a patient, weathered expression',
    sensual: 'heavy-lidded eyes and a slow, inviting smile, dim intimate lighting',
    melancholic: 'wistful distant eyes, cool rain-grey light',
    heroic: 'a resolute, uplifted gaze, dawn-bright rim lighting',
    villainous: 'a cruelly satisfied smile and glittering cold eyes',
};

/** timbre → texture / material / surface cues that read visually */
export const TIMBRE_VISUALS: Record<string, string> = {
    deep: 'a strong, grounded presence',
    low: 'a heavy, settled presence',
    'high-pitched': 'delicate, fine-boned features',
    bright: 'luminous, light-catching features',
    rich: 'warm, full-toned coloring',
    resonant: 'a broad, imposing head-and-shoulders silhouette',
    booming: 'a massive, powerful silhouette filling the frame',
    smooth: 'flawless, even skin and clean lines',
    velvety: 'soft matte textures and plush shadows',
    silky: 'sleek, glossy hair and soft highlights',
    clear: 'crisp, well-defined features',
    crisp: 'sharp, precise edges and tidy grooming',
    soft: 'gentle, diffused edges and pastel light',
    breathy: 'an ethereal, almost translucent quality',
    husky: 'rugged, lived-in features',
    raspy: 'roughened, worn textures',
    gravelly: 'craggy, deeply weathered features',
    gritty: 'coarse, textured skin and stubble',
    rough: 'unpolished, rough-hewn features',
    nasal: 'a pinched, sharp-nosed look',
    thin: 'gaunt, narrow features',
    light: 'airy, delicate features',
    robotic: 'sleek synthetic surfaces and precise mechanical detailing',
    distorted: 'glitch artifacts and broken scan-lines across the image',
};

/** Attribute keys the fragment maps cover; everything else stays a keyword. */
export const FRAGMENT_KEYS = ['class', 'age', 'gender', 'tone', 'timbre'] as const;

const SCALAR_MAPS: Array<[key: 'class' | 'age' | 'gender', map: Record<string, string>]> = [
    ['class', CLASS_VISUALS],
    ['age', AGE_VISUALS],
    ['gender', GENDER_VISUALS],
];

/**
 * Compose visual descriptors from taxonomy attributes.
 *
 * Returns:
 * - subject: "a human subject with the settled features of an adult in their
 *   prime, with a feminine presentation" — built from class/age/gender
 *   (empty string when none are set).
 * - details: tone/timbre expression/mood/lighting fragments, tones first,
 *   taxonomy-order-preserving within each array.
 *
 * `exclude` suppresses values already expressed by a matched archetype so
 * only the manual selections that DIFFER from the archetype add detail.
 */
export function visualFragmentsForAttributes(
    attrs: VoiceAttributes,
    exclude?: { class?: string; gender?: string; age?: string; tones?: string; timbres?: string },
): { subject: string; details: string[] } {
    const subjectParts: string[] = [];
    for (const [key, map] of SCALAR_MAPS) {
        const val = attrs[key];
        if (!val) continue;
        const excluded = exclude?.[key];
        if (excluded && excluded === val) continue;
        const fragment = map[val];
        if (fragment !== undefined) {
            if (fragment) subjectParts.push(fragment); // '' = intentionally silent (e.g. gender not-applicable)
        } else {
            subjectParts.push(val); // unknown taxonomy value: keep as keyword
        }
    }

    const details: string[] = [];
    const excludedTones = splitList(exclude?.tones);
    for (const tone of attrs.tone ?? []) {
        if (!tone || excludedTones.has(tone)) continue;
        details.push(TONE_VISUALS[tone] ?? tone);
    }
    const excludedTimbres = splitList(exclude?.timbres);
    for (const timbre of attrs.timbre ?? []) {
        if (!timbre || excludedTimbres.has(timbre)) continue;
        details.push(TIMBRE_VISUALS[timbre] ?? timbre);
    }

    return { subject: subjectParts.filter(Boolean).join(', '), details };
}

/** Parse an archetype's comma-separated tone/timbre list into a Set. */
function splitList(csv: string | undefined): Set<string> {
    if (!csv) return new Set();
    return new Set(csv.split(',').map(s => s.trim()).filter(Boolean));
}
