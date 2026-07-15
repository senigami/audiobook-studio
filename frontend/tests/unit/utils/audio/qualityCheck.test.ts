/**
 * qualityCheck.test.ts — task 009 (voice-card-consolidation, P8)
 *
 * Calls `checkSampleQuality` directly against real, synthetically-crafted
 * `AudioBuffer`-shaped fixtures (no mocking of the function under test,
 * per R2) so the actual RMS/clipping/duration math is exercised — not just
 * a mocked return value, which is reserved for `TakeManager`'s UI-gating
 * test.
 */
import { describe, it, expect } from 'vitest';
import { checkSampleQuality } from '@/utils/audio/qualityCheck';

const SAMPLE_RATE = 44100;

function makeBuffer(samples: number[], channels = 1): AudioBuffer {
    return {
        numberOfChannels: channels,
        length: samples.length,
        sampleRate: SAMPLE_RATE,
        duration: samples.length / SAMPLE_RATE,
        getChannelData: () => Float32Array.from(samples),
    } as unknown as AudioBuffer;
}

function makeSilence(seconds: number): AudioBuffer {
    return makeBuffer(new Array(Math.round(seconds * SAMPLE_RATE)).fill(0));
}

function makeTone(seconds: number, amplitude: number): AudioBuffer {
    const numSamples = Math.round(seconds * SAMPLE_RATE);
    const samples = new Array(numSamples);
    const freq = 440;
    for (let i = 0; i < numSamples; i++) {
        samples[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
    }
    return makeBuffer(samples);
}

describe('checkSampleQuality', () => {
    it('rejects a genuinely silent buffer with isSilent: true', async () => {
        const verdict = await checkSampleQuality(makeSilence(2));
        expect(verdict.ok).toBe(false);
        expect(verdict.isSilent).toBe(true);
        expect(verdict.message).toMatch(/silent/i);
    });

    it('detects clipping when samples sit at/near +-1.0', async () => {
        // A 2s tone at full amplitude will have peak samples at/near 1.0.
        const verdict = await checkSampleQuality(makeTone(2, 1.0));
        expect(verdict.hasClipping).toBe(true);
        expect(verdict.ok).toBe(false);
        expect(verdict.message).toMatch(/clipping/i);
    });

    it('rejects a sub-1s buffer on the duration floor', async () => {
        const verdict = await checkSampleQuality(makeTone(0.5, 0.3));
        expect(verdict.ok).toBe(false);
        expect(verdict.durationSeconds).toBeCloseTo(0.5, 2);
        expect(verdict.message).toMatch(/short/i);
    });

    it('passes a normal, non-clipping, non-silent, long-enough buffer', async () => {
        const verdict = await checkSampleQuality(makeTone(2, 0.3));
        expect(verdict.ok).toBe(true);
        expect(verdict.hasClipping).toBe(false);
        expect(verdict.isSilent).toBe(false);
        expect(verdict.message).toBeUndefined();
    });
});
