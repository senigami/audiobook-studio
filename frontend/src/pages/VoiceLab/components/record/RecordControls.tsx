/**
 * RecordControls.tsx — task 008 (voice-card-consolidation, P7)
 *
 * The record/stop button, live level meter, and timer that sit below task
 * 007's `RecordingCueCard`. Wraps `useMicRecorder` and adds the full
 * accessibility contract from INV-REC-4:
 *   - the record/stop button's ACCESSIBLE NAME changes with state (not just
 *     the visual icon/label)
 *   - a throttled (2-3s) `aria-live` status channel, separate from the
 *     visual meter, with real silence detection over a rolling window of
 *     recent level readings
 *   - explicit "Recording started" / "Recording stopped, N seconds captured"
 *     announcements (not throttled — these are one-shot state-transition
 *     events, not periodic status)
 *   - an explicit "why we need this" explanation rendered BEFORE any
 *     `getUserMedia` call fires (i.e. it's already in the DOM in the `idle`
 *     state, prior to the user clicking record)
 *   - explicit focus management for the record→stopped transition (this
 *     task's slice of INV-REC-4 — task 009 owns stopped→playback and
 *     playback→keep/retake)
 *
 * Task 009 (P8) adds the `captured`-state UI on top of this task's
 * record/stop primitive: a capture-time quality verdict (`checkSampleQuality`),
 * a "Play back" control, and the Keep/Retake button group that actually calls
 * the `onKeep`/`onRetake` props (accepted but unused by task 008). It also
 * owns the two remaining INV-REC-4 focus transitions named in task 008's
 * handoff note: stopped→playback (focus moves to the "Play back" control
 * when activated) and playback→keep/retake (focus lands on the Keep button
 * after playback ends or is stopped).
 *
 * Silence detection: a rolling window of the last SILENCE_WINDOW_SIZE level
 * readings (sampled every time `useMicRecorder`'s `levelDb` changes, i.e.
 * every ~100ms per the hook's meter interval) is checked against
 * SILENCE_THRESHOLD_DB; if the whole window is at/under the threshold, the
 * throttled channel announces "Input level is very low" instead of the
 * default "in progress" status.
 */
import { useEffect, useRef, useState } from 'react';
import { useMicRecorder } from '@/hooks/useMicRecorder';
import { checkSampleQuality, type QualityVerdict } from '@/utils/audio/qualityCheck';

const ANNOUNCE_THROTTLE_MS = 2500;
const SILENCE_THRESHOLD_DB = -50;
const SILENCE_WINDOW_SIZE = 15;
const LEVEL_POLL_INTERVAL_MS = 100;

// `onKeep(blob)` is called once the user confirms Keep on a `captured` take
// (task 009 wires this — task 008 only accepted the prop); `onRetake()` is
// called when the user discards the current captured take to record another
// (the previous take is never touched here — non-destructive semantics live
// one layer up, in `TakeManager.tsx`, which is the only place takes are
// actually held onto).
export function RecordControls({ onKeep, onRetake }: { onKeep?: (blob: Blob) => void; onRetake?: () => void }) {
    const rec = useMicRecorder();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const liveRegionRef = useRef<HTMLDivElement>(null);
    const lastAnnounceAtRef = useRef(0);
    const levelWindowRef = useRef<number[]>([]);
    const prevStateRef = useRef(rec.state);
    const playbackButtonRef = useRef<HTMLButtonElement>(null);
    const keepButtonRef = useRef<HTMLButtonElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const [verdict, setVerdict] = useState<QualityVerdict | null>(null);
    const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
    // Mirrors rec.levelDb so the polling interval below can read the latest
    // reading without depending on it having *changed* (a sustained,
    // near-constant input level must still be sampled into the rolling
    // window on every tick, not just on the ticks where the value happens to
    // differ from the last one).
    const levelDbRef = useRef(rec.levelDb);
    useEffect(() => {
        levelDbRef.current = rec.levelDb;
    }, [rec.levelDb]);

    const announce = (message: string) => {
        if (liveRegionRef.current) {
            liveRegionRef.current.textContent = message;
        }
    };

    // One-shot explicit announcements + focus management on state
    // transitions (record→stopped is this task's responsibility per
    // INV-REC-4; stopped→playback / playback→keep/retake belong to task 009).
    useEffect(() => {
        const prev = prevStateRef.current;
        if (prev !== 'recording' && rec.state === 'recording') {
            announce('Recording started');
            lastAnnounceAtRef.current = Date.now();
            levelWindowRef.current = [];
        }
        if (prev === 'recording' && rec.state === 'captured') {
            const seconds = Math.round(rec.elapsedMs / 1000);
            announce(`Recording stopped, ${seconds} second${seconds === 1 ? '' : 's'} captured`);
            // Focus stays on the record/stop button through the record→stopped
            // transition rather than being left on a removed node.
            buttonRef.current?.focus();
        }
        if (rec.state === 'permission-denied' && prev !== 'permission-denied') {
            announce('Microphone permission denied. Recording is unavailable until access is granted.');
        }
        prevStateRef.current = rec.state;
    }, [rec.state, rec.elapsedMs]);

    // Runs the capture-time quality check (INV-REC-3) as soon as a take is
    // captured, and prepares an object URL for the "Play back" control.
    // Cleaned up (verdict cleared, URL revoked) whenever we leave `captured`
    // (a new recording starts, or Keep/Retake resets back to `idle`).
    useEffect(() => {
        if (rec.state !== 'captured' || !rec.blob) {
            setVerdict(null);
            setPlaybackUrl(null);
            return;
        }

        const blob = rec.blob;
        const url = URL.createObjectURL(blob);
        setPlaybackUrl(url);

        let cancelled = false;
        (async () => {
            try {
                const arrayBuffer = await blob.arrayBuffer();
                const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
                const audioContext = new AudioContextCtor();
                try {
                    const decoded = await audioContext.decodeAudioData(arrayBuffer);
                    const result = await checkSampleQuality(decoded);
                    if (!cancelled) setVerdict(result);
                } finally {
                    audioContext.close().catch(() => { /* already closed / not supported in test env */ });
                }
            } catch {
                if (!cancelled) {
                    setVerdict({ ok: false, durationSeconds: 0, hasClipping: false, isSilent: false, message: 'Could not analyze this recording — try retaking it.' });
                }
            }
        })();

        return () => {
            cancelled = true;
            URL.revokeObjectURL(url);
        };
    }, [rec.state, rec.blob]);

    // Explicit stopped→playback focus management (task 009's slice of
    // INV-REC-4): focus moves to the "Play back" control itself when
    // activated, rather than staying wherever it happened to be.
    const handlePlayback = () => {
        // `.play()` returns a Promise that rejects (or, in jsdom, resolves to
        // `undefined` rather than a real Promise) in environments without
        // real media playback — the rejection isn't actionable here, so it's
        // swallowed rather than surfaced.
        audioRef.current?.play()?.catch(() => { /* no-op: not implemented in test env */ });
        playbackButtonRef.current?.focus();
    };

    // Explicit playback→keep/retake focus management: once playback ends
    // (or is stopped), focus lands on the Keep/Retake button group instead
    // of being stranded on the playback control.
    const handlePlaybackEnded = () => {
        keepButtonRef.current?.focus();
    };

    const handleKeep = () => {
        if (rec.blob) onKeep?.(rec.blob);
        rec.reset();
    };

    const handleRetake = () => {
        onRetake?.();
        rec.reset();
    };

    // Throttled, silence-aware periodic status while recording — separate
    // from the visual meter and from the one-shot start/stop announcements
    // above. Polls the latest level reading on its own interval (rather than
    // reacting to `rec.levelDb` changing) so a sustained, near-constant level
    // still gets sampled into the rolling window every tick. Only pushes a
    // new announcement at most once per ANNOUNCE_THROTTLE_MS, and only for a
    // meaningful transition (not on every AnalyserNode tick).
    useEffect(() => {
        if (rec.state !== 'recording') {
            levelWindowRef.current = [];
            return;
        }

        const intervalId = setInterval(() => {
            const window_ = levelWindowRef.current;
            window_.push(levelDbRef.current);
            if (window_.length > SILENCE_WINDOW_SIZE) window_.shift();

            const now = Date.now();
            if (now - lastAnnounceAtRef.current < ANNOUNCE_THROTTLE_MS) return;
            if (window_.length < SILENCE_WINDOW_SIZE) return;

            const isSilent = window_.every(db => db <= SILENCE_THRESHOLD_DB);
            announce(isSilent
                ? 'Silence detected. Input level is very low — check your microphone.'
                : 'Recording in progress. Input level looks good.');
            lastAnnounceAtRef.current = now;
        }, LEVEL_POLL_INTERVAL_MS);

        return () => clearInterval(intervalId);
    }, [rec.state]);

    const handleToggle = () => {
        if (rec.state === 'recording') {
            rec.stop();
        } else {
            rec.start();
        }
    };

    const isRecording = rec.state === 'recording';
    const isRequesting = rec.state === 'requesting-permission';
    const accessibleName = isRecording
        ? 'Stop recording'
        : isRequesting
            ? 'Requesting microphone access…'
            : 'Start recording';

    return (
        <div className="record-controls">
            {/* Explicit "why we need this" explanation, rendered before any
                getUserMedia call fires (visible in idle / permission-denied). */}
            {(rec.state === 'idle' || rec.state === 'permission-denied') && (
                <p className="record-controls__explanation">
                    Audiobook Studio needs microphone access to record this sample. Audio
                    stays on this device until you choose to upload it.
                </p>
            )}

            {rec.state === 'permission-denied' && (
                <p className="record-controls__permission-denied" role="alert">
                    Microphone access was denied. Enable microphone permissions for this
                    site to record a sample.
                </p>
            )}

            <button
                ref={buttonRef}
                type="button"
                onClick={handleToggle}
                disabled={isRequesting}
                aria-label={accessibleName}
                data-record-toggle-btn=""
                className={isRecording ? 'btn-primary record-controls__btn record-controls__btn--recording' : 'btn-primary record-controls__btn'}
            >
                {isRecording ? '■' : '●'}
            </button>

            <div
                role="meter"
                aria-label="Microphone level"
                aria-valuenow={rec.levelDb}
                aria-valuemin={-60}
                aria-valuemax={0}
                className="record-controls__meter"
            />

            <span className="record-controls__timer">
                {Math.floor(rec.elapsedMs / 1000)}s
            </span>

            {/* Throttled aria-live status channel, separate from the visual
                meter above — real silence detection, not a flood keyed to
                every analyser tick. */}
            <div ref={liveRegionRef} aria-live="polite" aria-atomic="true" className="sr-only" />

            {/* Captured-state UI (task 009): quality verdict, playback, and
                the Keep/Retake group that actually calls onKeep/onRetake. */}
            {rec.state === 'captured' && playbackUrl && (
                <div className="record-controls__captured">
                    <p
                        className={verdict?.ok === false ? 'record-controls__verdict record-controls__verdict--fail' : 'record-controls__verdict'}
                        role={verdict?.ok === false ? 'alert' : undefined}
                    >
                        {verdict === null
                            ? 'Checking recording quality…'
                            : verdict.ok
                                ? 'Quality check passed.'
                                : verdict.message}
                    </p>

                    <button
                        ref={playbackButtonRef}
                        type="button"
                        onClick={handlePlayback}
                        data-take-playback-btn=""
                        className="btn-ghost record-controls__btn"
                    >
                        Play back
                    </button>
                    <audio ref={audioRef} src={playbackUrl} controls onEnded={handlePlaybackEnded} onPause={handlePlaybackEnded} />

                    <div role="group" aria-label="Keep or retake this recording" className="record-controls__keep-retake">
                        <button
                            ref={keepButtonRef}
                            type="button"
                            onClick={handleKeep}
                            disabled={!verdict?.ok}
                            data-take-keep-btn=""
                            className="btn-primary record-controls__btn"
                        >
                            Keep
                        </button>
                        <button
                            type="button"
                            onClick={handleRetake}
                            data-take-retake-btn=""
                            className="btn-ghost record-controls__btn"
                        >
                            Retake
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
