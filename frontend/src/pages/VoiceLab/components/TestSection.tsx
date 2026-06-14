/**
 * TestSection.tsx — R5-T8
 * Engine + reference sample pickers, script text, generate test,
 * PredictiveProgressBar-style progress, playback, edit preview script link.
 */
import React, { useState } from 'react';
import type { SpeakerProfile, TtsEngine, Job } from '@/types';
import { Play, Pause, RefreshCw } from 'lucide-react';
import { formatVoiceEngineLabel, getVoiceProfileEngine } from '@/utils/voiceProfiles';
import { usePlayerBus, loadAndPlay, pause } from '@/store/playerBus';

export interface TestSectionProps {
    profiles: SpeakerProfile[];
    engines: TtsEngine[];
    testProgress: Record<string, { progress: number; started_at?: number }>;
    jobs: Record<string, Job>;
    onTest: (name: string) => Promise<void>;
    onRefresh: () => void;
    onEditTestText?: (profile: SpeakerProfile) => void;
}

export const TestSection: React.FC<TestSectionProps> = ({
    profiles,
    engines,
    testProgress,
    onTest,
    onEditTestText,
}) => {
    const defaultProfile = profiles.find(p => p.is_default) ?? profiles[0];
    const [selectedProfileName, setSelectedProfileName] = useState(defaultProfile?.name ?? '');
    const [selectedRefSample, setSelectedRefSample] = useState('');
    const [scriptText, setScriptText] = useState(defaultProfile?.test_text ?? '');
    const [isTesting, setIsTesting] = useState(false);
    const playerBus = usePlayerBus();

    const activeProfile = profiles.find(p => p.name === selectedProfileName) ?? defaultProfile;
    // Single-owner playback (ADR-0010): preview plays through the global player bus,
    // never a local <audio>/new Audio() element.
    const isPlaying = playerBus.scope === 'preview'
        && !!activeProfile?.preview_url
        && playerBus.audioUrl === activeProfile.preview_url
        && playerBus.playing;
    const progress = activeProfile ? (testProgress[activeProfile.name]?.progress ?? 0) : 0;
    const isCurrentlyTesting = isTesting || (activeProfile ? !!testProgress[activeProfile.name] : false);

    const availableSamples = activeProfile?.samples_detailed?.map(s => s.name) ?? [];

    const handleGenerate = async () => {
        if (!activeProfile) return;
        setIsTesting(true);
        try {
            await onTest(activeProfile.name);
        } finally {
            setIsTesting(false);
        }
    };

    const handlePlayPause = () => {
        if (!activeProfile?.preview_url) return;
        if (isPlaying) {
            pause();
        } else {
            loadAndPlay({
                scope: 'preview',
                title: activeProfile.variant_name || 'Default Variant',
                subtitle: activeProfile.name,
                audioUrl: activeProfile.preview_url,
            });
        }
    };

    const engineId = activeProfile ? (getVoiceProfileEngine(activeProfile) ?? '') : '';

    return (
        <div className="voice-lab-section">
            <div className="voice-lab-section__header">
                <span className="voice-lab-section-label">Test</span>
            </div>
            <div className="voice-lab-section__body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Engine + variant row */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>Variant</span>
                    <select
                        aria-label="Test variant"
                        value={selectedProfileName}
                        onChange={e => {
                            setSelectedProfileName(e.target.value);
                            const p = profiles.find(pr => pr.name === e.target.value);
                            setScriptText(p?.test_text ?? '');
                        }}
                        style={{
                            padding: '4px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text-primary)',
                            fontSize: '0.75rem',
                        }}
                    >
                        {profiles.map(p => (
                            <option key={p.name} value={p.name}>
                                {p.variant_name ?? 'Default'} ({engines.find(e => e.engine_id === getVoiceProfileEngine(p))?.display_name ?? formatVoiceEngineLabel(getVoiceProfileEngine(p) ?? '')})
                            </option>
                        ))}
                    </select>

                    {availableSamples.length > 0 && (
                        <>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>Ref</span>
                            <select
                                aria-label="Reference sample"
                                value={selectedRefSample}
                                onChange={e => setSelectedRefSample(e.target.value)}
                                style={{
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.75rem',
                                    flex: 1,
                                    minWidth: '100px',
                                    maxWidth: '200px',
                                }}
                            >
                                <option value="">Auto</option>
                                {availableSamples.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </>
                    )}
                </div>

                {/* Script + generate */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <input
                        type="text"
                        value={scriptText}
                        onChange={e => setScriptText(e.target.value)}
                        placeholder="Enter test text…"
                        aria-label="Test script"
                        style={{
                            flex: 1,
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text-primary)',
                            fontSize: '0.78rem',
                        }}
                    />
                    <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={!activeProfile || isCurrentlyTesting}
                        className="btn-primary"
                        style={{ height: '32px', padding: '0 12px', fontSize: '0.78rem', borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        {isCurrentlyTesting ? (
                            <><RefreshCw size={13} className="animate-spin" /> Generating…</>
                        ) : (
                            'Generate test'
                        )}
                    </button>
                </div>

                {/* Progress bar */}
                {isCurrentlyTesting && (
                    <div style={{ height: '4px', background: 'var(--border-light)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', transition: 'width 0.3s ease' }} />
                    </div>
                )}

                {/* Playback row */}
                {activeProfile?.preview_url && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={handlePlayPause}
                            className="btn-ghost"
                            aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
                            style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                        >
                            {isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
                        </button>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Preview</span>
                        <span style={{ flex: 1 }} />
                        {onEditTestText && activeProfile && (
                            <button
                                type="button"
                                onClick={() => onEditTestText(activeProfile)}
                                className="btn-ghost"
                                style={{ fontSize: '0.7rem', color: 'var(--accent)', padding: '0', textDecoration: 'underline' }}
                            >
                                Edit preview script
                            </button>
                        )}
                    </div>
                )}

                {!activeProfile?.preview_url && !isCurrentlyTesting && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        No preview yet. Generate a test to hear this voice.
                    </div>
                )}

                {/* Engine badge */}
                {engineId && (
                    <span style={{
                        display: 'inline-flex',
                        alignSelf: 'flex-start',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-round)',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        background: 'var(--accent-tint-bg)',
                        color: 'var(--accent)',
                        border: '1px solid var(--accent-tint-border)',
                    }}>
                        {engines.find(e => e.engine_id === engineId)?.display_name ?? formatVoiceEngineLabel(engineId)}
                    </span>
                )}
            </div>
        </div>
    );
};
