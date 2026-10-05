import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LibraryContinueSection } from '@/pages/ProjectLibrary/components/LibraryContinueSection';
import type { Project } from '@/types';

// Task 006 (north_star_screen_parity) — Library "Continue" section.
//
// Scoped-down per the task's Step 1.3 allowance: status line + a *static*
// rendered-fraction progress bar (chapters_rendered_count / chapter_count,
// both genuinely returned by app/db/projects.py::list_projects()), with NO
// ETA — the progress/ETA subsystem (app/orchestration/progress/) only
// computes ETA for a single currently-active job, not a book-level
// aggregate, so a numeric ETA here would be fabricated. See
// design-docs/plans/active/north_star_screen_parity/tasks/
// 006-library-continue-section.md's Research outcome.

const makeProject = (overrides: Partial<Project> = {}): Project => ({
    id: 'p1',
    name: 'The Whispering Vale',
    series: 'The Vale Cycle',
    series_position: 1,
    author: 'E. Holloway',
    speaker_profile_name: null,
    cover_image_path: null,
    description: null,
    created_at: 1_700_000_000,
    updated_at: 1_700_000_100,
    status: 'casting',
    chapter_count: 5,
    chapters_rendered_count: 3,
    ...overrides,
});

describe('LibraryContinueSection', () => {
    it('renders nothing when no project qualifies', () => {
        const { container } = render(
            <LibraryContinueSection projects={[]} onOpenProject={vi.fn()} />
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing when every project is fully rendered', () => {
        const { container } = render(
            <LibraryContinueSection
                projects={[makeProject({ status: 'rendered', chapters_rendered_count: 5 })]}
                onOpenProject={vi.fn()}
            />
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing for drafting-only projects (no rendered fraction to show)', () => {
        const { container } = render(
            <LibraryContinueSection
                projects={[makeProject({ status: 'drafting', chapter_count: 0, chapters_rendered_count: 0 })]}
                onOpenProject={vi.fn()}
            />
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('shows up to 2 most-recently-active in-progress projects with a real status line and percentage, no ETA', () => {
        const projects = [
            makeProject({ id: 'p1', name: 'Book A', updated_at: 100, chapter_count: 4, chapters_rendered_count: 1 }),
            makeProject({ id: 'p2', name: 'Book B', updated_at: 300, chapter_count: 5, chapters_rendered_count: 3 }),
            makeProject({ id: 'p3', name: 'Book C', updated_at: 200, chapter_count: 10, chapters_rendered_count: 9 }),
        ];
        render(<LibraryContinueSection projects={projects} onOpenProject={vi.fn()} />);

        expect(screen.getByText('Continue')).toBeInTheDocument();
        // Most recently updated two: Book B (300) and Book C (200) — Book A (100) excluded.
        expect(screen.getByText('Book B')).toBeInTheDocument();
        expect(screen.getByText('Book C')).toBeInTheDocument();
        expect(screen.queryByText('Book A')).not.toBeInTheDocument();

        // Real, non-fabricated percentage text derived from the counts.
        expect(screen.getByText(/3 of 5 chapters rendered/i)).toBeInTheDocument();
        expect(screen.getByText(/9 of 10 chapters rendered/i)).toBeInTheDocument();

        // No ETA/time-remaining text anywhere — not available at book grain.
        expect(screen.queryByText(/left$/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/eta/i)).not.toBeInTheDocument();
    });

    it('caps at 2 cards even when more than 2 projects qualify', () => {
        const projects = [
            makeProject({ id: 'p1', name: 'Book A', updated_at: 100 }),
            makeProject({ id: 'p2', name: 'Book B', updated_at: 300 }),
            makeProject({ id: 'p3', name: 'Book C', updated_at: 200 }),
        ];
        render(<LibraryContinueSection projects={projects} onOpenProject={vi.fn()} />);
        const headings = screen.getAllByRole('heading', { level: 3 });
        expect(headings).toHaveLength(2);
    });
});
