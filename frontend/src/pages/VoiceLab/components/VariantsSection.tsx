/**
 * VariantsSection.tsx — R5-T6
 * Renders one VariantEditor row per profile + "+ Add variant" trigger.
 * Move-variant modal hosted at lab page level (props drilled from VoiceLabPage).
 */
import React from 'react';
import type { SpeakerProfile, TtsEngine } from '@/types';
import { Plus } from 'lucide-react';
import { VariantEditor } from '@/pages/Voices/components/VariantEditor';

export interface VariantsSectionProps {
    speakerName: string;
    profiles: SpeakerProfile[];
    engines: TtsEngine[];
    buildingProfiles: Record<string, boolean>;
    testProgress: Record<string, { progress: number; started_at?: number }>;
    onRefresh: () => void;
    onBuildNow: (name: string, files: File[], speakerId?: string, variantName?: string) => Promise<boolean>;
    requestConfirm: (config: { title: string; message: string; onConfirm: () => void; isDestructive?: boolean; isAlert?: boolean }) => void;
    onAddVariant?: () => void;
    onMoveVariant?: (profile: SpeakerProfile) => void;
    onEditTestText?: (profile: SpeakerProfile) => void;
}

export const VariantsSection: React.FC<VariantsSectionProps> = ({
    speakerName,
    profiles,
    engines,
    buildingProfiles,
    testProgress,
    onRefresh,
    onBuildNow,
    requestConfirm,
    onAddVariant,
    onMoveVariant,
    onEditTestText,
}) => {
    return (
        <div className="voice-lab-section">
            <div className="voice-lab-section__header">
                <span className="voice-lab-section-label">Variants</span>
                <button
                    type="button"
                    onClick={onAddVariant}
                    className="btn-ghost"
                    style={{
                        height: '26px',
                        padding: '0 10px',
                        fontSize: '0.72rem',
                        borderRadius: 'var(--radius-round)',
                        border: '1px dashed var(--accent)',
                        color: 'var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                    }}
                >
                    <Plus size={12} />
                    Add variant
                </button>
            </div>
            <div className="voice-lab-section__body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {profiles.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        No variants yet. Use Add variant to create one.
                    </div>
                ) : (
                    profiles.map(profile => (
                        <VariantEditor
                            key={profile.name}
                            profile={profile}
                            isTesting={!!buildingProfiles[profile.name]}
                            testStatus={testProgress[profile.name]}
                            onTest={async (name) => {
                                await fetch(`/api/speaker-profiles/${encodeURIComponent(name)}/test`, { method: 'POST' });
                                onRefresh();
                            }}
                            onDeleteVariant={async (name) => {
                                await fetch(`/api/speaker-profiles/${encodeURIComponent(name)}`, { method: 'DELETE' });
                                onRefresh();
                            }}
                            onMoveVariant={onMoveVariant ?? (() => undefined)}
                            onRefresh={onRefresh}
                            onEditTestText={onEditTestText ?? (() => undefined)}
                            onBuildNow={onBuildNow}
                            requestConfirm={requestConfirm}
                            voiceName={speakerName}
                            showControlsInline={true}
                            buildingProfiles={buildingProfiles}
                            engines={engines}
                        />
                    ))
                )}
            </div>
        </div>
    );
};
