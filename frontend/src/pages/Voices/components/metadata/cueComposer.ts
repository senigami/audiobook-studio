/**
 * cueComposer.ts — mad-lib recording-cue composition engine.
 *
 * Pure, deterministic slot-based composer for the "no archetype matched" path
 * of `suggestRecordingPrompt` (recordingPromptSuggester.ts). Where the old
 * composeFallback() only concatenated direction fragments ("read a line that
 * feels X, Y"), this produces an actual ~4-sentence passage for the person to
 * read aloud — and the passage visibly mutates as taxonomy selections change:
 *
 *   - CLASS  swaps the speaker identity / framing (sentence 1 + a "keeper"
 *     noun woven into the closing sentence).
 *   - TONE   picks a theme family (8 families covering all 28 taxonomy tones)
 *     that supplies the scene, two whole sentences, and the sample line.
 *     When tones span families, the family with the most selected tones wins
 *     (tie → declaration order below).
 *   - TIMBRE swaps texture words inside the sentences (an adjective slot and
 *     an adverbial-phrase slot).
 *   - PACE   restructures the sentences: slow/measured merges them into long
 *     flowing clauses, brisk/fast splits them into short clipped fragments,
 *     variable mixes both.
 *   - AGE    lightly tints via one appended reflective/bright clause
 *     (child/teen vs senior). GENDER deliberately has no effect on the text.
 *
 * Deterministic: same attrs → same output. No randomness, no clock. The text
 * is written for voice-cloning capture, so each family's sentences carry
 * phoneme variety (open vowels, plosives, sibilants).
 */

import type { VoiceAttributes } from '@/types';
import { getFragment } from './recordingFragments';

export interface ComposedCue {
    /** ~4-sentence read-aloud passage for the human recording the sample. */
    passage: string;
    /** 1-2 sentence showcase line in the same theme, for TTS previews. */
    sampleText: string;
    /** Performer direction built from the existing tone/timbre fragments. */
    directionNote: string;
}

// --- Theme families (TONE) -------------------------------------------------

interface ThemeFamily {
    name: string;
    tones: string[];
    /** Scene noun phrase slotted into the class opener. */
    scene: string;
    /** Sentence 2 — theme statement. Slots: {texture}. */
    s2: string;
    /** Sentence 3 — how the words move. Slots: {textureAdv}. */
    s3: string;
    /** Sentence 4 — closing. Slots: {keep} (class-supplied noun). */
    s4: string;
    /** Showcase line for TTS previews. Slots: {texture}. */
    sample: string;
}

/** Declaration order is the tie-break order when tone counts are equal. */
const THEME_FAMILIES: ThemeFamily[] = [
    {
        name: 'comfort',
        tones: ['warm', 'friendly', 'gentle', 'soothing', 'calm'],
        scene: 'quiet garden',
        s2: 'There is a {texture} kind of quiet here, the sort that asks for nothing and gives back everything.',
        s3: 'So I speak {textureAdv}, the way you talk to someone who is almost asleep.',
        s4: 'Stay as long as you like; the {keep} will keep the warmth for both of us.',
        sample: 'Come sit by the window with me, and I will tell you something {texture} and true.',
    },
    {
        name: 'delight',
        tones: ['cheerful', 'upbeat', 'energetic', 'playful', 'quirky'],
        scene: 'bright market square',
        s2: 'Everything is popping and sparkling today, and this {texture} voice of mine wants to bounce right along with it.',
        s3: 'Every word comes out {textureAdv}, and I catch the next one before it can land.',
        s4: 'Honestly, the {keep} has never heard anything half this fun.',
        sample: 'Guess what — the whole day just opened up like a present, and I get to unwrap it!',
    },
    {
        name: 'command',
        tones: ['confident', 'authoritative', 'professional', 'heroic'],
        scene: 'assembly hall',
        s2: 'When I speak, the plan becomes {texture} and simple: we move at first light.',
        s3: 'Each word lands {textureAdv}, and nobody asks me to say it twice.',
        s4: 'Hold the line, keep to the plan, and the {keep} will tell the rest of the story.',
        sample: 'Stand fast and listen well — I only intend to say this once.',
    },
    {
        name: 'gravity',
        tones: ['serious', 'somber', 'melancholic', 'wise'],
        scene: 'grey shoreline',
        s2: 'Some truths arrive {texture} and slow, and this is one of them.',
        s3: 'I let each word settle {textureAdv}, because real weight deserves patience.',
        s4: 'When the telling is done, the {keep} will hold what we could not.',
        sample: 'There are things worth saying carefully, and I have carried this one a long way.',
    },
    {
        name: 'grandeur',
        tones: ['dramatic', 'intense', 'epic'],
        scene: 'burning horizon',
        s2: 'This is no small moment — it is {texture} thunder gathering behind my teeth.',
        s3: 'The words break {textureAdv}, wave after wave, until the air itself gives ground.',
        s4: 'Mark this hour well, for the {keep} will speak of it long after we are gone.',
        sample: 'Hear me now, for what happens next will shake the very ground we stand on!',
    },
    {
        name: 'shadow',
        tones: ['mysterious', 'menacing', 'sinister', 'villainous'],
        scene: 'unlit corridor',
        s2: 'There is something {texture} in what I know, and I am in no hurry to share it.',
        s3: 'So the words move {textureAdv}, low along the floor like smoke under a door.',
        s4: 'Sleep if you can; the {keep} and I will still be here when you wake.',
        sample: 'Come closer — I have a secret, and it has been so very patient waiting for you.',
    },
    {
        name: 'wry',
        tones: ['sarcastic', 'deadpan'],
        scene: 'half-empty diner',
        s2: 'Oh, wonderful — another {texture} speech, exactly what everyone here was begging for.',
        s3: 'I deliver each line {textureAdv}, absolutely refusing to admit that any of this is funny.',
        s4: 'No, really, the {keep} is thrilled; you can tell by the silence.',
        sample: 'Sure, this is fine. Everything is fine. I am clearly delighted beyond all measure.',
    },
    {
        name: 'allure',
        tones: ['sensual'],
        scene: 'candlelit room',
        s2: 'There is a {texture} warmth in this hour, and I am in no rush to leave it.',
        s3: 'Every word slips out {textureAdv}, low in the chest, closer than it needs to be.',
        s4: 'Stay a little longer; the {keep} can keep our secret.',
        sample: 'Come a little closer — some things are only worth saying slowly.',
    },
];

/** Base theme for the untagged / no-tone case — the generic skeleton. */
const NEUTRAL_FAMILY: ThemeFamily = {
    name: 'neutral',
    tones: [],
    scene: 'open road',
    s2: 'There is a {texture} steadiness in this voice, easy to listen to and easy to trust.',
    s3: 'The words move {textureAdv}, one after another, at exactly the pace they need.',
    s4: 'That is all this moment asks of anyone, and the {keep} agrees.',
    sample: 'This is my voice, plain and unhurried, saying exactly what it means.',
};

// --- Class framing ----------------------------------------------------------

interface ClassFrame {
    /** Sentence 1 — speaker identity. Slots: {scene}. */
    opener: string;
    /** Noun woven into the family's closing sentence ({keep}). */
    keep: string;
}

const CLASS_FRAMES: Record<string, ClassFrame> = {
    human: {
        opener: 'I come up the path from the {scene} and let myself breathe.',
        keep: 'room',
    },
    synthetic: {
        opener: 'My systems come online one by one, each signal reaching out toward the {scene}.',
        keep: 'record',
    },
    creature: {
        opener: 'I drag my claws across the stone and lift my head toward the {scene}.',
        keep: 'forest',
    },
    character: {
        opener: 'I sweep into the {scene} the way I always do — as if the story could not begin without me.',
        keep: 'audience',
    },
    deity: {
        opener: 'Before the first stone was laid, I was already watching the {scene}.',
        // Singular on purpose: several family closings conjugate {keep} with a
        // singular verb ("the {keep} has never heard…", "the {keep} agrees").
        keep: 'night sky',
    },
};

const DEFAULT_FRAME: ClassFrame = {
    opener: 'I pause for a moment and look out over the {scene}.',
    keep: 'air',
};

// --- Timbre textures --------------------------------------------------------

interface Texture {
    adj: string;
    adv: string;
}

const TIMBRE_TEXTURES: Record<string, Texture> = {
    deep: { adj: 'deep', adv: 'from somewhere far down' },
    low: { adj: 'low', adv: 'low and grounded' },
    'high-pitched': { adj: 'bright-edged', adv: 'riding high above the room' },
    bright: { adj: 'bright', adv: 'lit from within' },
    rich: { adj: 'rich', adv: 'full and rounded' },
    resonant: { adj: 'ringing', adv: 'ringing through the beams' },
    booming: { adj: 'enormous', adv: 'filling the whole room' },
    smooth: { adj: 'smooth', adv: 'gliding without a single seam' },
    velvety: { adj: 'plush', adv: 'soft-edged and slow' },
    silky: { adj: 'unbroken', adv: 'gliding rather than gripping' },
    clear: { adj: 'clean', adv: 'clean as struck glass' },
    crisp: { adj: 'clean-edged', adv: 'snapping at every consonant' },
    soft: { adj: 'soft', adv: 'barely above a breath' },
    breathy: { adj: 'half-whispered', adv: 'carried out on the breath' },
    husky: { adj: 'worn', adv: 'rough at the edges' },
    raspy: { adj: 'dry', adv: 'with a dry scratch underneath' },
    gravelly: { adj: 'grinding', adv: 'like gravel underfoot' },
    gritty: { adj: 'worn-in', adv: 'unpolished and worn' },
    rough: { adj: 'coarse', adv: 'with the grain left showing' },
    nasal: { adj: 'pinched', adv: 'thin and pushed forward' },
    thin: { adj: 'narrow', adv: 'light and narrow' },
    light: { adj: 'airy', adv: 'floating rather than grounded' },
    robotic: { adj: 'even', adv: 'in perfectly measured intervals' },
    distorted: { adj: 'frayed', adv: 'pushed just past clean' },
};

const DEFAULT_TEXTURE: Texture = { adj: 'steady', adv: 'evenly, without hurry' };

// --- Selection helpers -------------------------------------------------------

function pickFamily(tones: string[]): ThemeFamily {
    if (tones.length === 0) return NEUTRAL_FAMILY;
    let best: ThemeFamily | null = null;
    let bestCount = 0;
    for (const family of THEME_FAMILIES) {
        const count = tones.filter(t => family.tones.includes(t)).length;
        if (count > bestCount) {
            best = family;
            bestCount = count;
        }
    }
    return best ?? NEUTRAL_FAMILY;
}

function pickTexture(timbres: string[]): Texture {
    const known = timbres.filter(t => TIMBRE_TEXTURES[t]);
    if (known.length === 0) return DEFAULT_TEXTURE;
    // adjective from the first known timbre, adverb from the second if present
    // (so multi-timbre voices weave in more than one texture)
    const adj = TIMBRE_TEXTURES[known[0]].adj;
    const adv = TIMBRE_TEXTURES[known[1] ?? known[0]].adv;
    return { adj, adv };
}

function fill(template: string, slots: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_, key: string) => slots[key] ?? '');
}

// --- Pace restructuring -------------------------------------------------------

function capitalize(s: string): string {
    return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function stripPeriod(s: string): string {
    return s.replace(/\.$/, '');
}

function lowerFirst(s: string): string {
    // Keep "I" (and contractions like "I'm") capitalized when merged mid-sentence.
    if (/^I(\s|')/.test(s)) return s;
    return s.length > 0 ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/** Merge two sentences into one long flowing sentence. */
function mergeSentences(a: string, b: string): string {
    return `${stripPeriod(a)}, and ${lowerFirst(b)}`;
}

/** Split a sentence at commas / em-dashes into short clipped sentences. */
function clipSentence(sentence: string): string[] {
    return stripPeriod(sentence)
        .split(/\s+—\s+|,\s+/)
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => `${capitalize(part)}.`);
}

function shapeByPace(sentences: string[], pace: string | undefined): string[] {
    const [s1, s2, s3, s4] = sentences;
    switch (pace) {
        case 'slow':
        case 'measured':
            return [mergeSentences(s1, s2), mergeSentences(s3, s4)];
        case 'brisk':
        case 'fast':
            return sentences.flatMap(clipSentence);
        case 'variable':
            return [mergeSentences(s1, s2), ...clipSentence(s3), s4];
        default:
            return sentences;
    }
}

// --- Age tint ------------------------------------------------------------------

const AGE_TINTS: Record<string, string> = {
    child: 'It feels good to say it out loud.',
    teen: 'It feels good to finally say it out loud.',
    senior: 'I have had a long time to learn how.',
};

// --- Direction note ---------------------------------------------------------------

function buildDirectionNote(attrs: VoiceAttributes): string {
    const parts: string[] = [];
    const toneFragment = (attrs.tone ?? []).map(t => getFragment('tone', t)).find(Boolean);
    const timbreFragment = (attrs.timbre ?? []).map(t => getFragment('timbre', t)).find(Boolean);
    if (toneFragment) parts.push(`${capitalize(toneFragment)}.`);
    if (timbreFragment) parts.push(`${capitalize(timbreFragment)}.`);
    if (parts.length === 0) {
        return "Let the performance reflect this voice's intended character.";
    }
    return parts.join(' ');
}

// --- Composer ------------------------------------------------------------------------

/**
 * Compose a read-aloud cue passage, a TTS showcase line, and a performer
 * direction note from a voice's tagged attributes. Pure and deterministic.
 */
export function composeCuePassage(attrs: VoiceAttributes): ComposedCue {
    const frame = (attrs.class && CLASS_FRAMES[attrs.class]) || DEFAULT_FRAME;
    const family = pickFamily(attrs.tone ?? []);
    const texture = pickTexture(attrs.timbre ?? []);

    const slots = {
        scene: family.scene,
        texture: texture.adj,
        textureAdv: texture.adv,
        keep: frame.keep,
    };

    const baseSentences = [
        fill(frame.opener, slots),
        fill(family.s2, slots),
        fill(family.s3, slots),
        fill(family.s4, slots),
    ];

    const shaped = shapeByPace(baseSentences, attrs.pace);
    const tint = attrs.age ? AGE_TINTS[attrs.age] : undefined;
    if (tint) shaped.push(tint);

    return {
        passage: shaped.join(' '),
        sampleText: fill(family.sample, slots),
        directionNote: buildDirectionNote(attrs),
    };
}
