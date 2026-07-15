/**
 * VoicesTabContent.tsx — R5-T3
 *
 * Renders the catalog grid of VoiceCatalogCards.
 * NarratorCard.tsx is kept on disk (retired in R6 after all capabilities
 * are re-homed to Voice Lab in R5-T5+).
 */
import React from 'react';
import { User, Plus, Search, Trash2, Download } from 'lucide-react';
import { VoiceCatalogCard } from '@/pages/Voices/components/VoiceCatalogCard';
import type { SpeakerProfile, Speaker, TtsEngine, VoiceEngine, VoiceMetadata } from '@/types';

interface VoicesTabContentProps {
    voices: any[];
    filteredVoices: any[];
    engineFilter: 'all' | 'disabled' | VoiceEngine;
    onRefresh: () => void | Promise<void>;
    handleTest: (name: string) => void;
    handleDelete: (name: string) => void;
    handleBuildNow: (name: string, files: File[], speakerId?: string, variantName?: string) => Promise<boolean>;
    testProgress: Record<string, { progress: number; started_at?: number }>;
    handleRequestConfirm: (config: { title: string; message: string; onConfirm: () => void; isDestructive?: boolean; isAlert?: boolean }) => void;
    buildingProfiles: Record<string, boolean>;
    onSetDefault: (name: string) => void;
    onRename: (speaker: { id: string; name: string }) => void;
    onAddVariant: (speaker: any, profiles: any[]) => void;
    onMoveVariant: (profile: SpeakerProfile) => void;
    onExportVoice: (name: string) => void;
    expandedVoiceId: string | null;
    setExpandedVoiceId: (id: string | null) => void;
    engines: TtsEngine[];
    onCreateClick: () => void;
    voiceMetadataMap?: Map<string, VoiceMetadata>;
    onEditMetadata?: (voiceGroupId: string, voiceName: string) => void;
    /** Navigate to Voice Lab for the given voice id */
    onNavigateToLab?: (voiceId: string) => void;
    /** Bulk-select mode (delete/export) — all omit-able, card renders normally without them. */
    selectMode?: boolean;
    selectedIds?: Set<string>;
    onToggleSelect?: (voiceId: string) => void;
    onBulkDelete?: () => void;
    onBulkExport?: () => void;
}

export const VoicesTabContent: React.FC<VoicesTabContentProps> = ({
    voices,
    filteredVoices,
    engineFilter,
    onRefresh,
    handleBuildNow,
    testProgress,
    handleRequestConfirm,
    buildingProfiles,
    onSetDefault,
    onRename,
    onExportVoice,
    engines,
    onCreateClick,
    voiceMetadataMap,
    onEditMetadata,
    onNavigateToLab,
    selectMode = false,
    selectedIds,
    onToggleSelect,
    onBulkDelete,
    onBulkExport,
}) => {
    const selectedCount = selectedIds?.size ?? 0;
    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
                {selectMode && selectedCount > 0 && (
                    <div className="voices-bulk-toolbar" role="toolbar" aria-label="Bulk voice actions">
                        <span className="voices-bulk-toolbar__count">{selectedCount} selected</span>
                        <button type="button" className="btn-glass" onClick={onBulkExport}>
                            <Download size={14} />
                            Export {selectedCount}
                        </button>
                        <button
                            type="button"
                            className="btn-glass hover-bg-destructive"
                            onClick={onBulkDelete}
                        >
                            <Trash2 size={14} />
                            Delete {selectedCount}
                        </button>
                    </div>
                )}
                {voices.length === 0 ? (
                    <div style={{
                        padding: '60px',
                        textAlign: 'center',
                        background: 'var(--surface-dim)',
                        borderRadius: '24px',
                        border: '2px dashed var(--border)',
                    }}>
                        <div style={{
                            width: '64px',
                            height: '64px',
                            borderRadius: '20px',
                            background: 'var(--surface-alt)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 20px',
                            color: 'var(--text-muted)',
                        }}>
                            <User size={32} />
                        </div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '8px' }}>
                            {engineFilter === 'disabled' ? 'No Disabled Voices' : 'No Voices Yet'}
                        </h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '24px', maxWidth: '320px', margin: '0 auto 24px' }}>
                            {engineFilter === 'disabled'
                                ? 'Every voice is currently active. Disable an engine in Settings to see its voices here.'
                                : 'Create your first voice to start generating premium AI audio.'}
                        </p>
                        {engineFilter !== 'disabled' && (
                            <button
                                onClick={onCreateClick}
                                className="btn-primary"
                                style={{ gap: '8px', padding: '0 24px', height: '44px', borderRadius: '12px' }}
                            >
                                <Plus size={20} />
                                Create New Voice
                            </button>
                        )}
                    </div>
                ) : filteredVoices.length === 0 ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <Search size={48} style={{ opacity: 0.2, marginBottom: '20px' }} />
                        <h3 style={{ margin: '0 0 10px', fontSize: '1.25rem' }}>No Matches Found</h3>
                        <p style={{ margin: 0 }}>Try adjusting your search query.</p>
                    </div>
                ) : (
                    <div className="voices-catalog-grid">
                        {filteredVoices.map(voice => {
                            const meta = voiceMetadataMap?.get(voice.id);
                            const speaker: Speaker = {
                                id: voice.id.startsWith('unassigned-') ? '' : voice.id,
                                name: voice.name,
                                default_profile_name: voice.profiles[0]?.name || null,
                                created_at: 0,
                                updated_at: 0,
                            };
                            return (
                                <VoiceCatalogCard
                                    key={voice.id}
                                    speaker={speaker}
                                    profiles={voice.profiles as SpeakerProfile[]}
                                    engines={engines}
                                    buildingProfiles={buildingProfiles}
                                    testProgress={testProgress}
                                    metadata={meta}
                                    onBuildNow={handleBuildNow}
                                    onNavigateToLab={(id) => onNavigateToLab?.(id) ?? void 0}
                                    onSetDefaultClick={onSetDefault}
                                    onRenameClick={onRename}
                                    onExportVoice={onExportVoice}
                                    requestConfirm={handleRequestConfirm}
                                    onEditMetadata={() => onEditMetadata?.(voice.id, voice.name)}
                                    onRefresh={onRefresh}
                                    selectable={selectMode}
                                    selected={selectedIds?.has(voice.id) ?? false}
                                    onToggleSelect={() => onToggleSelect?.(voice.id)}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
