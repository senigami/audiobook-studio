/**
 * SamplesTab.tsx — task 003 (voice-card-consolidation, P3)
 *
 * Thin composition wrapper relocating the existing SamplesSection/
 * SampleManager upload UI into the Samples tabpanel. Pure relocation, no
 * new capability — props/wiring are unchanged from the prior direct
 * `<SamplesSection ... />` call site in VoiceLabPage.tsx.
 */
import React from 'react';
import { SamplesSection, type SamplesSectionProps } from '@/pages/VoiceLab/components/SamplesSection';

export const SamplesTab: React.FC<SamplesSectionProps> = (props) => {
    return (
        <div className="samples-tab">
            {/* Task 007 will add a mode toggle (Upload | Record) here later —
                leave a clear insertion point above the existing upload UI. */}
            <SamplesSection {...props} />
        </div>
    );
};
