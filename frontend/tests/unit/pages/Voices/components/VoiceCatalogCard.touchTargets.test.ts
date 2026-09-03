/**
 * VoiceCatalogCard.touchTargets.test.ts — F5.7 (design-critique/voices-variants-round2)
 *
 * The catalog avatar doubles as the play-preview target (task 002); at 40px
 * avatar / 24px overlay button it sat under the WCAG 2.5.5 44px touch-target
 * guideline. This locks in the fix: a >=48px avatar and a >=44px play
 * button (in both the base rule and the mobile-breakpoint override, which
 * previously shrank the button back down to 30px).
 *
 * This repo's vitest config does not set `css: true`, so imported/linked
 * stylesheets are never parsed into jsdom's CSSOM during unit tests --
 * `getComputedStyle` can't observe them. Asserting against the source rules
 * directly is the only way to guard this regression at the unit level; it
 * still fails red on the pre-fix values (40px/24px/30px), satisfying the
 * revert-check requirement (testing-standards.md R1).
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const cssPath = path.resolve(__dirname, '../../../../../src/theme/components/voice-lab.css');
const css = fs.readFileSync(cssPath, 'utf-8');

function ruleBlock(selector: string): string {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    if (!match) throw new Error(`Rule not found: ${selector}`);
    return match[1];
}

function pxValue(block: string, prop: string): number {
    const match = block.match(new RegExp(`${prop}:\\s*(\\d+)px`));
    if (!match) throw new Error(`Property not found: ${prop}`);
    return Number(match[1]);
}

describe('voice-lab.css touch targets (F5.7)', () => {
    it('sizes the catalog avatar to at least 48px (was 40px)', () => {
        const block = ruleBlock('.voice-catalog-card__avatar');
        expect(pxValue(block, 'width')).toBeGreaterThanOrEqual(48);
        expect(pxValue(block, 'height')).toBeGreaterThanOrEqual(48);
    });

    it('sizes the base play-overlay button to at least 44px (was 24px)', () => {
        const block = ruleBlock('.voice-catalog-card__avatar-play-btn');
        expect(pxValue(block, 'width')).toBeGreaterThanOrEqual(44);
        expect(pxValue(block, 'height')).toBeGreaterThanOrEqual(44);
    });

    it('does not shrink the play-overlay button below 44px in the mobile override', () => {
        // The mobile breakpoint block repeats the same selector; grab the
        // *last* occurrence (the media-query override), not the base rule.
        const blocks = [...css.matchAll(/\.voice-catalog-card__avatar-play-btn\s*\{([^}]*)\}/g)];
        expect(blocks.length).toBeGreaterThanOrEqual(2);
        const mobileBlock = blocks[blocks.length - 1][1];
        expect(pxValue(mobileBlock, 'width')).toBeGreaterThanOrEqual(44);
        expect(pxValue(mobileBlock, 'height')).toBeGreaterThanOrEqual(44);
    });
});
