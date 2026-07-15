/**
 * VariantsSection.tsx — R5-T6, rewritten for voice-variant-tagging-and-ia task 009
 *
 * Renders `VariantSwitcher` (task 008) + exactly ONE `VariantEditor` for the
 * currently selected variant, instead of stacking one `VariantEditor` per
 * profile. Owns `selectedVariantName` state (INV-SELECT-1: never zero when
 * variants exist, never more than one mounted).
 */
import React, { useEffect, useRef, useState } from 'react';
import type { SpeakerProfile, TtsEngine } from '@/types';
import { Plus } from 'lucide-react';
import { VariantEditor } from '@/pages/Voices/components/VariantEditor';
import { VariantSwitcher } from '@/pages/Voices/components/VariantSwitcher';
import { VariantFilterBar } from '@/pages/Voices/components/VariantFilterBar';

/** Matches VariantSwitcher's own STRIP_THRESHOLD (task 008) — kept in sync
 * here since VariantSwitcher doesn't expose its strip/rail mode externally. */
const STRIP_THRESHOLD = 4;

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
    const [selectedVariantName, setSelectedVariantName] = useState(
        () => profiles.find(p => p.is_variant_default)?.name || profiles[0]?.name || ''
    );
    const [activeFilters, setActiveFilters] = useState<string[]>([]);

    const isStrip = profiles.length <= STRIP_THRESHOLD;
    const visibleProfiles = activeFilters.length === 0
        ? profiles
        : profiles.filter(p => (p.performance_tags ?? []).some(tag => activeFilters.includes(tag)));

    // Auto-select newly added variants (mirrors NarratorCard.tsx's known-good
    // pattern, reimplemented here — that file is retired/dead code).
    const prevProfileNames = useRef(new Set(profiles.map(p => p.name)));
    useEffect(() => {
        const currentNames = new Set(profiles.map(p => p.name));
        if (currentNames.size > prevProfileNames.current.size) {
            const addedName = Array.from(currentNames).find(name => !prevProfileNames.current.has(name));
            if (addedName) {
                setSelectedVariantName(addedName);
            }
        }
        prevProfileNames.current = currentNames;
    }, [profiles]);

    // Fall back sensibly (to the character's default, then the first
    // remaining profile) if the currently-selected variant disappears
    // (e.g. deleted) or none was selected yet.
    useEffect(() => {
        if (profiles.length === 0) return;
        if (selectedVariantName && profiles.some(p => p.name === selectedVariantName)) return;

        setSelectedVariantName(
            profiles.find(p => p.is_variant_default)?.name || profiles[0]?.name || ''
        );
    }, [profiles, selectedVariantName]);

    // Filter-hides-selection fallback (AR-10): if an active filter change
    // hides the currently-selected variant, auto-select the first remaining
    // visible profile rather than leaving the detail pane pointing at a
    // variant no longer in the visible list.
    useEffect(() => {
        if (visibleProfiles.length === 0) return;
        if (visibleProfiles.some(p => p.name === selectedVariantName)) return;

        setSelectedVariantName(visibleProfiles[0].name);
    }, [visibleProfiles, selectedVariantName]);

    const handleSetDefault = async (variantName: string) => {
        await fetch(
            `/api/speaker-profiles/${encodeURIComponent(speakerName)}/variants/${encodeURIComponent(variantName)}/set-default`,
            { method: 'POST' }
        );
        onRefresh();
    };

    return (
        <div className="voice-lab-section">
            <div className="voice-lab-section__header">
                <span className="voice-lab-section-label">Variants</span>
                <button
                    type="button"
                    onClick={onAddVariant}
                    className="btn-ghost voice-lab-section__add-variant-btn"
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
                    (() => {
                        const selectedProfile =
                            visibleProfiles.find(p => p.name === selectedVariantName)
                            || profiles.find(p => p.name === selectedVariantName)
                            || profiles[0];
                        return (
                            <>
                                {!isStrip && (
                                    <VariantFilterBar
                                        profiles={profiles}
                                        activeFilters={activeFilters}
                                        onFilterChange={setActiveFilters}
                                    />
                                )}
                                <VariantSwitcher
                                    profiles={visibleProfiles}
                                    selectedVariantName={selectedProfile.name}
                                    onSelect={setSelectedVariantName}
                                    onSetDefault={handleSetDefault}
                                    voiceName={speakerName}
                                />
                                <VariantEditor
                                    key={selectedProfile.name}
                                    profile={selectedProfile}
                                    isTesting={!!buildingProfiles[selectedProfile.name]}
                                    testStatus={testProgress[selectedProfile.name]}
                                    tagSuggestions={Array.from(
                                        new Set(
                                            profiles
                                                .filter(p => p.name !== selectedProfile.name)
                                                .flatMap(p => p.performance_tags ?? [])
                                        )
                                    )}
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
                            </>
                        );
                    })()
                )}
            </div>
        </div>
    );
};
