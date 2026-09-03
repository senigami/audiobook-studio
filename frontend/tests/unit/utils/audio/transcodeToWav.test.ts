/**
 * transcodeToWav.test.ts — task 009 (voice-card-consolidation, P8)
 *
 * jsdom has no real `OfflineAudioContext`/`decodeAudioData`, so `decodeAudioData`
 * is mocked (boundary mock, R2 — an external Web Audio decode API, not the
 * unit under test) to return a synthetic `AudioBuffer`. The encoder itself
 * (the WAV header + PCM interleaving) is real, unmocked code, and is verified
 * by reading the resulting `Blob`'s actual bytes.
 */
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { transcodeToWav } from '@/utils/audio/transcodeToWav';

// jsdom's own `Blob` doesn't implement `.arrayBuffer()` (confirmed: only
// Node's global `Blob` does), so this file substitutes Node's spec-compliant
// `Blob` for the duration of these tests — a boundary substitution for a
// jsdom gap, not a mock of the encoder under test.
const jsdomBlob = globalThis.Blob;

function makeMockAudioBuffer(channelSamples: number[][], sampleRate = 44100): AudioBuffer {
    return {
        numberOfChannels: channelSamples.length,
        length: channelSamples[0].length,
        sampleRate,
        duration: channelSamples[0].length / sampleRate,
        getChannelData: (channel: number) => Float32Array.from(channelSamples[channel]),
    } as unknown as AudioBuffer;
}

function installOfflineAudioContextMock(audioBuffer: AudioBuffer) {
    const decodeAudioData = vi.fn().mockResolvedValue(audioBuffer);
    const ctor = vi.fn().mockImplementation(() => ({ decodeAudioData }));
    vi.stubGlobal('OfflineAudioContext', ctor);
    return { decodeAudioData, ctor };
}

async function readWavHeader(blob: Blob) {
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    const readAscii = (offset: number, length: number) =>
        Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join('');
    return {
        riff: readAscii(0, 4),
        wave: readAscii(8, 4),
        fmt: readAscii(12, 4),
        audioFormat: view.getUint16(20, true),
        numChannels: view.getUint16(22, true),
        sampleRate: view.getUint32(24, true),
        bitsPerSample: view.getUint16(34, true),
        dataTag: readAscii(36, 4),
        dataSize: view.getUint32(40, true),
        view,
    };
}

describe('transcodeToWav', () => {
    beforeAll(() => {
        globalThis.Blob = NodeBlob;
    });

    afterAll(() => {
        globalThis.Blob = jsdomBlob;
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('produces a Blob with a valid RIFF/WAVE PCM16 header', async () => {
        const audioBuffer = makeMockAudioBuffer([[0, 0.5, -0.5, 0]], 44100);
        installOfflineAudioContextMock(audioBuffer);

        const wavBlob = await transcodeToWav(new Blob(['fake-webm-bytes']));
        expect(wavBlob.type).toBe('audio/wav');

        const header = await readWavHeader(wavBlob);
        expect(header.riff).toBe('RIFF');
        expect(header.wave).toBe('WAVE');
        expect(header.fmt).toBe('fmt ');
        expect(header.audioFormat).toBe(1); // PCM
        expect(header.numChannels).toBe(1);
        expect(header.sampleRate).toBe(44100);
        expect(header.bitsPerSample).toBe(16);
        expect(header.dataTag).toBe('data');
        expect(header.dataSize).toBe(4 * 2); // 4 samples * 2 bytes (16-bit)
    });

    it('round-trips known PCM sample values correctly', async () => {
        const audioBuffer = makeMockAudioBuffer([[1, -1, 0]], 44100);
        installOfflineAudioContextMock(audioBuffer);

        const wavBlob = await transcodeToWav(new Blob(['fake-webm-bytes']));
        const header = await readWavHeader(wavBlob);

        expect(header.view.getInt16(44, true)).toBe(0x7fff); // +1.0 -> max positive int16
        expect(header.view.getInt16(46, true)).toBe(-0x8000); // -1.0 -> max negative int16
        expect(header.view.getInt16(48, true)).toBe(0);
    });

    it('interleaves stereo channels correctly', async () => {
        const audioBuffer = makeMockAudioBuffer([[1, 0], [-1, 0]], 44100);
        installOfflineAudioContextMock(audioBuffer);

        const wavBlob = await transcodeToWav(new Blob(['fake-webm-bytes']));
        const header = await readWavHeader(wavBlob);

        expect(header.numChannels).toBe(2);
        // Frame 0: left=+1.0, right=-1.0; interleaved L,R.
        expect(header.view.getInt16(44, true)).toBe(0x7fff);
        expect(header.view.getInt16(46, true)).toBe(-0x8000);
    });
});
