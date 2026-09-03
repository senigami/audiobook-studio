/**
 * useMicRecorder.ts — task 008 (voice-card-consolidation, P7)
 *
 * `MediaRecorder`/`getUserMedia` state machine for the Record-mode capture UI
 * (see `RecordControls.tsx`). Genuinely new to this frontend — no prior
 * MediaRecorder/getUserMedia code existed anywhere before this task.
 *
 * Level metering uses an `AnalyserNode` reading time-domain samples and
 * computing RMS (root-mean-square), converted to dBFS (`20 * log10(rms)`,
 * clamped at -60dB floor to match the `RecordControls` meter's
 * `aria-valuemin={-60}`). RMS was chosen over instantaneous peak because it
 * tracks perceived loudness more smoothly and is what the silence-detector in
 * `RecordControls.tsx` wants (a stable floor read, not per-sample spikes).
 *
 * `reset()` only discards the captured `blob` and returns to `idle` — the
 * non-destructive "don't overwrite until Keep" semantics live in task 009's
 * layer on top of this primitive, not here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'requesting-permission' | 'recording' | 'captured' | 'permission-denied';

const LEVEL_FLOOR_DB = -60;
const METER_INTERVAL_MS = 100;
const TIMER_INTERVAL_MS = 200;

export interface UseMicRecorderResult {
    state: RecorderState;
    levelDb: number;
    elapsedMs: number;
    blob: Blob | null;
    start: () => Promise<void>;
    stop: () => void;
    reset: () => void;
}

export function useMicRecorder(): UseMicRecorderResult {
    const [state, setState] = useState<RecorderState>('idle');
    const [levelDb, setLevelDb] = useState(LEVEL_FLOOR_DB);
    const [elapsedMs, setElapsedMs] = useState(0);
    const [blob, setBlob] = useState<Blob | null>(null);

    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const meterIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startedAtRef = useRef(0);

    const cleanupTimers = useCallback(() => {
        if (meterIntervalRef.current !== null) {
            clearInterval(meterIntervalRef.current);
            meterIntervalRef.current = null;
        }
        if (timerIntervalRef.current !== null) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
    }, []);

    const cleanupAudioGraph = useCallback(() => {
        analyserRef.current = null;
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => { /* already closed / not supported in test env */ });
            audioContextRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
    }, []);

    // Full teardown on unmount so a component unmounting mid-recording doesn't
    // leak the mic stream / audio context / intervals.
    useEffect(() => {
        return () => {
            cleanupTimers();
            cleanupAudioGraph();
        };
    }, [cleanupTimers, cleanupAudioGraph]);

    const start = useCallback(async () => {
        setState('requesting-permission');
        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
            setState('permission-denied');
            return;
        }

        streamRef.current = stream;

        // Level metering: AudioContext + AnalyserNode reading time-domain
        // samples, converted to an RMS-based dBFS reading.
        const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
        const audioContext = new AudioContextCtor();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        analyserRef.current = analyser;

        const timeDomainData = new Uint8Array(analyser.fftSize);
        meterIntervalRef.current = setInterval(() => {
            analyser.getByteTimeDomainData(timeDomainData);
            let sumSquares = 0;
            for (let i = 0; i < timeDomainData.length; i++) {
                // Byte time-domain samples are centered at 128; normalize to [-1, 1].
                const normalized = (timeDomainData[i] - 128) / 128;
                sumSquares += normalized * normalized;
            }
            const rms = Math.sqrt(sumSquares / timeDomainData.length);
            const db = rms > 0 ? 20 * Math.log10(rms) : LEVEL_FLOOR_DB;
            setLevelDb(Math.max(LEVEL_FLOOR_DB, db));
        }, METER_INTERVAL_MS);

        chunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (event: BlobEvent) => {
            if (event.data && event.data.size > 0) {
                chunksRef.current.push(event.data);
            }
        };
        recorder.onstop = () => {
            const captured = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
            setBlob(captured);
            setState('captured');
        };
        recorderRef.current = recorder;
        recorder.start();

        startedAtRef.current = Date.now();
        setElapsedMs(0);
        timerIntervalRef.current = setInterval(() => {
            setElapsedMs(Date.now() - startedAtRef.current);
        }, TIMER_INTERVAL_MS);

        setState('recording');
    }, []);

    const stop = useCallback(() => {
        cleanupTimers();
        setLevelDb(LEVEL_FLOOR_DB);
        recorderRef.current?.stop();
        cleanupAudioGraph();
    }, [cleanupTimers, cleanupAudioGraph]);

    const reset = useCallback(() => {
        setBlob(null);
        setElapsedMs(0);
        setLevelDb(LEVEL_FLOOR_DB);
        setState('idle');
    }, []);

    return { state, levelDb, elapsedMs, blob, start, stop, reset };
}
