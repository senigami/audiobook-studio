import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Pause, Play } from 'lucide-react';
import { api } from '@/api';
import { usePlayerBus, loadAndPlay, pause } from '@/store/playerBus';
import { formatRelativeTime } from '@/utils/format';
import type { VoiceVersion } from '@/hooks/useVariantVersions';

interface VersionAbPanelProps {
    voiceName: string;
    versionA: VoiceVersion;
    versionB: VoiceVersion;
}

interface SideResult {
    mode: 'cached' | 'job';
    audio_url?: string;
    job_id?: string;
}

// Job completion signal: poll the existing processing-queue endpoint (the
// same one the rest of the app already uses for job status) for this A/B
// job's id, every 2s for up to 30s. On a terminal "done" status, the render
// is reachable at the predictable /out/voice-ab-test/{job_id}/render.mp3
// URL served by app/api/web.py's get_voice_ab_test_render route — never
// read preview_*/has_artifact to infer this, per the map's Connection 5 note.
const POLL_INTERVAL_MS = 2000;
// A fresh render can include a cold engine/model load; 30s was too tight.
const POLL_TIMEOUT_MS = 120000;
const TERMINAL_STATUSES = new Set(['done', 'failed', 'cancelled']);

const renderVersionBadge = (version: VoiceVersion) => (
    <>
        <span className="variant-editor__version-history-timestamp">
            {formatRelativeTime(version.created_at)}
        </span>
        <span
            className="variant-editor__engine-badge"
            style={{
                background: 'var(--accent-tint-bg)',
                color: 'var(--accent)',
                border: '1px solid var(--accent)33'
            }}
        >
            {version.model || version.engine_id}
        </span>
    </>
);

export const VersionAbPanel: React.FC<VersionAbPanelProps> = ({ voiceName, versionA, versionB }) => {
    const [testText, setTestText] = useState(versionA.test_text);
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resultA, setResultA] = useState<SideResult | null>(null);
    const [resultB, setResultB] = useState<SideResult | null>(null);
    const [pollingSide, setPollingSide] = useState<{ a: boolean; b: boolean }>({ a: false, b: false });

    const pollTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
    // Generation counter: clearTimeout only cancels *scheduled* ticks, not a
    // tick already awaiting the queue fetch. Every new run (and unmount) bumps
    // this; a resumed stale tick sees the mismatch and bails before touching
    // state — otherwise it could write the OLD job's URL over the new run's
    // pending state, or re-arm a timer after unmount cleanup already ran.
    const pollRunIdRef = useRef(0);

    useEffect(() => {
        return () => {
            pollRunIdRef.current += 1;
            pollTimersRef.current.forEach(clearTimeout);
        };
    }, []);

    const pollForJobCompletion = (side: 'a' | 'b', jobId: string) => {
        const startedAt = Date.now();
        const runId = pollRunIdRef.current;
        const setResult = side === 'a' ? setResultA : setResultB;
        const tick = async () => {
            if (runId !== pollRunIdRef.current) return;
            if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
                setPollingSide((prev) => ({ ...prev, [side]: false }));
                setError(`Version ${side.toUpperCase()} render timed out — check the queue for its status.`);
                return;
            }
            try {
                const queue = await api.getProcessingQueue();
                if (runId !== pollRunIdRef.current) return;
                const job = Array.isArray(queue) ? queue.find((item) => item?.id === jobId) : undefined;
                const status = job?.status;
                if (status === 'done') {
                    setPollingSide((prev) => ({ ...prev, [side]: false }));
                    setResult({ mode: 'cached', audio_url: `/out/voice-ab-test/${jobId}/render.mp3` });
                    return;
                }
                if (status && TERMINAL_STATUSES.has(status) && status !== 'done') {
                    // failed/cancelled — stop polling and say so, rather than
                    // pointing at audio that was never produced.
                    setPollingSide((prev) => ({ ...prev, [side]: false }));
                    setError(`Version ${side.toUpperCase()} render ${status}.`);
                    return;
                }
            } catch {
                // ignore transient poll failures, keep trying until timeout
                if (runId !== pollRunIdRef.current) return;
            }
            pollTimersRef.current.push(setTimeout(tick, POLL_INTERVAL_MS));
        };
        setPollingSide((prev) => ({ ...prev, [side]: true }));
        pollTimersRef.current.push(setTimeout(tick, POLL_INTERVAL_MS));
    };

    const handleRunComparison = async () => {
        // Invalidate prior polls: clear scheduled ticks AND bump the run id so
        // any tick currently awaiting a fetch bails instead of writing a stale
        // result over this run's state.
        pollRunIdRef.current += 1;
        pollTimersRef.current.forEach(clearTimeout);
        pollTimersRef.current = [];
        setPollingSide({ a: false, b: false });

        setIsRunning(true);
        setError(null);
        setResultA(null);
        setResultB(null);
        try {
            const res = await api.runVersionAbTest(voiceName, versionA.id, versionB.id, testText);
            if (res.status !== 'ok' || !res.results) {
                setError(res.message || 'Comparison failed');
                return;
            }
            setResultA(res.results.a);
            setResultB(res.results.b);
            if (res.results.a.mode === 'job' && res.results.a.job_id) pollForJobCompletion('a', res.results.a.job_id);
            if (res.results.b.mode === 'job' && res.results.b.job_id) pollForJobCompletion('b', res.results.b.job_id);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Comparison failed');
        } finally {
            setIsRunning(false);
        }
    };

    const playerBus = usePlayerBus();

    const renderSide = (label: 'A' | 'B', version: VoiceVersion, result: SideResult | null, isPolling: boolean) => {
        const audioUrl = result?.mode === 'cached' ? result.audio_url : undefined;
        const isPlayingThis = Boolean(audioUrl) && playerBus.scope === 'preview' && playerBus.audioUrl === audioUrl && playerBus.playing;
        const isPending = result?.mode === 'job' && isPolling;
        const canPlay = Boolean(audioUrl);

        const handlePlayClick = () => {
            if (!audioUrl) return;
            if (isPlayingThis) {
                pause();
                return;
            }
            loadAndPlay({
                scope: 'preview',
                title: `Version ${label}`,
                subtitle: `${voiceName} — ${version.model || version.engine_id}`,
                audioUrl,
            });
        };

        return (
            <div className="variant-editor__version-ab-side">
                <div className="variant-editor__version-history-row">
                    <span className="variant-editor__version-ab-label">{label}</span>
                    {renderVersionBadge(version)}
                </div>
                <button
                    type="button"
                    onClick={handlePlayClick}
                    disabled={!canPlay}
                    className="btn-ghost hover-bg-subtle variant-editor__version-ab-play-btn"
                    title={isPending ? 'Rendering...' : isPlayingThis ? 'Pause' : 'Play'}
                >
                    {isPending ? (
                        <>
                            <Loader2 size={16} className="animate-spin" />
                            Rendering...
                        </>
                    ) : isPlayingThis ? (
                        <>
                            <Pause size={16} fill="currentColor" />
                            Pause
                        </>
                    ) : (
                        <>
                            <Play size={16} fill="currentColor" />
                            Play
                        </>
                    )}
                </button>
            </div>
        );
    };

    return (
        <div className="variant-editor__version-ab-panel glass-panel">
            <label className="voice-field-label">TEST PASSAGE</label>
            <textarea
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                className="script-editor-textarea"
            />
            <button
                type="button"
                onClick={handleRunComparison}
                disabled={isRunning}
                className="btn-primary variant-editor__version-ab-run-btn"
            >
                {isRunning ? (
                    <>
                        <Loader2 size={16} className="animate-spin" />
                        Running comparison...
                    </>
                ) : (
                    'Run comparison'
                )}
            </button>
            {error && (
                <span className="variant-editor__version-history-muted">{error}</span>
            )}
            <div className="variant-editor__version-ab-columns">
                {renderSide('A', versionA, resultA, pollingSide.a)}
                {renderSide('B', versionB, resultB, pollingSide.b)}
            </div>
        </div>
    );
};
