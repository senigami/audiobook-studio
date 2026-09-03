/**
 * ProjectCard.test.tsx — task 003 (north_star_screen_parity) + chapter-by-
 * chapter continuous playback wiring.
 *
 * Covers:
 *  - ActionMenu now receives an `items` array with "Open" (reusing the card's
 *    own click-to-navigate handler) and "Delete" (existing behavior).
 *  - A hover-reveal play-button overlay on the cover thumbnail that drives
 *    chapter-by-chapter continuous playback (playBookContinuous) built from
 *    the project's rendered chapters, and is disabled with a "Nothing
 *    rendered yet" tooltip when no chapter has been rendered — never a
 *    silent redirect to Publish.
 *  - The "Details" button remains present/unchanged (INV-1).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the playerBus boundary (audio owner) — R2, mock only the boundary.
vi.mock('@/store/playerBus', () => ({
    usePlayerBus: vi.fn(() => ({ scope: null, audioUrl: null, bookId: null, playing: false })),
    play: vi.fn(),
    pause: vi.fn(),
}));

// Mock the bookContinuousPlayback boundary, but keep the real
// buildChapterQueue implementation via importActual (R2 — mock only the
// true external boundary; buildChapterQueue is pure logic worth exercising
// for real).
vi.mock('@/store/bookContinuousPlayback', async () => {
    const actual = await vi.importActual<typeof import('@/store/bookContinuousPlayback')>(
        '@/store/bookContinuousPlayback',
    );
    return {
        ...actual,
        playBookContinuous: vi.fn(),
        useAutoSaveResumePosition: vi.fn(),
    };
});

// Mock ActionMenu so we can assert on `items` without portal/DOM complexity
// (same pattern as VoiceCatalogCard.test.tsx).
vi.mock('@/components/ui/ActionMenu', () => ({
    ActionMenu: ({ items }: { items?: Array<{ label?: string; onClick?: () => void; isDestructive?: boolean }> }) => (
        <div data-testid="action-menu">
            {items?.map((item, i) => (
                <button
                    key={i}
                    data-testid={`menu-item-${item.label}`}
                    onClick={item.onClick}
                    data-destructive={item.isDestructive ? 'true' : undefined}
                >
                    {item.label}
                </button>
            ))}
        </div>
    ),
}));

// Mock the API boundary used to discover a project's rendered chapters.
vi.mock('@/api', () => ({
    api: {
        fetchChapters: vi.fn(),
    },
}));

import { ProjectCard } from '@/pages/ProjectDetail/components/ProjectCard';
import { usePlayerBus } from '@/store/playerBus';
import { playBookContinuous, useAutoSaveResumePosition, buildChapterQueue } from '@/store/bookContinuousPlayback';
import { api } from '@/api';
import type { Project, Chapter } from '@/types';

const project: Project = {
    id: 'proj-1',
    name: 'The Whispering Vale',
    series: null,
    series_position: null,
    author: 'E. Holloway',
    speaker_profile_name: null,
    cover_image_path: null,
    description: null,
    created_at: 0,
    updated_at: 0,
};

function makeChapter(overrides: Partial<Chapter> = {}): Chapter {
    return {
        id: 'ch-1',
        project_id: 'proj-1',
        title: 'Chapter One',
        text_content: '',
        speaker_profile_name: null,
        sort_order: 0,
        audio_status: 'done',
        audio_file_path: 'ch-1.wav',
        text_last_modified: null,
        audio_generated_at: null,
        char_count: 0,
        word_count: 0,
        sent_count: 0,
        predicted_audio_length: 0,
        audio_length_seconds: 0,
        ...overrides,
    };
}

const baseProps = {
    project,
    isHovered: true,
    onHover: vi.fn(),
    onClick: vi.fn(),
    onOpenDetails: vi.fn(),
    onDelete: vi.fn(),
    formatDate: (t: number) => String(t),
};

describe('ProjectCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (usePlayerBus as ReturnType<typeof vi.fn>).mockReturnValue({ scope: null, audioUrl: null, bookId: null, playing: false });
        (api.fetchChapters as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    });

    // -------------------------------------------------------------------
    // Action menu: Open + Delete
    // -------------------------------------------------------------------

    it('passes both "Open" and "Delete" items to ActionMenu', async () => {
        render(<ProjectCard {...baseProps} />);
        await waitFor(() => expect(api.fetchChapters).toHaveBeenCalledWith('proj-1'));
        expect(screen.getByTestId('menu-item-Open')).toBeInTheDocument();
        expect(screen.getByTestId('menu-item-Delete')).toBeInTheDocument();
    });

    it('"Open" reuses the same navigation as clicking the card body', async () => {
        render(<ProjectCard {...baseProps} />);
        await waitFor(() => expect(api.fetchChapters).toHaveBeenCalled());
        fireEvent.click(screen.getByTestId('menu-item-Open'));
        expect(baseProps.onClick).toHaveBeenCalledWith('proj-1');
    });

    it('"Delete" calls onDelete with the project id and name, unchanged', async () => {
        render(<ProjectCard {...baseProps} />);
        await waitFor(() => expect(api.fetchChapters).toHaveBeenCalled());
        fireEvent.click(screen.getByTestId('menu-item-Delete'));
        expect(baseProps.onDelete).toHaveBeenCalledWith('proj-1', 'The Whispering Vale');
    });

    // -------------------------------------------------------------------
    // Hover-play overlay
    // -------------------------------------------------------------------

    it('shows a disabled play control with a "Nothing rendered yet" tooltip when no chapter has rendered audio', async () => {
        (api.fetchChapters as ReturnType<typeof vi.fn>).mockResolvedValue([
            makeChapter({ audio_file_path: null }),
        ]);
        render(<ProjectCard {...baseProps} />);

        const btn = await screen.findByRole('button', { name: /play the whispering vale/i });
        expect(btn).toBeDisabled();
        expect(btn).toHaveAttribute('title', 'Nothing rendered yet');
    });

    it('plays chapter-by-chapter via playBookContinuous with the built queue when a chapter has rendered audio', async () => {
        const chapters = [
            makeChapter({ id: 'ch-1', title: 'Chapter One', audio_file_path: 'ch-1.wav' }),
            makeChapter({ id: 'ch-2', title: 'Chapter Two', sort_order: 1, audio_file_path: null }),
        ];
        (api.fetchChapters as ReturnType<typeof vi.fn>).mockResolvedValue(chapters);
        render(<ProjectCard {...baseProps} />);

        const btn = await screen.findByRole('button', { name: /play the whispering vale/i });
        expect(btn).not.toBeDisabled();

        fireEvent.click(btn);

        expect(playBookContinuous).toHaveBeenCalledWith(
            'proj-1',
            'The Whispering Vale',
            buildChapterQueue(chapters),
        );
    });

    it('calls useAutoSaveResumePosition with the project id and built queue', async () => {
        const chapters = [makeChapter({ id: 'ch-1', audio_file_path: 'ch-1.wav' })];
        (api.fetchChapters as ReturnType<typeof vi.fn>).mockResolvedValue(chapters);
        render(<ProjectCard {...baseProps} />);

        await waitFor(() => expect(api.fetchChapters).toHaveBeenCalled());
        await waitFor(() => {
            expect(useAutoSaveResumePosition).toHaveBeenLastCalledWith('proj-1', buildChapterQueue(chapters));
        });
    });

    it('treats playerBus.bookId matching this project as "this book loaded" for the pause/resume toggle', async () => {
        (usePlayerBus as ReturnType<typeof vi.fn>).mockReturnValue({
            scope: 'chapter',
            audioUrl: '/api/projects/proj-1/chapters/ch-2/assets/audio?filename=ch-2.wav',
            bookId: 'proj-1',
            playing: true,
        });
        const chapters = [makeChapter({ id: 'ch-1', audio_file_path: 'ch-1.wav' })];
        (api.fetchChapters as ReturnType<typeof vi.fn>).mockResolvedValue(chapters);
        render(<ProjectCard {...baseProps} />);

        const btn = await screen.findByRole('button', { name: /play the whispering vale/i });
        // Playing this book's continuous queue -> clicking should pause, not
        // start a new playBookContinuous call.
        fireEvent.click(btn);

        expect(playBookContinuous).not.toHaveBeenCalled();
    });

    it('clicking the play overlay never navigates the card (no bait-and-switch to Publish/details)', async () => {
        (api.fetchChapters as ReturnType<typeof vi.fn>).mockResolvedValue([
            makeChapter({ id: 'ch-1', audio_file_path: 'ch-1.wav' }),
        ]);
        render(<ProjectCard {...baseProps} />);

        const btn = await screen.findByRole('button', { name: /play the whispering vale/i });
        fireEvent.click(btn);

        expect(baseProps.onClick).not.toHaveBeenCalled();
        expect(baseProps.onOpenDetails).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------
    // Details button — must remain (INV-1)
    // -------------------------------------------------------------------

    it('keeps the "Details" button unchanged', async () => {
        render(<ProjectCard {...baseProps} />);
        await waitFor(() => expect(api.fetchChapters).toHaveBeenCalled());
        expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
    });
});
