/**
 * VoiceCatalogCard.test.tsx — R5-T3
 * Tests: name/pills/badges render; CTA label matches phase; ⋯ menu items fire callbacks;
 * preview button toggles through playerBus (audio boundary mocked).
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the playerBus boundary (audio owner)
vi.mock('@/store/playerBus', () => ({
    usePlayerBus: vi.fn(() => ({ scope: null, audioUrl: null, playing: false })),
    loadAndPlay: vi.fn(),
    pause: vi.fn(),
}));

// Mock ActionMenu so we can test items without portal/DOM complexity
vi.mock('@/components/ui/ActionMenu', () => ({
    ActionMenu: ({ items }: { items: Array<{ label?: string; onClick?: () => void; isDestructive?: boolean }> }) => (
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

import { VoiceCatalogCard } from '@/pages/Voices/components/VoiceCatalogCard';
import { usePlayerBus, loadAndPlay, pause as pauseBusMock } from '@/store/playerBus';
import type { Speaker, SpeakerProfile, TtsEngine, VoiceMetadata } from '@/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const readyEngine: TtsEngine = {
    engine_id: 'xtts',
    enabled: true,
    status: 'ready',
    display_name: 'XTTS',
    verified: false,
    capabilities: ['voice_build'],
} as TtsEngine;

const speaker: Speaker = {
    id: 'sp-1',
    name: 'Clara Bell',
    default_profile_name: 'Default',
    created_at: 0,
    updated_at: 0,
};

const readyProfile: SpeakerProfile = {
    name: 'Clara Bell - Default',
    wav_count: 3,
    speed: 1.0,
    is_default: true,
    speaker_id: 'sp-1',
    variant_name: 'Default',
    engine: 'xtts',
    preview_url: '/preview/clara.mp3',
    is_rebuild_required: false,
    rebuild_reasons: [],
    is_ready: true,
    has_latent: false,
    voice_asset_id: null,
    reference_sample: null,
    samples: [],
};

const noSamplesProfile: SpeakerProfile = {
    ...readyProfile,
    wav_count: 0,
    is_ready: false,
    preview_url: null,
    samples: [],
};

const metadata: VoiceMetadata = {
    id: 'sp-1',
    name: 'Clara Bell',
    description: 'A clear, bright female narrator voice.',
    is_untagged: false,
    attributes: {
        voice_class: 'human',
        gender: 'feminine',
        age: 'adult',
    },
    tags: ['warm'],
};

const baseProps = {
    speaker,
    engines: [readyEngine],
    buildingProfiles: {},
    testProgress: {},
    metadata,
    onBuildNow: vi.fn().mockResolvedValue(true),
    onNavigateToLab: vi.fn(),
    onSetDefaultClick: vi.fn(),
    onRenameClick: vi.fn(),
    onExportVoice: vi.fn(),
    requestConfirm: vi.fn(),
    onEditMetadata: vi.fn(),
    onEditTestText: vi.fn(),
    onRefresh: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VoiceCatalogCard', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (usePlayerBus as ReturnType<typeof vi.fn>).mockReturnValue({ scope: null, audioUrl: null, playing: false });
    });

    it('renders voice name', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        expect(screen.getByText('Clara Bell')).toBeInTheDocument();
    });

    it('renders attribute pills from metadata', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        // pills: human(class), feminine(gender), adult(age), warm(tag) — 3 visible + +1 overflow
        expect(screen.getByText('human')).toBeInTheDocument();
        expect(screen.getByText('feminine')).toBeInTheDocument();
    });

    it('shows "★ default" badge when voice has a default profile', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        expect(screen.getByLabelText('Default voice')).toBeInTheDocument();
    });

    it('does NOT show default badge when no profile is default', () => {
        const profiles = [{ ...readyProfile, is_default: false }];
        render(<VoiceCatalogCard {...baseProps} profiles={profiles} />);
        expect(screen.queryByLabelText('Default voice')).not.toBeInTheDocument();
    });

    it('shows UntaggedBadge when voice is untagged (no attributes, no tags)', () => {
        const untaggedMeta: VoiceMetadata = { ...metadata, is_untagged: true, attributes: undefined, tags: [] };
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} metadata={untaggedMeta} />);
        expect(screen.getByRole('button', { name: /missing attributes/i })).toBeInTheDocument();
    });

    it('shows description text', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        expect(screen.getByText('A clear, bright female narrator voice.')).toBeInTheDocument();
    });

    // ---------------------------------------------------------------------------
    // CTA labels by phase
    // ---------------------------------------------------------------------------

    it('shows "Edit voice" CTA for READY profile', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        expect(screen.getByRole('button', { name: 'Edit voice' })).toBeInTheDocument();
    });

    it('shows "Add samples" CTA for no-samples profile', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[noSamplesProfile]} />);
        expect(screen.getByRole('button', { name: 'Add samples' })).toBeInTheDocument();
    });

    it('shows "Build voice" CTA for profile with samples but no preview', () => {
        const profiles = [{ ...readyProfile, preview_url: null, wav_count: 3 }];
        render(<VoiceCatalogCard {...baseProps} profiles={profiles} />);
        expect(screen.getByRole('button', { name: 'Build voice' })).toBeInTheDocument();
    });

    // ---------------------------------------------------------------------------
    // CTA actions
    // ---------------------------------------------------------------------------

    it('"Edit voice" CTA calls onNavigateToLab', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Edit voice' }));
        expect(baseProps.onNavigateToLab).toHaveBeenCalledWith('sp-1');
    });

    // ---------------------------------------------------------------------------
    // Action menu items
    // ---------------------------------------------------------------------------

    it('action menu contains all 6 expected items', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        expect(screen.getByTestId('menu-item-Set as Default')).toBeInTheDocument();
        expect(screen.getByTestId('menu-item-Edit Metadata')).toBeInTheDocument();
        expect(screen.getByTestId('menu-item-Edit Recording Script')).toBeInTheDocument();
        expect(screen.getByTestId('menu-item-Rename Voice')).toBeInTheDocument();
        expect(screen.getByTestId('menu-item-Export Voice Bundle')).toBeInTheDocument();
        expect(screen.getByTestId('menu-item-Delete Voice (all variants)')).toBeInTheDocument();
    });

    it('Edit Recording Script fires onEditTestText with the default profile', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        fireEvent.click(screen.getByTestId('menu-item-Edit Recording Script'));
        expect(baseProps.onEditTestText).toHaveBeenCalledWith(readyProfile);
    });

    it('Rename Voice fires onRenameClick', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        fireEvent.click(screen.getByTestId('menu-item-Rename Voice'));
        expect(baseProps.onRenameClick).toHaveBeenCalledWith(speaker);
    });

    it('Edit Metadata fires onEditMetadata', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        fireEvent.click(screen.getByTestId('menu-item-Edit Metadata'));
        expect(baseProps.onEditMetadata).toHaveBeenCalled();
    });

    it('Export Voice Bundle fires onExportVoice', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        fireEvent.click(screen.getByTestId('menu-item-Export Voice Bundle'));
        expect(baseProps.onExportVoice).toHaveBeenCalledWith('Clara Bell');
    });

    it('Delete Voice fires requestConfirm', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        fireEvent.click(screen.getByTestId('menu-item-Delete Voice (all variants)'));
        expect(baseProps.requestConfirm).toHaveBeenCalledWith(expect.objectContaining({
            isDestructive: true,
        }));
    });

    // ---------------------------------------------------------------------------
    // Preview button — mocked playerBus
    // ---------------------------------------------------------------------------

    it('preview button is disabled when no preview_url', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[noSamplesProfile]} />);
        const btn = screen.getByRole('button', { name: 'Play preview' });
        expect(btn).toBeDisabled();
    });

    it('preview button calls loadAndPlay when profile has preview_url', () => {
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        fireEvent.click(screen.getByRole('button', { name: 'Play preview' }));
        expect(loadAndPlay).toHaveBeenCalledWith(expect.objectContaining({
            scope: 'preview',
            audioUrl: '/preview/clara.mp3',
        }));
    });

    it('preview button shows Pause and calls pause when already playing', () => {
        (usePlayerBus as ReturnType<typeof vi.fn>).mockReturnValue({
            scope: 'preview',
            audioUrl: '/preview/clara.mp3',
            playing: true,
        });
        render(<VoiceCatalogCard {...baseProps} profiles={[readyProfile]} />);
        const btn = screen.getByRole('button', { name: 'Pause preview' });
        fireEvent.click(btn);
        expect(pauseBusMock).toHaveBeenCalled();
    });
});
