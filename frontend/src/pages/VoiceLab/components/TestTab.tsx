/**
 * TestTab.tsx — task 005 (voice-card-consolidation, P5)
 *
 * Composes the relocated `TestSection` (variant/reference-sample pickers, generate test,
 * progress, preview playback) with `ScriptEditor`'s test-text editing UI (variant name, engine,
 * reference sample/asset id, preview text script incl. the "Suggest from voice qualities" button,
 * reset, save) folded in directly below it — no more separate drawer. The two share the same
 * "active profile" (the variant currently selected in TestSection's "Variant" dropdown), reported
 * up via `TestSection`'s new `onActiveProfileChange` callback.
 *
 * Save/reset here mirror `useVoicesTabActions.ts`'s `handleSaveTestText`/`handleResetTestText`
 * exactly (same endpoints, same rename-on-variant-name-change behavior) — VoiceLabPage doesn't
 * share that hook (it's scoped to the legacy `VoicesPage` catalog tab), so the same logic is
 * reproduced here against the same REST endpoints rather than reused directly.
 */
import React, { useEffect, useState } from 'react';
import type { Job, SpeakerProfile, TtsEngine, VoiceAttributes, VoiceEngine } from '@/types';
import { getVariantDisplayName, isDefaultVoiceProfile } from '@/utils/voiceProfiles';
import { TestSection } from '@/pages/VoiceLab/components/TestSection';
import { ScriptEditor } from '@/pages/Voices/components/ScriptEditor';

export interface TestTabProps {
    profiles: SpeakerProfile[];
    engines: TtsEngine[];
    testProgress: Record<string, { progress: number; started_at?: number }>;
    jobs: Record<string, Job>;
    onTest: (name: string) => Promise<void>;
    onRefresh: () => void;
    /** Voice name — used to compose the new full profile name on a non-default variant rename. */
    voiceName: string;
    /** Tagged attributes for the voice — drives the "Suggest from voice qualities" button. */
    attributes?: VoiceAttributes;
    /** Preselects this variant when the Test tab is reached via Script from the Variants tab's
     * switcher (task 013). Falls back to the default-variant behavior if unset or not found. */
    preselectedVariantName?: string | null;
}

export const TestTab: React.FC<TestTabProps> = ({
    profiles,
    engines,
    testProgress,
    jobs,
    onTest,
    onRefresh,
    voiceName,
    attributes,
    preselectedVariantName,
}) => {
    const defaultProfile =
        (preselectedVariantName && profiles.find(p => p.name === preselectedVariantName)) ||
        profiles.find(p => p.is_default) ||
        profiles[0];
    const [activeProfile, setActiveProfile] = useState<SpeakerProfile | undefined>(defaultProfile);

    const [variantName, setVariantName] = useState(getVariantDisplayName(defaultProfile));
    const [editingEngine, setEditingEngine] = useState<VoiceEngine>((defaultProfile?.engine as VoiceEngine) ?? '');
    const [testText, setTestText] = useState(defaultProfile?.test_text ?? '');
    const [referenceSample, setReferenceSample] = useState(defaultProfile?.reference_sample ?? '');
    const [engineVoiceId, setEngineVoiceId] = useState(defaultProfile?.voice_asset_id ?? '');
    const [editingSettings, setEditingSettings] = useState<Record<string, any>>(defaultProfile?.settings ?? {});
    const [isSaving, setIsSaving] = useState(false);

    // Keep the folded-in editor fields synced to whichever variant TestSection has selected.
    useEffect(() => {
        setVariantName(getVariantDisplayName(activeProfile));
        setEditingEngine((activeProfile?.engine as VoiceEngine) ?? '');
        setTestText(activeProfile?.test_text ?? '');
        setReferenceSample(activeProfile?.reference_sample ?? '');
        setEngineVoiceId(activeProfile?.voice_asset_id ?? '');
        setEditingSettings(activeProfile?.settings ?? {});
    }, [activeProfile?.name]);

    const handleSave = async () => {
        if (!activeProfile) return;
        setIsSaving(true);
        try {
            const settingsToUpdate: Record<string, any> = {
                test_text: testText,
                engine: editingEngine,
            };

            const activeEngine = engines.find(e => e.engine_id === editingEngine);
            if (activeEngine?.cloud || activeEngine?.capabilities?.includes('voice_asset_id')) {
                settingsToUpdate.reference_sample = referenceSample || null;
                settingsToUpdate.voice_asset_id = engineVoiceId;
            }

            const allowedPluginSettings = new Set(activeEngine?.behavior?.synthesis_settings || []);
            const pluginSettings = Object.fromEntries(
                Object.entries(editingSettings || {}).filter(([key]) => allowedPluginSettings.has(key))
            );
            Object.assign(settingsToUpdate, pluginSettings);

            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(activeProfile.name)}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settingsToUpdate),
            });

            if (resp.ok) {
                const currentVariantDisplay = getVariantDisplayName(activeProfile);
                if (variantName && variantName !== currentVariantDisplay) {
                    if (isDefaultVoiceProfile(activeProfile)) {
                        const variantForm = new URLSearchParams();
                        variantForm.append('variant_name', variantName);
                        await fetch(`/api/speaker-profiles/${encodeURIComponent(activeProfile.name)}/variant-name`, {
                            method: 'POST',
                            body: variantForm,
                        });
                    } else {
                        const newFullName = (variantName === 'Default' || variantName === voiceName)
                            ? voiceName
                            : `${voiceName} - ${variantName}`;
                        const renameForm = new URLSearchParams();
                        renameForm.append('new_name', newFullName);
                        await fetch(`/api/speaker-profiles/${encodeURIComponent(activeProfile.name)}/rename`, {
                            method: 'POST',
                            body: renameForm,
                        });
                    }
                }
                onRefresh();
            }
        } catch (e) {
            console.error('Failed to save profile', e);
        } finally {
            setIsSaving(false);
        }
    };

    const handleResetTestText = async () => {
        if (!activeProfile) return;
        setIsSaving(true);
        try {
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(activeProfile.name)}/reset-test-text`, {
                method: 'POST',
            });
            const result = await resp.json();
            if (result.status === 'ok' || result.status === 'success') {
                setTestText(result.test_text);
                onRefresh();
            }
        } catch (e) {
            console.error('Failed to reset test text', e);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="test-tab">
            <TestSection
                profiles={profiles}
                engines={engines}
                testProgress={testProgress}
                jobs={jobs}
                onTest={onTest}
                onRefresh={onRefresh}
                onActiveProfileChange={setActiveProfile}
                preselectedVariantName={preselectedVariantName}
            />

            {activeProfile && (
                <ScriptEditor
                    variantName={variantName}
                    onVariantNameChange={setVariantName}
                    engine={editingEngine}
                    onEngineChange={setEditingEngine}
                    engines={engines}
                    testText={testText}
                    onTestTextChange={setTestText}
                    referenceSample={referenceSample}
                    onReferenceSampleChange={setReferenceSample}
                    availableSamples={activeProfile.samples || []}
                    engineVoiceId={engineVoiceId}
                    onEngineVoiceIdChange={setEngineVoiceId}
                    onResetTestText={handleResetTestText}
                    onSave={handleSave}
                    isSaving={isSaving}
                    attributes={attributes}
                />
            )}
        </div>
    );
};
