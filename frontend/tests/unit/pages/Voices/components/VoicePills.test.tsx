/**
 * VoicePills.test.tsx — R5-T1
 * Tests: pill ordering, correct category classes, unknown-future field as extended,
 * +N overflow expand/collapse.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
    voicePillsFromMetadata,
    VoicePill,
    VoicePillRow,
    UntaggedBadge,
} from '@/pages/Voices/components/VoicePills';
import type { VoiceMetadata } from '@/types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const fullMeta: VoiceMetadata = {
    id: 'voice-1',
    name: 'Test Voice',
    is_untagged: false,
    attributes: {
        voice_class: 'human',
        gender: 'feminine',
        age: 'adult',
        accent: 'irish',
    },
    tags: ['warm', 'bright'],
};

const metaWithUnknownField: VoiceMetadata = {
    id: 'voice-2',
    name: 'Future Voice',
    is_untagged: false,
    attributes: {
        voice_class: 'synthetic',
        timbre: 'gravel',
    } as any,
    tags: [],
};

// ---------------------------------------------------------------------------
// voicePillsFromMetadata
// ---------------------------------------------------------------------------

describe('voicePillsFromMetadata', () => {
    it('produces 6 pills from fullMeta in fixed order: class, gender, age, extended, tag×2', () => {
        const pills = voicePillsFromMetadata(fullMeta);
        // class=human, gender=feminine, age=adult, extended=irish(accent), tag=warm, tag=bright
        expect(pills).toHaveLength(6);
        expect(pills[0]).toMatchObject({ label: 'human', category: 'class' });
        expect(pills[1]).toMatchObject({ label: 'feminine', category: 'gender' });
        expect(pills[2]).toMatchObject({ label: 'adult', category: 'age' });
        // extended (accent) before tags
        expect(pills[3]).toMatchObject({ label: 'irish', category: 'extended' });
        expect(pills[4]).toMatchObject({ label: 'warm', category: 'tag' });
        expect(pills[5]).toMatchObject({ label: 'bright', category: 'tag' });
    });

    it('renders unknown future field "timbre" as an extended pill (no hardcoded set)', () => {
        const pills = voicePillsFromMetadata(metaWithUnknownField);
        const extended = pills.filter(p => p.category === 'extended');
        expect(extended.length).toBeGreaterThanOrEqual(1);
        expect(extended.some(p => p.label === 'gravel')).toBe(true);
    });

    it('returns empty array for untagged voice with no attributes or tags', () => {
        const meta: VoiceMetadata = { id: 'v3', name: 'Bare', is_untagged: true };
        expect(voicePillsFromMetadata(meta)).toHaveLength(0);
    });

    it('places multiple tags after extended pills', () => {
        const pills = voicePillsFromMetadata(fullMeta);
        const lastExtIdx = pills.map(p => p.category).lastIndexOf('extended');
        const firstTagIdx = pills.findIndex(p => p.category === 'tag');
        expect(firstTagIdx).toBeGreaterThan(lastExtIdx);
    });
});

// ---------------------------------------------------------------------------
// VoicePill render
// ---------------------------------------------------------------------------

describe('VoicePill', () => {
    it('renders with correct data-category attribute', () => {
        const spec = { label: 'human', category: 'class' as const, key: 'voice_class' };
        const { container } = render(<VoicePill spec={spec} />);
        const el = container.querySelector('[data-category="class"]');
        expect(el).toBeInTheDocument();
        expect(el?.textContent).toBe('human');
    });

    it('renders gender pill with gender data-category', () => {
        const spec = { label: 'feminine', category: 'gender' as const, key: 'gender' };
        const { container } = render(<VoicePill spec={spec} />);
        expect(container.querySelector('[data-category="gender"]')).toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// VoicePillRow — overflow expand/collapse
// ---------------------------------------------------------------------------

describe('VoicePillRow', () => {
    const makePills = (labels: string[]) =>
        labels.map((l, i) => ({ label: l, category: 'tag' as const, key: `tag-${i}` }));

    it('shows all pills when count <= max', () => {
        render(<VoicePillRow pills={makePills(['a', 'b', 'c'])} max={3} />);
        expect(screen.getByText('a')).toBeInTheDocument();
        expect(screen.getByText('b')).toBeInTheDocument();
        expect(screen.getByText('c')).toBeInTheDocument();
        expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
    });

    it('shows +N overflow chip when pills > max', () => {
        render(<VoicePillRow pills={makePills(['a', 'b', 'c', 'd', 'e'])} max={3} />);
        expect(screen.getByText('+2')).toBeInTheDocument();
        expect(screen.queryByText('d')).not.toBeInTheDocument();
    });

    it('expands all pills on +N click', () => {
        render(<VoicePillRow pills={makePills(['a', 'b', 'c', 'd', 'e'])} max={3} />);
        fireEvent.click(screen.getByText('+2'));
        expect(screen.getByText('d')).toBeInTheDocument();
        expect(screen.getByText('e')).toBeInTheDocument();
        expect(screen.queryByText('+2')).not.toBeInTheDocument();
    });

    it('shows collapse button after expand, clicking collapses', () => {
        render(<VoicePillRow pills={makePills(['a', 'b', 'c', 'd', 'e'])} max={3} />);
        fireEvent.click(screen.getByText('+2'));
        const collapseBtn = screen.getByRole('button', { name: 'Show fewer attributes' });
        expect(collapseBtn).toBeInTheDocument();
        fireEvent.click(collapseBtn);
        expect(screen.queryByText('d')).not.toBeInTheDocument();
        expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('renders nothing when no pills', () => {
        const { container } = render(<VoicePillRow pills={[]} />);
        expect(container.firstChild).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// UntaggedBadge
// ---------------------------------------------------------------------------

describe('UntaggedBadge', () => {
    it('renders with accessible label', () => {
        render(<UntaggedBadge />);
        expect(screen.getByRole('button', { name: /missing attributes/i })).toBeInTheDocument();
    });

    it('calls onClick when clicked', () => {
        let called = false;
        render(<UntaggedBadge onClick={() => { called = true; }} />);
        fireEvent.click(screen.getByRole('button', { name: /missing attributes/i }));
        expect(called).toBe(true);
    });
});
