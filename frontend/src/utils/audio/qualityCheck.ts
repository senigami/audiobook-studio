/**
 * qualityCheck.ts — task 009 (voice-card-consolidation, P8)
 *
 * Capture-time quality gate for a recorded take (INV-REC-3): a duration
 * floor, a peak-amplitude clipping check, and an RMS-based silence check,
 * run against the decoded `AudioBuffer` before "Keep" is enabled in
 * `TakeManager.tsx`. Returns a full verdict object (not just a boolean) so
 * the UI can show WHY a take failed.
 *
 * Owner-requested (2026-07-16): clipping is a WARNING, not a hard block --
 * the recording is still usable, and the owner wants the choice to keep it
 * anyway. Duration-too-short and silence remain hard blocks (genuinely
 * unusable audio, nothing to "keep anyway"). `hasClipping` (already part of
 * the verdict) is what the UI uses to decide whether to show the warning
 * styling; `ok` only reflects whether Keep should be disabled.
 */

const MIN_DURATION_SECONDS = 1;
const CLIPPING_THRESHOLD = 0.98; // samples at/near +-1.0 full scale
const SILENCE_RMS_THRESHOLD = 0.02; // RMS floor below which a buffer is considered silent

export interface QualityVerdict {
    ok: boolean;
    durationSeconds: number;
    hasClipping: boolean;
    isSilent: boolean;
    message?: string;
}

export async function checkSampleQuality(audioBuffer: AudioBuffer): Promise<QualityVerdict> {
    const durationSeconds = audioBuffer.duration;

    let peak = 0;
    let sumSquares = 0;
    let sampleCount = 0;

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        const data = audioBuffer.getChannelData(channel);
        for (let i = 0; i < data.length; i++) {
            const value = data[i];
            const abs = Math.abs(value);
            if (abs > peak) peak = abs;
            sumSquares += value * value;
            sampleCount++;
        }
    }

    const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
    const hasClipping = peak >= CLIPPING_THRESHOLD;
    const isSilent = rms < SILENCE_RMS_THRESHOLD;

    if (durationSeconds < MIN_DURATION_SECONDS) {
        return {
            ok: false,
            durationSeconds,
            hasClipping,
            isSilent,
            message: `Recording is too short (${durationSeconds.toFixed(1)}s) — record at least ${MIN_DURATION_SECONDS}s.`,
        };
    }

    if (isSilent) {
        return {
            ok: false,
            durationSeconds,
            hasClipping,
            isSilent,
            message: 'Recording appears silent — check your microphone and retake.',
        };
    }

    if (hasClipping) {
        return {
            ok: true,
            durationSeconds,
            hasClipping,
            isSilent,
            message: 'Recording is clipping — audio is too loud. You can keep it anyway, or move back from the mic and retake.',
        };
    }

    return {
        ok: true,
        durationSeconds,
        hasClipping,
        isSilent,
    };
}
