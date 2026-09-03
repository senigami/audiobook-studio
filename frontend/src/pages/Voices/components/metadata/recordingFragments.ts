/**
 * Tone/Timbre performer-direction fragment dictionary — statically bundled
 * from design-docs/reference/voice-archetypes/tone_timbre_fragments.json
 * (52 entries: 28 Tone + 24 Timbre). Update both this const and the source
 * JSON when the fragment dictionary changes.
 */

export interface RecordingFragment {
    category: 'tone' | 'timbre';
    value: string;
    fragment: string;
}

export const recordingFragments: RecordingFragment[] = [
    {
        category: 'tone',
        value: 'warm',
        fragment: 'let real affection show through, like speaking to someone you love',
    },
    {
        category: 'tone',
        value: 'friendly',
        fragment: 'smile with your voice — open, welcoming, easy to talk to',
    },
    {
        category: 'tone',
        value: 'calm',
        fragment: 'keep the breath even and unhurried, nothing to prove',
    },
    {
        category: 'tone',
        value: 'soothing',
        fragment: 'slow everything down and let each word settle like a lullaby',
    },
    {
        category: 'tone',
        value: 'cheerful',
        fragment: 'let a genuine lift show in the pitch, like good news just arrived',
    },
    {
        category: 'tone',
        value: 'upbeat',
        fragment: 'keep the energy bright and forward-leaning, never flat',
    },
    {
        category: 'tone',
        value: 'energetic',
        fragment: 'push the pace and let enthusiasm spill past the edges of the sentence',
    },
    {
        category: 'tone',
        value: 'confident',
        fragment: 'land every word like you already know how this ends',
    },
    {
        category: 'tone',
        value: 'authoritative',
        fragment: 'speak like the room goes quiet when you start talking',
    },
    {
        category: 'tone',
        value: 'professional',
        fragment: 'stay crisp and composed — no wasted emotion, fully in control',
    },
    {
        category: 'tone',
        value: 'serious',
        fragment: 'strip away any lightness; every word carries real weight',
    },
    {
        category: 'tone',
        value: 'somber',
        fragment: 'let heaviness settle in, as if delivering difficult news',
    },
    {
        category: 'tone',
        value: 'dramatic',
        fragment: 'swing the dynamics wide — hushed one line, full the next',
    },
    {
        category: 'tone',
        value: 'intense',
        fragment: 'coil the energy tight, like it could snap at any moment',
    },
    {
        category: 'tone',
        value: 'epic',
        fragment: 'speak as if this is the line that gets carved into a monument',
    },
    {
        category: 'tone',
        value: 'mysterious',
        fragment: 'hold something back — let the listener lean in to catch it',
    },
    {
        category: 'tone',
        value: 'menacing',
        fragment: 'lower the volume and let the threat live in the restraint',
    },
    {
        category: 'tone',
        value: 'sinister',
        fragment: 'smile with the voice while the words turn the knife',
    },
    {
        category: 'tone',
        value: 'playful',
        fragment: 'let mischief bubble under the surface, like you\'re about to laugh',
    },
    {
        category: 'tone',
        value: 'quirky',
        fragment: 'lean into odd rhythms and unexpected emphasis — don\'t smooth it out',
    },
    {
        category: 'tone',
        value: 'sarcastic',
        fragment: 'say the opposite of what you mean and make sure they notice',
    },
    {
        category: 'tone',
        value: 'deadpan',
        fragment: 'keep the face and voice flat no matter how absurd the line',
    },
    {
        category: 'tone',
        value: 'gentle',
        fragment: 'handle every word like it might bruise',
    },
    {
        category: 'tone',
        value: 'wise',
        fragment: 'slow down, as if choosing words that have been true for a long time',
    },
    {
        category: 'tone',
        value: 'sensual',
        fragment: 'let the voice linger, unhurried, low in the chest',
    },
    {
        category: 'tone',
        value: 'melancholic',
        fragment: 'let a quiet ache sit under every sentence, never overplayed',
    },
    {
        category: 'tone',
        value: 'heroic',
        fragment: 'square your shoulders in the voice — steady, brave, certain',
    },
    {
        category: 'tone',
        value: 'villainous',
        fragment: 'enjoy being the bad one; let relish creep into the cruelty',
    },
    {
        category: 'timbre',
        value: 'deep',
        fragment: 'drop into the lowest comfortable register and stay there',
    },
    {
        category: 'timbre',
        value: 'low',
        fragment: 'keep the pitch grounded, well below your natural conversational tone',
    },
    {
        category: 'timbre',
        value: 'high-pitched',
        fragment: 'let the pitch ride noticeably higher than a resting voice',
    },
    {
        category: 'timbre',
        value: 'bright',
        fragment: 'brighten the top of the voice, forward and lit-up',
    },
    {
        category: 'timbre',
        value: 'rich',
        fragment: 'fill out the tone with real body and overtone, not a thin read',
    },
    {
        category: 'timbre',
        value: 'resonant',
        fragment: 'let the sound ring, as if chest and throat are both vibrating',
    },
    {
        category: 'timbre',
        value: 'booming',
        fragment: 'fill the whole room — big, expansive, impossible to ignore',
    },
    {
        category: 'timbre',
        value: 'smooth',
        fragment: 'iron out every rough edge; let the sound glide',
    },
    {
        category: 'timbre',
        value: 'velvety',
        fragment: 'let the low notes purr, soft-edged and plush',
    },
    {
        category: 'timbre',
        value: 'silky',
        fragment: 'keep the texture fine and unbroken, gliding rather than gripping',
    },
    {
        category: 'timbre',
        value: 'clear',
        fragment: 'articulate cleanly, no mush, every consonant intact',
    },
    {
        category: 'timbre',
        value: 'crisp',
        fragment: 'snap the consonants — precise, clean-edged delivery',
    },
    {
        category: 'timbre',
        value: 'soft',
        fragment: 'keep the volume gentle and the edges rounded',
    },
    {
        category: 'timbre',
        value: 'breathy',
        fragment: 'let air move through the voice, half-whispered at the edges',
    },
    {
        category: 'timbre',
        value: 'husky',
        fragment: 'add a rough, worn edge, like a voice used hard the night before',
    },
    {
        category: 'timbre',
        value: 'raspy',
        fragment: 'let a dry scratch ride under the tone, not fully smoothed',
    },
    {
        category: 'timbre',
        value: 'gravelly',
        fragment: 'grind it out low and rough, like gravel underfoot',
    },
    {
        category: 'timbre',
        value: 'gritty',
        fragment: 'keep it unpolished and worn-in, texture over shine',
    },
    {
        category: 'timbre',
        value: 'rough',
        fragment: 'don\'t smooth it — let the natural coarseness show',
    },
    {
        category: 'timbre',
        value: 'nasal',
        fragment: 'push the resonance up into the nose, thinner and more pinched',
    },
    {
        category: 'timbre',
        value: 'thin',
        fragment: 'keep the tone narrow and light, without much low-end body',
    },
    {
        category: 'timbre',
        value: 'light',
        fragment: 'keep it airy and unweighted, floating rather than grounded',
    },
    {
        category: 'timbre',
        value: 'robotic',
        fragment: 'flatten the natural human inflection — even, mechanical, precise',
    },
    {
        category: 'timbre',
        value: 'distorted',
        fragment: 'let the edges fray, as if the voice is being pushed past clean',
    },
];

/** Lookup map for O(1) fragment access by "category:value" key. */
const fragmentIndex: Map<string, string> = new Map(
    recordingFragments.map(f => [`${f.category}:${f.value}`, f.fragment])
);

/** Returns the performer-direction fragment for a tone/timbre taxonomy value, if known. */
export function getFragment(category: 'tone' | 'timbre', value: string): string | undefined {
    return fragmentIndex.get(`${category}:${value}`);
}
