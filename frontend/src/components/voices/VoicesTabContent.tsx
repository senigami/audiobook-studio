import React from 'react';
import { User, Plus, Search } from 'lucide-react';
import { NarratorCard } from './NarratorCard';
import type { SpeakerProfile, TtsEngine, VoiceEngine } from '../../types';

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
    onEditTestText: (profile: SpeakerProfile) => void;
}

export const VoicesTabContent: React.FC<VoicesTabContentProps> = ({
    voices,
    filteredVoices,
    engineFilter,
    onRefresh,
    handleTest,
    handleDelete,
    handleBuildNow,
    testProgress,
    handleRequestConfirm,
    buildingProfiles,
    onSetDefault,
    onRename,
    onAddVariant,
    onMoveVariant,
    onExportVoice,
    expandedVoiceId,
    setExpandedVoiceId,
    engines,
    onCreateClick,
    onEditTestText
}) => {
    return (
        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {voices.length === 0 ? (
                    <div style={{ 
                        padding: '60px', 
                        textAlign: 'center', 
                        background: 'rgba(var(--accent-rgb), 0.02)', 
                        borderRadius: '24px', 
                        border: '2px dashed var(--border)' 
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
                            color: 'var(--text-muted)'
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
                    <>
                        {filteredVoices.map(voice => (
                            <NarratorCard
                                key={voice.id}
                                speaker={{ 
                                    id: voice.id.startsWith('unassigned-') ? '' : voice.id, 
                                    name: voice.name, 
                                    default_profile_name: voice.profiles[0]?.name || null, 
                                    created_at: 0, 
                                    updated_at: 0 
                                }}
                                profiles={voice.profiles}
                                onRefresh={onRefresh}
                                onTest={handleTest}
                                onDelete={handleDelete}
                                onMoveVariant={onMoveVariant}
                                onEditTestText={onEditTestText}
                                onBuildNow={handleBuildNow}
                                testProgress={testProgress}
                                requestConfirm={handleRequestConfirm}
                                buildingProfiles={buildingProfiles}
                                onAddVariantClick={(s) => onAddVariant(s, voice.profiles)}
                                onSetDefaultClick={onSetDefault}
                                onRenameClick={onRename}
                                onExportVoice={onExportVoice}
                                isExpanded={expandedVoiceId === voice.id}
                                onToggleExpand={() => setExpandedVoiceId(expandedVoiceId === voice.id ? null : voice.id)}
                                engines={engines}
                            />
                        ))}
                    </>
                )}
            </div>
        </div>
    );
};
