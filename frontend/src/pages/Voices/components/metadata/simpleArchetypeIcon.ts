/**
 * simpleArchetypeIcon.ts — the canonical, reusable "default portrait" prompt
 * + filename-slug generator for the character library. As more archetypes
 * get added beyond the current 103, this is what keeps every new one's
 * default picker image styled consistently with the rest — no per-character
 * one-off decisions.
 *
 * Owner ask (2026-07-17, across two messages): a flat, minimal, generic
 * image-generation prompt per archetype — distinct from `buildIconPrompt()`
 * (frontend/src/pages/VoiceLab/iconPrompt.ts), which builds the DETAILED,
 * intentionally non-generic prompt a user copies to generate their OWN
 * distinct portrait for a voice they've customized. Every user who never
 * customizes sees the SAME default image for a given archetype (generated
 * once, ahead of time, from the simple prompt here) — which is what makes
 * the detailed prompt worth copying: it produces a different result per
 * person, the simple one deliberately doesn't.
 *
 * Three consumers, one source of truth:
 * - `frontend/scripts/exportArchetypePortraitPrompts.ts` — a checked-in,
 *   rerunnable script (owner runs `npm run export:archetype-portraits`) that
 *   writes every archetype's `slug()` + prompt to
 *   design-docs/reference/voice-archetypes/default-portrait-prompts.md, for
 *   the owner to feed into an external image generator and hand back
 *   `frontend/public/archetype-portraits/<slug>.png` files.
 * - `ArchetypeQuickPick.tsx` — looks up `frontend/public/archetype-portraits/
 *   <slug>.png` by `slug()` for the row thumbnail (silently hides itself if
 *   the file doesn't exist yet, so nothing breaks before images are
 *   generated), and offers a "copy visual prompt" convenience button gated
 *   behind dev mode (`useDevMode()`) only — never shown to end users.
 *
 * Pure data + two pure helpers — no API calls, deterministic.
 */

import type { RecordingArchetype } from './recordingArchetypes';

/**
 * tone -> a SHORT 2-4 word mood/color phrase for the flat icon prompt.
 * Deliberately terser than the rich cinematic clauses in
 * `frontend/src/pages/VoiceLab/iconPromptFragments.ts`'s TONE_VISUALS (e.g.
 * `menacing` there is "a hard-set jaw and narrowed eyes, shadowed low-key
 * lighting" — here it's just "dark, brooding mood"). Covers all 28 taxonomy
 * tone values (design-docs/specs/voice-taxonomy.json).
 */
export const SIMPLE_TONE_MOOD: Record<string, string> = {
    warm: 'warm, cozy mood',
    friendly: 'friendly, open mood',
    calm: 'calm, quiet mood',
    soothing: 'soft, calming mood',
    cheerful: 'bright, cheerful mood',
    upbeat: 'lively, upbeat mood',
    energetic: 'energetic, vibrant mood',
    confident: 'bold, confident mood',
    authoritative: 'strong, commanding mood',
    professional: 'clean, professional mood',
    serious: 'serious, focused mood',
    somber: 'muted, somber mood',
    dramatic: 'bold, dramatic mood',
    intense: 'sharp, intense mood',
    epic: 'grand, epic mood',
    mysterious: 'shadowy, mysterious mood',
    menacing: 'dark, brooding mood',
    sinister: 'cold, sinister mood',
    playful: 'playful, whimsical mood',
    quirky: 'quirky, offbeat mood',
    sarcastic: 'wry, sly mood',
    deadpan: 'flat, neutral mood',
    gentle: 'gentle, soft mood',
    wise: 'calm, wise mood',
    sensual: 'warm, sultry mood',
    melancholic: 'muted, wistful mood',
    heroic: 'bold, heroic mood',
    villainous: 'dark, villainous mood',
};

/** Fallback mood phrase for a tone value not present in SIMPLE_TONE_MOOD (or a blank/missing dominant_tones). */
const DEFAULT_MOOD = 'neutral mood';

/** appearance_creature_type prefixes that mark a "<Prefix> — <descriptor>" pattern in the archetype table. */
const CREATURE_TYPE_PREFIXES = ['Human', 'Creature', 'Character', 'Deity', 'Alien', 'Synthetic'];

const PREFIX_PATTERN = new RegExp(`^(?:${CREATURE_TYPE_PREFIXES.join('|')})\\s+—\\s+(.+)$`);

/**
 * Derive a natural "a/an <descriptor>" subject phrase from an archetype's
 * `appearance_creature_type`, e.g.:
 * - "Human — fireside storyteller" -> "a fireside storyteller"
 * - "Synthetic — rogue AI" -> "a rogue AI"
 * - "Griffin" (no prefix — bare noun in this dataset) -> "a griffin"
 * - "Zombie / undead" (bare noun with an alt-label suffix) -> "a zombie"
 *
 * Exported for its own unit coverage.
 */
export function deriveSubjectPhrase(appearanceCreatureType: string): string {
    const raw = appearanceCreatureType?.trim() ?? '';
    const prefixMatch = raw.match(PREFIX_PATTERN);
    const descriptor = prefixMatch
        ? prefixMatch[1].trim()
        : raw.split('/')[0].trim().toLowerCase();

    const article = /^[aeiou]/i.test(descriptor) ? 'an' : 'a';
    return `${article} ${descriptor}`;
}

/** Fixed flat-icon-style frame, held constant across every archetype for a uniform picker-list look. */
const FRAME_OPEN = 'Flat vector character icon:';
const FRAME_CLOSE =
    'Simple flat shapes, minimal line detail, solid plain-color background, centered, no text, no shading gradients, no photorealism.';

/**
 * Build a deterministic, pure, flat/generic image-generation prompt for an
 * archetype's PICKER-LIST icon — distinct from the detailed
 * `buildIconPrompt()` prompt used for the actual generated voice profile
 * image. Never reads `appearance_description`.
 */
export function buildSimpleArchetypeIconPrompt(archetype: RecordingArchetype): string {
    const subject = deriveSubjectPhrase(archetype.appearance_creature_type);
    const firstTone = archetype.dominant_tones?.split(',')[0]?.trim() ?? '';
    const mood = SIMPLE_TONE_MOOD[firstTone] ?? DEFAULT_MOOD;
    return `${FRAME_OPEN} ${subject}, ${mood}. ${FRAME_CLOSE}`;
}

/**
 * Filename-safe slug for an archetype name, e.g. "Warm Storyteller" ->
 * "warm-storyteller". The SINGLE naming convention shared by the export
 * script (cheat-sheet filenames the owner should save generated images
 * under), the picker's default-portrait `<img>` lookup path
 * (`/archetype-portraits/<slug>.png`), and any future tooling — never
 * reimplement slugging elsewhere.
 */
export function slugifyArchetypeName(name: string): string {
    return name
        .toLowerCase()
        .replace(/'/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Public path to an archetype's default portrait thumbnail, if one has been generated and dropped in. */
export function defaultPortraitPath(archetype: RecordingArchetype): string {
    return `/archetype-portraits/${slugifyArchetypeName(archetype.archetype_name)}.png`;
}
