/**
 * SamplesSection.tsx — R5-T6
 * Wraps SampleManager for the Voice Lab page.
 */
import React, { useState } from 'react';
import type { SpeakerProfile } from '@/types';
import { SampleManager } from '@/pages/Voices/components/SampleManager';
import { useVariantActions } from '@/hooks/useVariantActions';

export interface SamplesSectionProps {
    profiles: SpeakerProfile[];
    onRefresh: () => void;
}

export const SamplesSection: React.FC<SamplesSectionProps> = ({ profiles, onRefresh }) => {
    const [isSamplesExpanded, setIsSamplesExpanded] = useState(true);
    // Use the first/default profile for the lab samples view
    const profile = profiles[0];

    const { playingSample, handlePlaySample, handleDeleteSample, uploadFiles } =
        useVariantActions(profile, onRefresh, async () => undefined, () => undefined);

    if (!profile) {
        return (
            <div className="voice-lab-section">
                <div className="voice-lab-section__header">
                    <span className="voice-lab-section-label">Samples</span>
                </div>
                <div className="voice-lab-section__body" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    No profile found. Create a variant first.
                </div>
            </div>
        );
    }

    return (
        <div className="voice-lab-section">
            <div className="voice-lab-section__header">
                <span className="voice-lab-section-label">Samples</span>
            </div>
            <div className="voice-lab-section__body">
                <SampleManager
                    profile={profile}
                    title={profile.engine?.includes('cloud') ? 'Reference Samples' : 'Samples'}
                    isSamplesExpanded={isSamplesExpanded}
                    setIsSamplesExpanded={setIsSamplesExpanded}
                    isRebuildRequired={profile.is_rebuild_required ?? false}
                    uploadFiles={uploadFiles}
                    playingSample={playingSample}
                    handlePlaySample={handlePlaySample}
                    handleDeleteSample={handleDeleteSample}
                />
            </div>
        </div>
    );
};
