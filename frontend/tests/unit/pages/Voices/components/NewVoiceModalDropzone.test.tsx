// WIRE-1 tests: NewVoiceModal mounts VoiceDropzone and duration validation works.
// Mock boundary: framer-motion animations, Audio (duration check), URL.createObjectURL.
// R2: we never mock the component under test (NewVoiceModal / VoiceDropzone internals);
//     only the environment APIs at the boundary are mocked.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NewVoiceModal } from '@/pages/Voices/components/VoiceModals';

vi.mock('framer-motion', () => ({
    motion: {
        div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('NewVoiceModal — VoiceDropzone wired (WIRE-1)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        global.URL.createObjectURL = vi.fn(() => 'mock-object-url');
        // Default: 8-second file (within 3–15s range — should be valid)
        global.Audio = vi.fn().mockImplementation(function (this: any) {
            this.duration = 8;
            setTimeout(() => {
                if (this.onloadedmetadata) this.onloadedmetadata();
            }, 5);
            return this;
        }) as any;
        global.alert = vi.fn();
    });

    it('renders VoiceDropzone inside the modal when onSampleFilesChange is provided', () => {
        render(
            <NewVoiceModal
                isOpen={true}
                onClose={vi.fn()}
                value="My Voice"
                onChange={vi.fn()}
                engine="xtts"
                onEngineChange={vi.fn()}
                engines={[{ engine_id: 'xtts', display_name: 'XTTS', enabled: true, status: 'ready' } as any]}
                onSubmit={vi.fn()}
                isCreating={false}
                sampleFiles={[]}
                onSampleFilesChange={vi.fn()}
            />
        );
        expect(screen.getByText(/Drop audio samples here/i)).toBeInTheDocument();
    });

    it('does not render VoiceDropzone when onSampleFilesChange is omitted', () => {
        render(
            <NewVoiceModal
                isOpen={true}
                onClose={vi.fn()}
                value="My Voice"
                onChange={vi.fn()}
                engine="xtts"
                onEngineChange={vi.fn()}
                engines={[]}
                onSubmit={vi.fn()}
                isCreating={false}
            />
        );
        expect(screen.queryByText(/Drop audio samples here/i)).not.toBeInTheDocument();
    });

    it('calls onSampleFilesChange when a valid audio file is added', async () => {
        const onSampleFilesChange = vi.fn();
        const { container } = render(
            <NewVoiceModal
                isOpen={true}
                onClose={vi.fn()}
                value="My Voice"
                onChange={vi.fn()}
                engine="xtts"
                onEngineChange={vi.fn()}
                engines={[{ engine_id: 'xtts', display_name: 'XTTS', enabled: true, status: 'ready' } as any]}
                onSubmit={vi.fn()}
                isCreating={false}
                sampleFiles={[]}
                onSampleFilesChange={onSampleFilesChange}
            />
        );

        const file = new File(['audio'], 'good-sample.wav', { type: 'audio/wav' });
        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [file] } });

        await waitFor(() => {
            expect(onSampleFilesChange).toHaveBeenCalledWith([file]);
        });
    });

    it('shows a warning indicator for a file shorter than 3 seconds', async () => {
        (global.Audio as any).mockImplementation(function (this: any) {
            this.duration = 1.5; // too short
            setTimeout(() => {
                if (this.onloadedmetadata) this.onloadedmetadata();
            }, 5);
            return this;
        });

        const { container } = render(
            <NewVoiceModal
                isOpen={true}
                onClose={vi.fn()}
                value="My Voice"
                onChange={vi.fn()}
                engine="xtts"
                onEngineChange={vi.fn()}
                engines={[]}
                onSubmit={vi.fn()}
                isCreating={false}
                sampleFiles={[]}
                onSampleFilesChange={vi.fn()}
            />
        );

        const file = new File(['audio'], 'short.wav', { type: 'audio/wav' });
        const input = container.querySelector('input[type="file"]') as HTMLInputElement;
        fireEvent.change(input, { target: { files: [file] } });

        // VoiceDropzone sets status='warning' and renders an AlertCircle with title
        await waitFor(() => {
            expect(screen.getByTitle(/Too short/i)).toBeInTheDocument();
        });
    });
});
