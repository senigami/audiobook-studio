/**
 * ManySelect.test.tsx — F3.1/F3.2 (design-critique/voices-variants-round2)
 *
 * F3.1: the section header ("STYLE", "TONE"...) must be tinted with the
 * same `--pill-{category}-text` hue `VoicePills.tsx` renders that field's
 * pills under.
 * F3.2: an active chip must use that facet's `--pill-*` tokens (all
 * many-value fields are non-core -> "extended" hue) instead of generic
 * `--accent`.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ManySelect } from '@/pages/Voices/components/metadata/ManySelect';
import { getSection } from '@/pages/Voices/components/metadata/taxonomy';

describe('ManySelect', () => {
    it('tints the section header as "extended" for a many-value field (style)', () => {
        const section = getSection('style')!;
        render(<ManySelect section={section} value={[]} onChange={vi.fn()} />);
        expect(screen.getByText('STYLE')).toHaveStyle({ color: 'var(--pill-extended-text)' });
    });

    // See OneSelect.test.tsx for why this reads the raw style attribute rather
    // than `toHaveStyle` (jsdom's `border-color` + var() CSSOM limitation).
    it('renders an active chip using the extended pill tokens, not generic --accent', () => {
        const section = getSection('style')!;
        const active = section.values[0]!;
        render(<ManySelect section={section} value={[active.id]} onChange={vi.fn()} />);
        const activeChip = screen.getByRole('button', { name: active.label });
        const style = activeChip.getAttribute('style');
        expect(style).toContain('border-color: var(--pill-extended-border)');
        expect(style).toContain('background: var(--pill-extended-bg)');
        expect(style).toContain('color: var(--pill-extended-text)');
    });
});
