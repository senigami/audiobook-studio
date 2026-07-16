/**
 * mediaRecorderMocks.ts — task 008 (voice-card-consolidation, P7)
 *
 * jsdom implements neither `MediaRecorder` nor `navigator.mediaDevices.
 * getUserMedia` nor a usable `AudioContext`/`AnalyserNode` graph, so
 * `useMicRecorder.test.tsx` / `RecordControls.test.tsx` install these mocks
 * before each test. `setMockLevel()` lets a test drive the fake analyser's
 * reported level (e.g. near-silence for the silence-detection assertions).
 */
import { vi } from 'vitest';

let currentLevel = 0.5; // normalized amplitude in [0, 1], fed into the fake time-domain buffer

export function setMockLevel(level: number) {
    currentLevel = level;
}

export function resetMockLevel() {
    currentLevel = 0.5;
}

class MockMediaStreamTrack {
    stop = vi.fn();
}

class MockMediaStream {
    private tracks = [new MockMediaStreamTrack()];
    getTracks() {
        return this.tracks;
    }
}

export class MockMediaRecorder {
    static instances: MockMediaRecorder[] = [];
    mimeType = 'audio/webm';
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    private stream: MediaStream;

    constructor(stream: MediaStream) {
        this.stream = stream;
        MockMediaRecorder.instances.push(this);
    }

    start = vi.fn(() => {
        // no-op; real capture happens on stop()
    });

    stop = vi.fn(() => {
        this.ondataavailable?.({ data: new Blob(['fake-audio-bytes'], { type: this.mimeType }) });
        this.onstop?.();
    });
}

class MockAnalyserNode {
    fftSize = 2048;
    connect = vi.fn();
    getByteTimeDomainData(array: Uint8Array) {
        const byteValue = Math.round(128 + currentLevel * 127);
        array.fill(byteValue);
    }
}

// A 2s, non-silent, non-clipping tone by default -- so `checkSampleQuality`
// (called by `RecordControls`'s captured-state effect, task 009) resolves to
// `ok: true` unless a test overrides `decodeAudioData` itself.
function makeDefaultDecodedBuffer(): AudioBuffer {
    return makeToneBuffer(0.3);
}

// Exported so tests can request a clipping (or otherwise non-default) take
// via `installMediaRecorderMocks({ decodedBuffer })` -- e.g. `makeToneBuffer(1.0)`
// produces samples at full scale, which `checkSampleQuality` flags as clipping.
export function makeToneBuffer(amplitude: number, seconds = 2): AudioBuffer {
    const sampleRate = 44100;
    const numSamples = Math.round(sampleRate * seconds);
    const data = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
        data[i] = amplitude * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    }
    return {
        numberOfChannels: 1,
        length: numSamples,
        sampleRate,
        duration: numSamples / sampleRate,
        getChannelData: () => data,
    } as unknown as AudioBuffer;
}

function makeMockAudioContextClass(decodedBuffer: AudioBuffer) {
    return class {
        createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
        createAnalyser = vi.fn(() => new MockAnalyserNode());
        decodeAudioData = vi.fn(() => Promise.resolve(decodedBuffer));
        close = vi.fn(() => Promise.resolve());
    };
}

export function installMediaRecorderMocks({
    denyPermission = false,
    decodedBuffer,
}: { denyPermission?: boolean; decodedBuffer?: AudioBuffer } = {}) {
    MockMediaRecorder.instances = [];
    resetMockLevel();

    const MockAudioContext = makeMockAudioContextClass(decodedBuffer ?? makeDefaultDecodedBuffer());
    (globalThis as any).MediaRecorder = MockMediaRecorder;
    (globalThis as any).AudioContext = MockAudioContext;
    (window as any).AudioContext = MockAudioContext;

    // jsdom implements neither `URL.createObjectURL`/`revokeObjectURL` — used
    // by RecordControls'/TakeManager's captured-state playback UI (task 009).
    // Each call returns a distinct URL so tests can tell separate takes apart.
    if (!global.URL.createObjectURL) {
        let counter = 0;
        global.URL.createObjectURL = vi.fn(() => `blob:fake-take-url-${++counter}`);
    }
    if (!global.URL.revokeObjectURL) {
        global.URL.revokeObjectURL = vi.fn();
    }

    Object.defineProperty(global.navigator, 'mediaDevices', {
        value: {
            getUserMedia: vi.fn(() =>
                denyPermission
                    ? Promise.reject(new DOMException('Permission denied', 'NotAllowedError'))
                    : Promise.resolve(new MockMediaStream() as unknown as MediaStream)
            ),
        },
        configurable: true,
    });
}
