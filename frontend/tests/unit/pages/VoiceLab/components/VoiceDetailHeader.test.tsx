/**
 * VoiceDetailHeader.test.tsx — task 003 (voice-variants round 2, icon-upload
 * consolidation)
 *
 * IconUpload.tsx's upload/drag-drop/copy-prompt behavior is folded directly
 * onto the avatar rendered here instead of a standalone section in
 * OverviewTab. This includes a DC-013 regression check (moved from
 * OverviewTab.test.tsx, which used to own it): the icon-only "copy icon
 * prompt" button must remain mounted somewhere reachable on the page after
 * the move -- it was orphaned once already in an earlier rework.
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceDetailHeader, type VoiceDetailHeaderProps } from '@/pages/VoiceLab/components/VoiceDetailHeader';
import { buildIconPrompt } from '@/pages/VoiceLab/iconPrompt';
import type { VoiceMetadata } from '@/types';

vi.mock('@/api', () => ({
    api: {
        uploadVoiceIcon: vi.fn(),
    },
}));

import { api } from '@/api';

/** Same FakeImage seam used by IconUpload.test.tsx -- jsdom can't decode real images. */
class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    private _src = '';
    static behavior: 'square' | 'nonsquare' = 'square';

    set src(_value: string) {
        this._src = _value;
        queueMicrotask(() => {
            this.naturalWidth = 400;
            this.naturalHeight = FakeImage.behavior === 'square' ? 400 : 300;
            this.onload?.();
        });
    }
    get src() {
        return this._src;
    }
}

function makeFile(name = 'photo.png', type = 'image/png') {
    return new File(['fake-bytes'], name, { type });
}

const mockVoice: VoiceMetadata = {
    id: 'voice-abc',
    name: 'Aria Nova',
    description: 'A calm narrator.',
    attributes: { class: 'human', gender: 'feminine', age: 'adult' },
    tags: [],
    is_untagged: false,
};

function baseProps(overrides: Partial<VoiceDetailHeaderProps> = {}): VoiceDetailHeaderProps {
    return {
        voiceId: 'voice-abc',
        metadata: mockVoice,
        iconUrl: null,
        pills: [],
        isMobile: false,
        profiles: [],
        onSetDefault: vi.fn(),
        onExport: vi.fn(),
        onPublish: vi.fn(),
        onDelete: vi.fn(),
        ...overrides,
    };
}

describe('VoiceDetailHeader', () => {
    const originalImage = global.Image;

    beforeEach(() => {
        vi.clearAllMocks();
        (global as any).Image = FakeImage;
        global.URL.createObjectURL = vi.fn(() => 'blob:fake');
        global.URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
        (global as any).Image = originalImage;
    });

    it('mounts the icon-only copy-icon-prompt button reachable on the page (DC-013 regression)', () => {
        render(<VoiceDetailHeader {...baseProps()} />);

        const button = screen.getByRole('button', { name: 'Copy icon generation prompt' });
        expect(button).toBeInTheDocument();
        expect(button).toHaveAttribute('title', buildIconPrompt(mockVoice));
    });

    it('uploads a new icon via the "Upload icon" button under the avatar', async () => {
        FakeImage.behavior = 'square';
        (api.uploadVoiceIcon as any).mockResolvedValue({ image: 'icon.png' });

        render(<VoiceDetailHeader {...baseProps()} />);

        const uploadButton = screen.getByRole('button', { name: 'Upload icon' });
        const input = screen.getByLabelText('Upload voice icon') as HTMLInputElement;
        fireEvent.click(uploadButton);
        fireEvent.change(input, { target: { files: [makeFile()] } });

        await waitFor(() => {
            expect(api.uploadVoiceIcon).toHaveBeenCalledWith('voice-abc', expect.any(File));
        });
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Replace icon' })).toBeInTheDocument();
        });
    });

    it('bumps the icon src after a successful upload so the browser actually re-fetches it (user-reported: image did not update until page reload)', async () => {
        FakeImage.behavior = 'square';
        (api.uploadVoiceIcon as any).mockResolvedValue({ image: 'icon.png' });

        render(<VoiceDetailHeader {...baseProps({ iconUrl: '/api/voices/voice-abc/icon' })} />);

        const beforeSrc = (screen.getByAltText('Aria Nova icon') as HTMLImageElement).src;

        const uploadButton = screen.getByRole('button', { name: 'Replace icon' });
        const input = screen.getByLabelText('Upload voice icon') as HTMLInputElement;
        fireEvent.click(uploadButton);
        fireEvent.change(input, { target: { files: [makeFile()] } });

        await waitFor(() => {
            expect(api.uploadVoiceIcon).toHaveBeenCalled();
        });

        await waitFor(() => {
            const afterSrc = (screen.getByAltText('Aria Nova icon') as HTMLImageElement).src;
            expect(afterSrc).not.toBe(beforeSrc);
        });
    });

    it('uploads an image dropped directly onto the avatar', async () => {
        FakeImage.behavior = 'square';
        (api.uploadVoiceIcon as any).mockResolvedValue({ image: 'icon.png' });

        const { container } = render(<VoiceDetailHeader {...baseProps()} />);
        const avatar = container.querySelector('.voice-lab-page__avatar') as HTMLElement;

        fireEvent.drop(avatar, { dataTransfer: { files: [makeFile()] } });

        await waitFor(() => {
            expect(api.uploadVoiceIcon).toHaveBeenCalledWith('voice-abc', expect.any(File));
        });
    });

    it('surfaces an upload error near the avatar instead of swallowing it', async () => {
        FakeImage.behavior = 'square';
        (api.uploadVoiceIcon as any).mockRejectedValue(new Error('Icon must be square (1:1 aspect ratio). Got 400×300.'));

        render(<VoiceDetailHeader {...baseProps()} />);

        const input = screen.getByLabelText('Upload voice icon') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [makeFile()] } });

        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent('Icon must be square (1:1 aspect ratio). Got 400×300.');
        });
    });
});
