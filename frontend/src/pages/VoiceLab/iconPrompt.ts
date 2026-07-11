/**
 * iconPrompt.ts — R5-T7
 *
 * buildIconPrompt(meta: VoiceMetadata): string
 *
 * Pure deterministic string template for an image-generation prompt.
 * Built from voice attributes + description so uniform icons can be created
 * across the catalog. No API call is made — clipboard-only (R-F).
 *
 * Spec reference: design-docs/specs/voice-bundles.md §11.1 "Copy icon prompt (doc 04 C6)"
 * and design-docs/plans/final_release/04_voice_metadata_and_tagging.md item C6.
 */

import type { VoiceMetadata, VoiceAttributes } from '@/types';

/** Core attribute keys shown in order in the prompt */
const CORE_KEYS: Array<keyof VoiceAttributes> = ['class', 'gender', 'age', 'accent', 'pace'];

/**
 * Build a uniform image-generation prompt from VoiceMetadata.
 * Only fields present on the object are included — taxonomy-agnostic,
 * same dynamic-walk approach as voicePillsFromMetadata.
 */
export function buildIconPrompt(meta: VoiceMetadata | null | undefined): string {
    if (!meta) return 'Circular avatar portrait icon, flat illustration, uniform style. Neutral background, centered, no text.';

    const parts: string[] = [];

    // Core attributes in fixed order
    const attrs = meta.attributes ?? {};
    for (const key of CORE_KEYS) {
        const val = attrs[key];
        if (val) {
            if (Array.isArray(val)) {
                parts.push(...val.filter(Boolean));
            } else {
                parts.push(val as string);
            }
        }
    }

    // Extended attributes (any scalar or array attr not in CORE_KEYS), alphabetical
    const extendedKeys = Object.keys(attrs)
        .filter(k => !CORE_KEYS.includes(k as keyof VoiceAttributes))
        .sort();
    for (const key of extendedKeys) {
        const val = (attrs as Record<string, unknown>)[key];
        if (!val) continue;
        if (Array.isArray(val)) {
            parts.push(...(val as string[]).filter(Boolean));
        } else {
            parts.push(val as string);
        }
    }

    // Free tags
    if (meta.tags && meta.tags.length > 0) {
        parts.push(...meta.tags);
    }

    const attributeStr = parts.length > 0 ? parts.join(', ') : '';
    const descStr = meta.description?.trim() ? `described as: ${meta.description.trim()}` : '';

    const middle = [attributeStr, descStr].filter(Boolean).join('; ');

    if (!middle) {
        // Untagged / name-only fallback
        return `Circular avatar portrait icon of "${meta.name}", flat illustration, uniform style. Neutral background, centered, no text.`;
    }

    return `Circular avatar portrait icon, flat illustration, uniform style: ${middle}. Neutral background, centered, no text.`;
}
