import React, { useState, useEffect, useRef } from 'react';
import type { SpeakerProfile } from '../../types';
import { 
    Trash2, Play, Loader2, RefreshCw, FileEdit, 
    Pause, Sliders
} from 'lucide-react';
import { motion } from 'framer-motion';
import { SpeedPopover } from './VoiceUtils';
import { useVariantActions } from '../../hooks/useVariantActions';
import { SampleManager } from './SampleManager';

interface VariantEditorProps {
    profile: SpeakerProfile;
    isTesting: boolean;
    testStatus?: any;
    onTest: (name: string) => void;
    onDeleteVariant: (name: string) => void;
    onMoveVariant: (profile: SpeakerProfile) => void;
    onRefresh: () => void;
    onEditTestText: (profile: SpeakerProfile) => void;
    onBuildNow: (name: string, files: File[], speakerId?: string, variantName?: string) => Promise<boolean>;
    requestConfirm: (config: { title: string; message: string; onConfirm: () => void; isDestructive?: boolean; isAlert?: boolean }) => void;
    voiceName: string;
    showControlsInline?: boolean;
    buildingProfiles: Record<string, boolean>;
}

export const VariantEditor: React.FC<VariantEditorProps> = ({ 
    profile, isTesting, onTest, onDeleteVariant, onMoveVariant, onRefresh, 
    onEditTestText, onBuildNow, requestConfirm, testStatus,
    voiceName, showControlsInline = false, buildingProfiles
}) => {
    const {
        localSpeed,
        setLocalSpeed,
        isPlaying,
        setIsPlaying,
        playingSample,
        cacheBuster,
        setCacheBuster,
        audioRef,
        sampleAudioRef,
        handlePlayClick,
        handlePlaySample,
        handleSpeedChange,
        handleDeleteSample,
        uploadFiles
    } = useVariantActions(profile, onRefresh, onTest, requestConfirm);

    const isBuilding = buildingProfiles[profile.name];
    const speedPillRef = useRef<HTMLButtonElement>(null);
    const speed = localSpeed ?? profile.speed;
    const hasSamples = (profile.wav_count || 0) > 0;

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

    const renderControls = () => (
        <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <SampleManager
                profile={profile}
                isSamplesExpanded={isSamplesExpanded}
                setIsSamplesExpanded={setIsSamplesExpanded}
                isRebuildRequired={isRebuildRequired}
                uploadFiles={uploadFiles}
                playingSample={playingSample}
                handlePlaySample={handlePlaySample}
                handleDeleteSample={handleDeleteSample}
            />
        </div>
    );

    return (
        <div className={showControlsInline ? "" : "glass-panel animate-in"} style={showControlsInline ? {} : { padding: '0', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <audio 
                ref={audioRef}
                src={profile.preview_url ? `${profile.preview_url}?t=${cacheBuster}` : undefined}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
            />
            <audio 
                ref={sampleAudioRef}
                onPlay={() => {}} // Hook handles state
                onPause={() => {}} 
                onEnded={() => {}}
            />

            <div 
                style={{ 
                    padding: '0.75rem 1.25rem',
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    borderBottom: 'none',
                    transition: 'border-bottom 0.2s',
                    background: 'rgba(var(--accent-rgb), 0.02)'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                    <div style={{ flexShrink: 0 }}>
                        <button 
                            onClick={handlePlayClick}
                            className="btn-ghost hover-bg-subtle"
                        disabled={!hasSamples || isTesting}
                        title={!hasSamples
                            ? "Add at least one sample before generating a preview"
                            : profile.preview_url
                                ? (isPlaying ? "Pause Sample" : "Play Sample")
                                : "Generate Sample"}
                            style={{ 
                                width: '40px', 
                                height: '40px', 
                                padding: 0,
                                borderRadius: '12px',
                                background: isPlaying ? 'var(--accent)' : 'var(--surface)',
                                color: isPlaying ? 'white' : 'var(--text-primary)',
                                border: isPlaying ? '1px solid var(--accent)' : '1px solid var(--border)',
                                position: 'relative',
                                overflow: 'hidden',
                                boxShadow: isPlaying ? '0 0 0 3px var(--accent-glow)' : 'var(--shadow-sm)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            {isTesting ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : isPlaying ? (
                                <Pause size={18} fill="currentColor" style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                            ) : (
                                <Play size={18} fill="currentColor" style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                            )}
                            {isPlaying && (
                                <motion.div
                                    layoutId="playing-pulse"
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        border: '2px solid white',
                                        borderRadius: '12px',
                                        opacity: 0.3
                                    }}
                                    animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0, 0.3] }}
                                    transition={{ duration: 2, repeat: Infinity }}
                                />
                            )}
                        </button>
                    </div>

                    <div style={{ width: '1px', height: '24px', background: 'var(--border)', opacity: 0.5, margin: '0 4px' }} />

                    <button
                        ref={speedPillRef}
                        onClick={() => setShowSpeedPopover(!showSpeedPopover)}
                        className="btn-ghost hover-bg-subtle"
                        style={{
                            padding: '4px 10px',
                            height: '32px',
                            borderRadius: '100px',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            gap: '6px',
                            color: 'var(--text-primary)',
                            minWidth: '70px',
                            justifyContent: 'center',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <Sliders size={12} style={{ width: '12px', height: '12px', flexShrink: 0 }} />
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

                    <button 
                        onClick={() => onEditTestText(profile)}
                        className="btn-ghost hover-bg-subtle"
                        title="Edit Preview Script"
                        style={{ padding: '8px 12px', height: '36px', borderRadius: '10px', background: 'var(--surface)', border: '1px solid var(--border)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <FileEdit size={16} />
                        Script
                    </button>
                    
                    <button 
                        disabled={!hasSamples || isBuilding || isTesting}
                        className={isRebuildRequired ? "btn-primary" : "btn-ghost hover-bg-subtle"}
                        onClick={(e) => { e.stopPropagation(); handleRebuild(); }} 
                        title={!hasSamples ? "Add at least one sample before rebuilding this voice" : "Rebuild Voice Model"}
                        style={{ 
                            padding: '8px 12px', 
                            height: '36px', 
                            borderRadius: '10px', 
                            fontSize: '0.85rem', 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            ...(isRebuildRequired ? {} : {background: 'var(--surface)', border: '1px solid var(--border)'}),
                            minWidth: '110px',
                            justifyContent: 'center'
                        }}
                    >
                        {isBuilding ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Rebuilding...
                            </>
                        ) : isTesting ? (
                            <>
                                <RefreshCw size={16} className="animate-spin" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <RefreshCw size={16} />
                                Rebuild
                            </>
                        )}
                    </button>
                </div>
            </div>

            {isTesting && (
                <div style={{ padding: showControlsInline ? '0 0 1.25rem' : '1.25rem' }}>
                    <div style={{ height: '4px', background: 'var(--border-light)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${testStatus?.progress || 0}%`, background: 'var(--accent)', transition: 'width 0.3s ease' }} />
                    </div>
                </div>
            )}

            {renderControls()}

            <div style={{ 
                padding: '1.25rem', 
                borderTop: '1px solid var(--border-light)', 
                background: 'rgba(239, 68, 68, 0.02)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderRadius: '0 0 16px 16px'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>Advanced Actions</span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Move this variant to another voice or delete it.</span>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                        onClick={() => onMoveVariant(profile)}
                        className="btn-ghost hover-bg-subtle"
                        style={{ gap: '6px', fontSize: '0.8rem', padding: '0 12px', height: '32px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)' }}
                    >
                        <RefreshCw size={14} />
                        Move Variant
                    </button>
                    <button 
                        onClick={() => {
                            requestConfirm({
                                title: 'Delete variant?',
                                message: `Delete variant '${profile.variant_name || 'Default'}' from '${voiceName}'? This cannot be undone.`,
                                isDestructive: true,
                                onConfirm: () => onDeleteVariant(profile.name)
                            });
                        }}
                        className="btn-ghost hover-bg-destructive"
                        style={{ gap: '6px', fontSize: '0.8rem', padding: '0 12px', height: '32px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)' }}
                    >
                        <Trash2 size={14} />
                        Delete Variant
                    </button>
                </div>
            </div>
        </div>
    );
};
