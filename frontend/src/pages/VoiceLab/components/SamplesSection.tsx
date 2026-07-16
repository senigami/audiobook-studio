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

// useVariantActions reads several profile fields unconditionally
// (preview_url, asset_base_url, name, speed, variant_name) with no null
// guard. On a cold full-page load at /voices/:id, `profiles` is genuinely
// empty for one render (initialData's speaker_profiles fetch hasn't
// resolved yet) -- profiles[0] is undefined, and calling the hook with it
// crashed the whole page (confirmed: reproduces on a hard navigate/reload,
// never on in-app client-side routing where the data is already cached).
// Hooks can't be called conditionally, so this stable placeholder is
// passed in that transient window instead of `undefined`.
const EMPTY_PROFILE: SpeakerProfile = {
    name: '',
    wav_count: 0,
    speed: 1,
    is_default: false,
    speaker_id: null,
    variant_name: null,
    preview_url: null,
};

export const SamplesSection: React.FC<SamplesSectionProps> = ({ profiles, onRefresh }) => {
    const [isSamplesExpanded, setIsSamplesExpanded] = useState(true);
    // Use the first/default profile for the lab samples view
    const profile = profiles[0];

    const { playingSample, handlePlaySample, handleDeleteSample, uploadFiles } =
        useVariantActions(profile ?? EMPTY_PROFILE, onRefresh, async () => undefined, () => undefined);

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
