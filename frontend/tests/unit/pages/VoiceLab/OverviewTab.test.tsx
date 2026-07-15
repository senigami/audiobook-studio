/**
 * OverviewTab.test.tsx
 *
 * Regression-prevention test for DC-013: the icon-only "copy icon prompt"
 * button must be mounted in the Overview tab's render tree. This feature
 * was built once (VoiceIconControls.tsx) then silently unmounted during a
 * tab-consolidation rework -- this test exists so a future rework can't
 * orphan it again without a failing test.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { OverviewTab } from '@/pages/VoiceLab/components/OverviewTab';
import type { VoiceMetadata } from '@/types';

vi.mock('@/api', () => ({
    api: {
        patchVoiceMetadata: vi.fn(),
    },
}));

const mockVoice: VoiceMetadata = {
    id: 'voice-abc',
    name: 'Aria Nova',
    description: 'A calm narrator.',
    attributes: { class: 'human', gender: 'female', age: 'adult' },
    tags: [],
    is_untagged: false,
};

describe('OverviewTab', () => {
    it('mounts the icon-only copy-icon-prompt button beside the icon upload control', () => {
        render(<OverviewTab voice={mockVoice} onSaved={vi.fn()} />);

        expect(
            screen.getByRole('button', { name: 'Copy icon generation prompt' })
        ).toBeInTheDocument();
    });
});
