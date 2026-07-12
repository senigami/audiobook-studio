/**
 * ProjectCard.test.tsx — task 003 (north_star_screen_parity)
 *
 * Covers:
 *  - ActionMenu now receives an `items` array with "Open" (reusing the card's
 *    own click-to-navigate handler) and "Delete" (existing behavior).
 *  - A hover-reveal play-button overlay on the cover thumbnail that plays the
 *    project's assembled audiobook via the global player bus (loadAndPlay)
 *    when one exists, and is disabled with a "Nothing rendered yet" tooltip
 *    when nothing has been assembled — never a silent redirect to Publish.
 *  - The "Details" button remains present/unchanged (INV-1).
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the playerBus boundary (audio owner) — R2, mock only the boundary.
vi.mock('@/store/playerBus', () => ({
    usePlayerBus: vi.fn(() => ({ scope: null, audioUrl: null, playing: false })),
    loadAndPlay: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
}));

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

// Mock the API boundary used to discover whether an audiobook is assembled.
vi.mock('@/api', () => ({
    api: {
        fetchProjectAudiobooks: vi.fn(),
    },
}));

import { ProjectCard } from '@/pages/ProjectDetail/components/ProjectCard';
import { usePlayerBus, loadAndPlay } from '@/store/playerBus';
import { api } from '@/api';
import type { Project } from '@/types';

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
        (usePlayerBus as ReturnType<typeof vi.fn>).mockReturnValue({ scope: null, audioUrl: null, playing: false });
        (api.fetchProjectAudiobooks as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    });

    // -------------------------------------------------------------------
    // Action menu: Open + Delete
    // -------------------------------------------------------------------

    it('passes both "Open" and "Delete" items to ActionMenu', async () => {
        render(<ProjectCard {...baseProps} />);
        await waitFor(() => expect(api.fetchProjectAudiobooks).toHaveBeenCalledWith('proj-1'));
        expect(screen.getByTestId('menu-item-Open')).toBeInTheDocument();
        expect(screen.getByTestId('menu-item-Delete')).toBeInTheDocument();
    });

    it('"Open" reuses the same navigation as clicking the card body', async () => {
        render(<ProjectCard {...baseProps} />);
        await waitFor(() => expect(api.fetchProjectAudiobooks).toHaveBeenCalled());
        fireEvent.click(screen.getByTestId('menu-item-Open'));
        expect(baseProps.onClick).toHaveBeenCalledWith('proj-1');
    });

    it('"Delete" calls onDelete with the project id and name, unchanged', async () => {
        render(<ProjectCard {...baseProps} />);
        await waitFor(() => expect(api.fetchProjectAudiobooks).toHaveBeenCalled());
        fireEvent.click(screen.getByTestId('menu-item-Delete'));
        expect(baseProps.onDelete).toHaveBeenCalledWith('proj-1', 'The Whispering Vale');
    });

    // -------------------------------------------------------------------
    // Hover-play overlay
    // -------------------------------------------------------------------

    it('shows a disabled play control with a "Nothing rendered yet" tooltip when no audiobook is assembled', async () => {
        (api.fetchProjectAudiobooks as ReturnType<typeof vi.fn>).mockResolvedValue([]);
        render(<ProjectCard {...baseProps} />);

        const btn = await screen.findByRole('button', { name: /play the whispering vale/i });
        expect(btn).toBeDisabled();
        expect(btn).toHaveAttribute('title', 'Nothing rendered yet');
    });

    it('plays the assembled audiobook via loadAndPlay when one exists', async () => {
        (api.fetchProjectAudiobooks as ReturnType<typeof vi.fn>).mockResolvedValue([
            { filename: 'vale.mp3', title: 'The Whispering Vale', cover_url: null, url: '/api/audiobooks/vale.mp3' },
        ]);
        render(<ProjectCard {...baseProps} />);

        const btn = await screen.findByRole('button', { name: /play the whispering vale/i });
        expect(btn).not.toBeDisabled();

        fireEvent.click(btn);
        expect(loadAndPlay).toHaveBeenCalledWith(expect.objectContaining({
            scope: 'book',
            audioUrl: '/api/audiobooks/vale.mp3',
        }));
    });

    it('passes the assembled audiobook duration as initialDuration to avoid the unknown-duration bootstrap window', async () => {
        // Book-scope audio can be many hours long. Without initialDuration,
        // PlayerBar's fitsLegibly(0, ...) bootstrap treats "unknown
        // duration" as "show the waveform", letting WaveformStrip attempt a
        // full wavesurfer decode of the entire file before the browser's
        // own metadata loads.
        (api.fetchProjectAudiobooks as ReturnType<typeof vi.fn>).mockResolvedValue([
            {
                filename: 'vale.mp3',
                title: 'The Whispering Vale',
                cover_url: null,
                url: '/api/audiobooks/vale.mp3',
                duration_seconds: 48540,
            },
        ]);
        render(<ProjectCard {...baseProps} />);

        const btn = await screen.findByRole('button', { name: /play the whispering vale/i });
        fireEvent.click(btn);

        expect(loadAndPlay).toHaveBeenCalledWith(expect.objectContaining({
            initialDuration: 48540,
        }));
    });

    it('clicking the play overlay never navigates the card (no bait-and-switch to Publish/details)', async () => {
        (api.fetchProjectAudiobooks as ReturnType<typeof vi.fn>).mockResolvedValue([
            { filename: 'vale.mp3', title: 'The Whispering Vale', cover_url: null, url: '/api/audiobooks/vale.mp3' },
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
        await waitFor(() => expect(api.fetchProjectAudiobooks).toHaveBeenCalled());
        expect(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
    });
});
