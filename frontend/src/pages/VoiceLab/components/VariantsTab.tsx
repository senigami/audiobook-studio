/**
 * VariantsTab.tsx — task 004 (voice-card-consolidation, P4)
 *
 * Composes `VariantsSection` (per-variant rebuild/move/delete controls) with
 * `VoiceSettingsPanel` promoted directly into this tab, so per-render Voice
 * Settings are one click away instead of item 5 of 8 in the old card's
 * overflow menu (this session's Power-User persona finding).
 *
 * R3 fix: the pre-task-001 `VoiceLabPage.tsx` call site passed stub props to
 * `VariantsSection` (`buildingProfiles={{}}`, `onBuildNow={async () => false}`,
 * `requestConfirm={() => undefined}`) -- confirmed a live bug (see task 004's
 * completion report / changelog-queue entry). This tab's call site wires the
 * real `useVoiceManagement` building/build/confirm plumbing instead of
 * carrying the stub forward.
 *
 * Voice Settings target: per-voice plugin settings are stored per variant
 * profile (`SpeakerProfile.settings`), not per voice-group, but this tab's
 * target shape (task doc) shows a single settings panel, not a per-variant
 * picker. Smallest-reasonable-call judgment (flagged in the completion
 * report): the panel edits the *default* variant's settings, matching the
 * "default profile represents the voice" convention already used elsewhere
 * (`NarratorCard.tsx`'s `activeProfileId` default, `getVoicePhase`).
 *
 * `onEditTestText` (task 005): `VariantsSection`/`VariantEditor`'s "Script" button now switches
 * `VoiceLabPage` to the Test tab (via this prop) instead of opening the retired `ScriptEditor`
 * drawer -- see `VoiceLabPage.tsx`'s `onEditTestText={() => setActiveTabId('test')}` wiring.
 */
import React from 'react';
import type { SpeakerProfile } from '@/types';
import { VariantsSection, type VariantsSectionProps } from '@/pages/VoiceLab/components/VariantsSection';
import { VoiceSettingsPanel } from '@/pages/Voices/components/VoiceSettingsPanel';
import { getVoiceProfileEngine } from '@/utils/voiceProfiles';

export interface VariantsTabProps extends VariantsSectionProps {
    /** The variant whose settings this tab's promoted Voice Settings panel edits (default profile). */
    settingsProfile: SpeakerProfile | null;
    settings: Record<string, any>;
    onSettingsChange: (val: Record<string, any>) => void;
    isSavingSettings: boolean;
    onSaveSettings: () => void;
}

export const VariantsTab: React.FC<VariantsTabProps> = ({
    settingsProfile,
    settings,
    onSettingsChange,
    isSavingSettings,
    onSaveSettings,
    ...variantsSectionProps
}) => {
    const engine = getVoiceProfileEngine(settingsProfile) || '';

    return (
        <div className="variants-tab">
            <VariantsSection
                {...variantsSectionProps}
            />

            {settingsProfile && (
                <div className="variants-tab__settings">
                    <div className="voice-lab-section__header">
                        <span className="voice-lab-section-label">Voice Settings</span>
                    </div>
                    <VoiceSettingsPanel
                        engine={engine}
                        engines={variantsSectionProps.engines}
                        settings={settings}
                        onSettingsChange={onSettingsChange}
                        isSaving={isSavingSettings}
                        onSave={onSaveSettings}
                    />
                </div>
            )}
        </div>
    );
};
