/**
 * OneSelect.test.tsx — F3.1/F3.2 (design-critique/voices-variants-round2)
 *
 * F3.1: the section header ("ACCENT", "PACE"...) must be tinted with the
 * same `--pill-{category}-text` hue `VoicePills.tsx` renders that field's
 * pills under, not plain muted text.
 * F3.2: the active/selected chip must use that facet's `--pill-*` tokens
 * instead of a single generic `--accent` for every field.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OneSelect } from '@/pages/Voices/components/metadata/OneSelect';
import { getSection } from '@/pages/Voices/components/metadata/taxonomy';

describe('OneSelect', () => {
    it('tints the section header to match the pill hue for a core field (age)', () => {
        const section = getSection('age')!;
        render(<OneSelect section={section} value="adult" onChange={vi.fn()} />);
        expect(screen.getByText('AGE')).toHaveStyle({ color: 'var(--pill-age-text)' });
    });

    it('tints the section header as "extended" for a non-core field (accent)', () => {
        const section = getSection('accent')!;
        render(<OneSelect section={section} value={undefined} onChange={vi.fn()} />);
        expect(screen.getByText('ACCENT')).toHaveStyle({ color: 'var(--pill-extended-text)' });
    });

    // jsdom's CSSOM does not reliably resolve `border-color` shorthand containing
    // `var(...)` via getComputedStyle (a known jsdom/cssstyle limitation, unrelated
    // to this fix), so these two assertions read the raw style attribute rather
    // than going through `toHaveStyle`/getComputedStyle.
    it('renders the active chip using the facet pill tokens, not generic --accent', () => {
        const section = getSection('age')!;
        render(<OneSelect section={section} value="adult" onChange={vi.fn()} />);
        const activeChip = screen.getByRole('button', { name: 'Adult' });
        const style = activeChip.getAttribute('style');
        expect(style).toContain('border-color: var(--pill-age-border)');
        expect(style).toContain('background: var(--pill-age-bg)');
        expect(style).toContain('color: var(--pill-age-text)');
    });

    it('leaves inactive chips unstyled by any pill hue', () => {
        const section = getSection('age')!;
        render(<OneSelect section={section} value="adult" onChange={vi.fn()} />);
        const inactiveChip = screen.getByRole('button', { name: /^Child/ });
        const style = inactiveChip.getAttribute('style');
        expect(style).toContain('background: transparent');
        expect(style).toContain('color: var(--text-muted)');
    });
});
