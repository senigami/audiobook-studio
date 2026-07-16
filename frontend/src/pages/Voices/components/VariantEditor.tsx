import React, { useState, useEffect, useRef } from 'react';
import type { SpeakerProfile, TtsEngine, VoiceAttributes, VoiceEngine } from '@/types';
import {
    Trash2, Play, Loader2, RefreshCw, FileEdit,
    Pause, Sliders, MoreVertical, ArrowRightLeft, Mic
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { SpeedPopover } from '@/pages/Voices/components/VoiceUtils';
import { useVariantActions } from '@/hooks/useVariantActions';
import { SampleManager } from '@/pages/Voices/components/SampleManager';
import { VersionHistoryPanel } from '@/pages/Voices/components/VersionHistoryPanel';
import { ScriptEditor } from '@/pages/Voices/components/ScriptEditor';
import { VoiceSettingsPanel } from '@/pages/Voices/components/VoiceSettingsPanel';
import { formatVoiceEngineLabel, getVariantDisplayName, getVoiceProfileEngine, isDefaultVoiceProfile } from '@/utils/voiceProfiles';
import { TagAutocompleteInput } from '@/pages/Voices/components/metadata/TagAutocompleteInput';
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu';
import { EngineBadge } from '@/components/ui/EngineBadge';
import { ArchetypePicker, type ArchetypeAttrs } from '@/pages/VoiceLab/components/record/ArchetypePicker';
import { RecordingCueCard } from '@/pages/VoiceLab/components/record/RecordingCueCard';
import { TakeManager } from '@/pages/VoiceLab/components/record/TakeManager';
import { PhaseStepper } from '@/pages/VoiceLab/components/PhaseStepper';
import { getVoicePhase } from '@/pages/Voices/voicePhase';

const PERFORMANCE_TAG_STARTER_VOCABULARY = ['happy', 'sad', 'angry', 'calm', 'slow', 'fast', 'measured'];
const EMPTY_ARCHETYPE_ATTRS: ArchetypeAttrs = {};

interface VariantEditorProps {
    profile: SpeakerProfile;
    isTesting: boolean;
    testStatus?: any;
    onTest: (name: string) => void;
    onDeleteVariant: (name: string) => void;
    onMoveVariant: (profile: SpeakerProfile) => void;
    onRefresh: () => void;
    onBuildNow: (name: string, files: File[], speakerId?: string, variantName?: string) => Promise<boolean>;
    requestConfirm: (config: { title: string; message: string; onConfirm: () => void; isDestructive?: boolean; isAlert?: boolean }) => void;
    voiceName: string;
    showControlsInline?: boolean;
    buildingProfiles: Record<string, boolean>;
    engines?: TtsEngine[];
    /** Tags already used by this voice's other variants, for the suggestions
     *  dropdown — aggregated + deduplicated by the caller (VariantsSection). */
    tagSuggestions?: string[];
    /** Tagged attributes for the voice this variant belongs to — drives the
     * Script panel's "Suggest from voice qualities" test-text seeding (F1.4),
     * ported in from the retired TestTab/ScriptEditor composition (task 009). */
    attributes?: VoiceAttributes;
}

export const VariantEditor: React.FC<VariantEditorProps> = ({
    profile, isTesting, onTest, onDeleteVariant, onMoveVariant, onRefresh,
    onBuildNow, requestConfirm, testStatus,
    voiceName, showControlsInline = false, buildingProfiles, engines = [],
    tagSuggestions = [], attributes
}) => {
    const engine = getVoiceProfileEngine(profile) || 'unknown';
    const activeEngine = engines.find(e => e.engine_id === engine);
    const engineUsable = engines.length === 0 ? true : Boolean(activeEngine?.enabled && activeEngine?.status === 'ready');
    const isRebuildEngine = activeEngine?.capabilities?.includes('voice_build');
    const isCloudEngine = activeEngine?.cloud === true;

    const hasBuildMaterial = Boolean(
        profile.has_latent ||
        profile.voice_asset_id ||
        profile.reference_sample ||
        (profile.wav_count > 0) ||
        (profile.samples?.length || 0) > 0
    );

    const canGeneratePreview = hasBuildMaterial && engineUsable;
    const canPreviewOrGenerate = !!profile.preview_url || canGeneratePreview;

    const {
        localSpeed,
        setLocalSpeed,
        isPlaying,
        playingSample,
        setCacheBuster,
        handlePlayClick,
        handleGeneratePreview,
        handlePlaySample,
        handleSpeedChange,
        handleDeleteSample,
        uploadFiles
    } = useVariantActions(profile, onRefresh, onTest, requestConfirm);

    const isBuilding = buildingProfiles[profile.name];
    const speedPillRef = useRef<HTMLButtonElement>(null);
    const speed = localSpeed ?? profile.speed;
    const playIconColor = isPlaying ? 'var(--surface)' : 'var(--text-primary)';
    const shouldReduceMotion = useReducedMotion();
    const engineBadgeLabel = activeEngine?.display_name || formatVoiceEngineLabel(engine);

    useEffect(() => {
        if (profile.preview_url) {
            setCacheBuster(Date.now());
        }
    }, [profile.preview_url, isTesting, setCacheBuster]);

    const handleRebuild = async () => {
        try {
            await onBuildNow(profile.name, [], profile.speaker_id || undefined, profile.variant_name || undefined);
        } catch (err) {
            console.error('Failed to rebuild', err);
        }
    };

    const handleSaveTags = async (newTags: string[]) => {
        try {
            await fetch(`/api/speaker-profiles/${encodeURIComponent(profile.name)}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ performance_tags: newTags }),
            });
        } catch (err) {
            console.error('Failed to save performance tags', err);
        }
        onRefresh();
    };

    const combinedTagSuggestions = Array.from(new Set([...tagSuggestions, ...PERFORMANCE_TAG_STARTER_VOCABULARY]));

    const [showSpeedPopover, setShowSpeedPopover] = useState(false);
    const [isSamplesExpanded, setIsSamplesExpanded] = useState(profile.wav_count === 0 || profile.samples?.length === 0);
    const [isRebuildRequired, setIsRebuildRequired] = useState(profile.is_rebuild_required || false);

    useEffect(() => {
        setIsRebuildRequired(profile.is_rebuild_required || false);
    }, [profile.is_rebuild_required, profile.name]);

    useEffect(() => {
        if (profile.wav_count === 0) {
            setIsSamplesExpanded(true);
        }
    }, [profile.wav_count, profile.name]);

    // Script/engine-config panel (task 009): absorbs TestTab's folded-in
    // `ScriptEditor` (test-text, reference sample, engine, engineVoiceId) and
    // VariantsTab's promoted `VoiceSettingsPanel` (per-engine synthesis
    // settings), both scoped to THIS variant instead of a shared/default
    // profile. "Script" in the ActionMenu below now toggles this inline panel
    // in place -- there's no separate tab to switch to (task 008).
    const [isScriptExpanded, setIsScriptExpanded] = useState(false);
    const [variantName, setVariantName] = useState(getVariantDisplayName(profile));
    const [editingEngine, setEditingEngine] = useState<VoiceEngine>((profile.engine as VoiceEngine) ?? '');
    const [testText, setTestText] = useState(profile.test_text ?? '');
    const [referenceSample, setReferenceSample] = useState(profile.reference_sample ?? '');
    const [engineVoiceId, setEngineVoiceId] = useState(profile.voice_asset_id ?? '');
    const [editingSettings, setEditingSettings] = useState<Record<string, any>>(profile.settings ?? {});
    const [isSavingScript, setIsSavingScript] = useState(false);
    const [isSavingSettings, setIsSavingSettings] = useState(false);

    // No profile.name-keyed resync effect here (unlike TestTab's original
    // activeProfile-keyed effect): both call sites (`VariantsSection`,
    // `NarratorCard`) already mount `VariantEditor` with `key={profile.name}`,
    // so switching variants remounts a fresh instance with correct initial
    // state instead of updating props in place -- an extra sync effect would
    // only add a redundant post-mount re-render.

    const handleSaveScript = async () => {
        setIsSavingScript(true);
        try {
            const settingsToUpdate: Record<string, any> = {
                test_text: testText,
                engine: editingEngine,
            };
            const activeScriptEngine = engines.find(e => e.engine_id === editingEngine);
            if (activeScriptEngine?.cloud || activeScriptEngine?.capabilities?.includes('voice_asset_id')) {
                settingsToUpdate.reference_sample = referenceSample || null;
                settingsToUpdate.voice_asset_id = engineVoiceId;
            }
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(profile.name)}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settingsToUpdate),
            });
            if (resp.ok) {
                // Variant renaming (INV-VC-2): reproduce the retired TestTab's
                // rename-on-variant-name-change behavior. The default variant
                // has no " - <variant>" suffix, so its label is stored via the
                // /variant-name setting; a non-default variant's label lives in
                // the profile name itself, so renaming it is a folder rename.
                const currentVariantDisplay = getVariantDisplayName(profile);
                const trimmedVariantName = variantName.trim();
                if (trimmedVariantName && trimmedVariantName !== currentVariantDisplay) {
                    if (isDefaultVoiceProfile(profile)) {
                        const variantForm = new URLSearchParams();
                        variantForm.append('variant_name', trimmedVariantName);
                        await fetch(`/api/speaker-profiles/${encodeURIComponent(profile.name)}/variant-name`, {
                            method: 'POST',
                            body: variantForm,
                        });
                    } else {
                        const newFullName = (trimmedVariantName === 'Default' || trimmedVariantName === voiceName)
                            ? voiceName
                            : `${voiceName} - ${trimmedVariantName}`;
                        const renameForm = new URLSearchParams();
                        renameForm.append('new_name', newFullName);
                        await fetch(`/api/speaker-profiles/${encodeURIComponent(profile.name)}/rename`, {
                            method: 'POST',
                            body: renameForm,
                        });
                    }
                }
                onRefresh();
            }
        } catch (err) {
            console.error('Failed to save script/engine settings', err);
        } finally {
            setIsSavingScript(false);
        }
    };

    const handleResetTestText = async () => {
        setIsSavingScript(true);
        try {
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(profile.name)}/reset-test-text`, {
                method: 'POST',
            });
            const result = await resp.json();
            if (result.status === 'ok' || result.status === 'success') {
                setTestText(result.test_text);
                onRefresh();
            }
        } catch (err) {
            console.error('Failed to reset test text', err);
        } finally {
            setIsSavingScript(false);
        }
    };

    const handleSaveSettings = async () => {
        setIsSavingSettings(true);
        try {
            const activeSettingsEngine = engines.find(e => e.engine_id === editingEngine);
            const allowedPluginSettings = new Set(activeSettingsEngine?.behavior?.synthesis_settings || []);
            const settingsToUpdate = Object.fromEntries(
                Object.entries(editingSettings || {}).filter(([key]) => allowedPluginSettings.has(key))
            );
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(profile.name)}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settingsToUpdate),
            });
            if (resp.ok) onRefresh();
        } catch (err) {
            console.error('Failed to save voice settings', err);
        } finally {
            setIsSavingSettings(false);
        }
    };

    // Record-mode sample capture (task 009): migrated from the now-dead
    // `SamplesTab.tsx`, which hardcoded `profiles[0]` for its capture sink --
    // here it's scoped to THIS variant's own `uploadFiles` (already the
    // correct per-profile sink `SampleManager` above uses).
    const [isRecordModeOpen, setIsRecordModeOpen] = useState(false);
    const [archetypeAttrs, setArchetypeAttrs] = useState<ArchetypeAttrs>(EMPTY_ARCHETYPE_ATTRS);
    const [recordSkipped, setRecordSkipped] = useState(false);
    const recordModeRef = useRef<HTMLDivElement>(null);

    // Space toggles start/stop from anywhere within the record-mode container
    // (mirrors the retired SamplesTab's own handler), ignored when focus is on
    // a form control that needs Space for its own purpose.
    const handleRecordModeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.code !== 'Space') return;
        const target = event.target as HTMLElement;
        if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
        const toggleBtn = recordModeRef.current?.querySelector<HTMLButtonElement>('[data-record-toggle-btn]');
        if (!toggleBtn) return;
        event.preventDefault();
        toggleBtn.click();
    };

    // Chrome demotion (task 009): Script, Move, Delete, and Rebuild/Regenerate
    // all consolidate into a single ActionMenu overflow. Rebuild/Regenerate is
    // still gated by the same enabled/disabled logic as before (hasBuildMaterial
    // + engineUsable + not mid-build/test) — it stays available whenever the
    // user could meaningfully trigger it, not only when isRebuildRequired.
    const rebuildOrGenerateItem: ActionMenuItem = isCloudEngine ? {
        label: isTesting ? 'Regenerating...' : (profile.preview_url ? 'Regenerate' : 'Generate'),
        icon: RefreshCw,
        onClick: handleGeneratePreview,
        disabled: !canGeneratePreview || isTesting,
    } : {
        label: isBuilding ? 'Rebuilding...' : (isTesting ? 'Generating...' : 'Rebuild'),
        icon: RefreshCw,
        onClick: handleRebuild,
        disabled: !hasBuildMaterial || !engineUsable || isBuilding || isTesting,
    };

    const actionMenuItems: ActionMenuItem[] = [
        {
            label: 'Script',
            icon: FileEdit,
            onClick: () => setIsScriptExpanded(v => !v),
        },
        {
            label: 'Record samples',
            icon: Mic,
            onClick: () => setIsRecordModeOpen(v => !v),
        },
        rebuildOrGenerateItem,
        { isDivider: true },
        {
            label: 'Move Variant',
            icon: ArrowRightLeft,
            onClick: () => onMoveVariant(profile),
        },
        {
            label: 'Delete Variant',
            icon: Trash2,
            isDestructive: true,
            onClick: () => {
                requestConfirm({
                    title: 'Delete variant?',
                    message: `Delete variant '${profile.variant_name || 'Default'}' from '${voiceName}'? This cannot be undone.`,
                    isDestructive: true,
                    onConfirm: () => onDeleteVariant(profile.name)
                });
            },
        },
    ];

    const renderControls = () => (
        <div className="variant-editor__controls-body">
            {/* User-reported (2026-07-16): the Samples/Build/Test/Ready progress
                was a single voice-level stepper (VoiceLabPage.tsx/PhaseStepper),
                computed once from whichever profile happened to resolve as
                "the" active one -- not this specific variant's own status. It's
                per-variant, matching the rebuild banner below which already is.
                getVoicePhase accepts an array and resolves is_default/first --
                passing an array of just this one profile makes it resolve to
                this profile specifically. */}
            <PhaseStepper phase={getVoicePhase([profile], engines, buildingProfiles)} />

            {isRebuildRequired && profile.rebuild_reasons && profile.rebuild_reasons.length > 0 && (
                <div className="variant-editor__rebuild-banner">
                    <div className="variant-editor__rebuild-icon">
                        <RefreshCw size={14} className={isBuilding ? "animate-spin" : ""} />
                    </div>
                    <div className="variant-editor__rebuild-copy">
                        <span className="variant-editor__rebuild-title">
                            Rebuild Recommended
                        </span>
                        <span className="variant-editor__rebuild-desc">
                            {profile.rebuild_reasons.map(r => r.replace('_', ' ').charAt(0).toUpperCase() + r.replace('_', ' ').slice(1)).join(', ')}
                        </span>
                    </div>
                </div>
            )}
            <SampleManager
                profile={profile}
                title={isCloudEngine ? 'Reference Samples' : 'Samples'}
                isSamplesExpanded={isSamplesExpanded}
                setIsSamplesExpanded={setIsSamplesExpanded}
                isRebuildRequired={isRebuildRequired}
                uploadFiles={uploadFiles}
                playingSample={playingSample}
                handlePlaySample={handlePlaySample}
                handleDeleteSample={handleDeleteSample}
            />

            {isRecordModeOpen && (
                <div
                    className="variant-editor__record-mode"
                    ref={recordModeRef}
                    onKeyDown={handleRecordModeKeyDown}
                >
                    {!recordSkipped && (
                        <ArchetypePicker
                            value={archetypeAttrs}
                            onChange={setArchetypeAttrs}
                            onSkip={() => setRecordSkipped(true)}
                        />
                    )}
                    <RecordingCueCard attrs={recordSkipped ? {} : archetypeAttrs} />
                    <TakeManager onFinalize={uploadFiles} />
                </div>
            )}

            {isScriptExpanded && (
                <div className="variant-editor__script-panel">
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
                        availableSamples={profile.samples || []}
                        engineVoiceId={engineVoiceId}
                        onEngineVoiceIdChange={setEngineVoiceId}
                        onResetTestText={handleResetTestText}
                        onSave={handleSaveScript}
                        isSaving={isSavingScript}
                        attributes={attributes}
                    />
                    <div>
                        <div className="voice-lab-section__header">
                            <span className="voice-lab-section-label">Voice Settings</span>
                        </div>
                        <VoiceSettingsPanel
                            engine={editingEngine}
                            engines={engines}
                            settings={editingSettings}
                            onSettingsChange={setEditingSettings}
                            isSaving={isSavingSettings}
                            onSave={handleSaveSettings}
                        />
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className={showControlsInline ? "" : "glass-panel animate-in variant-editor__shell"}>
            <div className="variant-editor__header">
                <div className="variant-editor__controls-row">
                    {/* Variant name — rows are otherwise indistinguishable
                        (play/speed/engine badge/Script/Rebuild are identical
                        across every variant of the same voice). */}
                    <span className="variant-editor__variant-label">{getVariantDisplayName(profile)}</span>

                    <div className="variant-editor__play-btn-wrap">
                        <button
                            onClick={handlePlayClick}
                        className="btn-ghost hover-bg-subtle variant-editor__play-btn"
                        disabled={!canPreviewOrGenerate || isTesting}
                        title={!profile.preview_url && !engineUsable
                            ? `Engine ${activeEngine?.display_name || formatVoiceEngineLabel(engine)} is disabled or unavailable.`
                            : !hasBuildMaterial
                                ? 'Add at least one sample or keep a latent before generating a preview'
                                : profile.preview_url
                                    ? (isPlaying ? "Pause Sample" : "Play Sample")
                                    : "Generate Sample"}
                            style={{
                                background: isPlaying ? 'var(--accent)' : 'var(--surface)',
                                color: playIconColor,
                                border: isPlaying ? '1px solid var(--accent)' : '1px solid var(--border)',
                                boxShadow: isPlaying ? '0 0 0 3px var(--accent-glow)' : 'var(--shadow-sm)'
                            }}
                        >
                            {isTesting ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : isPlaying ? (
                                <Pause size={18} fill="currentColor" className="variant-editor__play-icon" />
                            ) : (
                                <Play size={18} fill="currentColor" className="variant-editor__play-icon" />
                            )}
                            {isPlaying && (
                                <motion.div
                                    layoutId="playing-pulse"
                                    className="variant-editor__play-pulse"
                                    style={{ border: `2px solid ${playIconColor}` }}
                                    animate={shouldReduceMotion ? {} : { scale: [1, 1.2, 1], opacity: [0.3, 0, 0.3] }}
                                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 2, repeat: Infinity }}
                                />
                            )}
                        </button>
                    </div>

                    <div className="variant-editor__divider" />

                    {!isCloudEngine && (
                        <>
                            <button
                                ref={speedPillRef}
                                onClick={() => setShowSpeedPopover(!showSpeedPopover)}
                                className="btn-ghost hover-bg-subtle variant-editor__speed-btn"
                            >
                                <Sliders size={12} className="variant-editor__speed-icon" />
                                {speed.toFixed(2)}x
                            </button>

                            {showSpeedPopover && (
                                <SpeedPopover
                                    value={speed}
                                    onChange={(v: number) => {
                                        setLocalSpeed(v);
                                        handleSpeedChange(v);
                                    }}
                                    triggerRef={speedPillRef}
                                    onClose={() => setShowSpeedPopover(false)}
                                />
                            )}
                        </>
                    )}

                    <EngineBadge label={engineBadgeLabel} tone={isCloudEngine ? 'cloud' : 'accent'} />

                    <ActionMenu
                        items={actionMenuItems}
                        trigger={
                            <span
                                className="btn-ghost hover-bg-subtle variant-editor__more-btn"
                                title="More actions"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 32,
                                    height: 32,
                                    borderRadius: 'var(--radius-round)',
                                }}
                            >
                                <MoreVertical size={16} />
                            </span>
                        }
                    />
                </div>

                <div className="variant-editor__tags-row" style={{ marginTop: '0.5rem' }}>
                    <TagAutocompleteInput
                        tags={profile.performance_tags ?? []}
                        onChange={handleSaveTags}
                        suggestions={combinedTagSuggestions}
                        placeholder="Add a performance tag..."
                    />
                </div>
            </div>

            {isCloudEngine && (
                <div
                    className="variant-editor__cloud-copy"
                    style={{ padding: showControlsInline ? '0 1.25rem 1.25rem' : '1.25rem' }}
                >
                    {engineUsable
                        ? (isRebuildEngine
                            ? `${activeEngine?.display_name || engine} uses local rebuilds to prepare high-quality voice latents. Click Rebuild after adding samples to update the model.`
                            : `${activeEngine?.display_name || engine} uses reference audio or direct voice IDs for synthesis. Use play to hear the current preview, and regenerate to refresh it after changes.`)
                        : `This voice is assigned to ${activeEngine?.display_name || engine}, but it is currently disabled or unavailable. You can play existing previews, but new generation is blocked.`}
                </div>
            )}

            {isTesting && (
                <div style={{ padding: showControlsInline ? '0 0 1.25rem' : '1.25rem' }}>
                    <div className="variant-editor__progress-track">
                        <div style={{ height: '100%', width: `${testStatus?.progress || 0}%`, background: 'var(--accent)', transition: 'width 0.3s ease' }} />
                    </div>
                </div>
            )}

            {renderControls()}

            <VersionHistoryPanel
                voiceName={profile.name}
                onPromoted={onRefresh}
                requestConfirm={requestConfirm}
            />
        </div>
    );
};
