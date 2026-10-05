/**
 * VariantFilterBar.test.tsx — voice-variant-tagging-and-ia task 010
 *
 * Covers: chip rendering per distinct `performance_tags` value, OR-within
 * toggle semantics (task 010's DC-003 "find the sad, slow one" filter bar),
 * clearing filters, and the no-tags no-render case.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { SpeakerProfile } from '@/types';
import { VariantFilterBar } from '@/pages/Voices/components/VariantFilterBar';

function makeProfile(overrides: Partial<SpeakerProfile>): SpeakerProfile {
    return {
        name: 'Aria Nova - Variant',
        speaker_id: 'sp-1',
        variant_name: null,
        engine: 'xtts',
        is_default: false,
        wav_count: 1,
        speed: 1.0,
        preview_url: null,
        ...overrides,
    } as SpeakerProfile;
}

describe('VariantFilterBar', () => {
    it('renders one chip per distinct performance_tags value across all profiles', () => {
        const profiles = [
            makeProfile({ name: 'A', performance_tags: ['sad', 'slow'] }),
            makeProfile({ name: 'B', performance_tags: ['happy', 'slow'] }),
        ];
        render(<VariantFilterBar profiles={profiles} activeFilters={[]} onFilterChange={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'sad' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'happy' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'slow' })).toBeInTheDocument();
    });

    it('clicking an inactive chip adds it to the active filters', () => {
        const profiles = [makeProfile({ name: 'A', performance_tags: ['sad', 'slow'] })];
        const onFilterChange = vi.fn();
        render(<VariantFilterBar profiles={profiles} activeFilters={[]} onFilterChange={onFilterChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'sad' }));
        expect(onFilterChange).toHaveBeenCalledWith(['sad']);
    });

    it('clicking an active chip removes it from the active filters (toggle)', () => {
        const profiles = [makeProfile({ name: 'A', performance_tags: ['sad', 'slow'] })];
        const onFilterChange = vi.fn();
        render(<VariantFilterBar profiles={profiles} activeFilters={['sad']} onFilterChange={onFilterChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'sad' }));
        expect(onFilterChange).toHaveBeenCalledWith([]);
    });

    it('selecting a second chip appends to the OR-within-facet active filter list', () => {
        const profiles = [makeProfile({ name: 'A', performance_tags: ['sad', 'slow'] })];
        const onFilterChange = vi.fn();
        render(<VariantFilterBar profiles={profiles} activeFilters={['sad']} onFilterChange={onFilterChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'slow' }));
        expect(onFilterChange).toHaveBeenCalledWith(['sad', 'slow']);
    });

    it('reflects active filters via aria-pressed', () => {
        const profiles = [makeProfile({ name: 'A', performance_tags: ['sad', 'slow'] })];
        render(<VariantFilterBar profiles={profiles} activeFilters={['sad']} onFilterChange={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'sad' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'slow' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('renders nothing when no profile has performance_tags', () => {
        const profiles = [makeProfile({ name: 'A', performance_tags: [] }), makeProfile({ name: 'B' })];
        const { container } = render(
            <VariantFilterBar profiles={profiles} activeFilters={[]} onFilterChange={vi.fn()} />
        );
        expect(container.firstChild).toBeNull();
    });
});
