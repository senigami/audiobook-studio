/**
 * SampleManager.test.tsx
 *
 * Regression test: sample rows showed a redundant "WAV" format pill next to
 * a filename that already carries the .wav extension (e.g. "take1.wav  WAV").
 * The pill adds no information the filename doesn't already convey.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SampleManager } from '@/pages/Voices/components/SampleManager';
import type { SpeakerProfile } from '@/types';

const profile: SpeakerProfile = {
    name: 'Aria - Default',
    wav_count: 1,
    speed: 1,
    is_default: true,
    speaker_id: 'sp-1',
    variant_name: 'Default',
    preview_url: null,
    samples_detailed: [{ name: 'take1.wav', is_new: false }],
} as SpeakerProfile;

describe('SampleManager', () => {
    const baseProps = {
        isSamplesExpanded: true,
        setIsSamplesExpanded: vi.fn(),
        isRebuildRequired: false,
        uploadFiles: vi.fn(),
        playingSample: null,
        handlePlaySample: vi.fn(),
        handleDeleteSample: vi.fn(),
    };

    it('shows the filename with its .wav extension', () => {
        render(<SampleManager {...baseProps} profile={profile} />);
        expect(screen.getByText('take1.wav')).toBeInTheDocument();
    });

    it('does not show a redundant "WAV" format label next to the filename', () => {
        render(<SampleManager {...baseProps} profile={profile} />);
        expect(screen.queryByText('WAV')).not.toBeInTheDocument();
    });
});
