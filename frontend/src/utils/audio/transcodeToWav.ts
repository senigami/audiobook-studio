/**
 * transcodeToWav.ts — task 009 (voice-card-consolidation, P8)
 *
 * Client-side WebM/Opus (MediaRecorder's default output) -> WAV conversion
 * (INV-REC-5): the backend upload endpoint does zero format validation and
 * writes bytes verbatim, so this repo's WAV requirement is satisfied
 * entirely before `uploadFiles` is called, never on the server.
 *
 * Approach (R4 from 01-map.md): decode via `OfflineAudioContext.
 * decodeAudioData`, then hand-roll a 44-byte RIFF/WAVE header + 16-bit PCM
 * data. A hand-rolled encoder was chosen over pulling in a WAV-encoding
 * library — the container format is small and fixed (mono/stereo PCM), this
 * repo has no existing audio-encoding dependency to extend (confirmed:
 * `wavesurfer.js` is a playback/visualization library, not an encoder), and
 * a ~40-line encoder keeps the dependency footprint unchanged.
 */

function encodeWavPcm16(audioBuffer: AudioBuffer): Blob {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const numFrames = audioBuffer.length;
    const bytesPerSample = 2; // 16-bit PCM
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = numFrames * blockAlign;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    // RIFF/WAVE header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size (PCM)
    view.setUint16(20, 1, true); // audio format = PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true); // byte rate
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Interleaved PCM samples, clamped to [-1, 1] and scaled to signed 16-bit.
    const channelData: Float32Array[] = [];
    for (let channel = 0; channel < numChannels; channel++) {
        channelData.push(audioBuffer.getChannelData(channel));
    }

    let offset = 44;
    for (let frame = 0; frame < numFrames; frame++) {
        for (let channel = 0; channel < numChannels; channel++) {
            const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
            const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
            view.setInt16(offset, intSample, true);
            offset += bytesPerSample;
        }
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

export async function transcodeToWav(blob: Blob): Promise<Blob> {
    const arrayBuffer = await blob.arrayBuffer();
    const OfflineAudioContextCtor = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    // A throwaway context is used purely for its `decodeAudioData` — its
    // own render-graph length/sample-rate don't matter, only the decoded
    // buffer's own properties (sampleRate/channels/length) do.
    const audioCtx = new OfflineAudioContextCtor(1, 1, 44100);
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    return encodeWavPcm16(decoded);
}
