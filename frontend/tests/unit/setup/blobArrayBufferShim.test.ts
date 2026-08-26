/**
 * blobArrayBufferShim.test.ts
 *
 * Pins the `Blob.prototype.arrayBuffer` shim in `tests/setup/vitest.setup.ts`.
 * jsdom ships no `arrayBuffer()`, and the shim that used to fill the gap routed
 * through undici's `Response`, which behaves differently per Node version: it
 * threw on Node 20/22 and silently returned the 13 bytes of the string
 * "[object Blob]" on Node 24. That is why the VoiceLab recording tests passed
 * locally and failed in CI (issue #214).
 *
 * Both expectations below come from outside the shim: byte values are spelled out
 * as literals, never recomputed from the blob or from the implementation.
 */
import { describe, it, expect, vi } from 'vitest';

// "abc" and "\n" in UTF-8, written out rather than derived.
const ABC_BYTES = [0x61, 0x62, 0x63];
// A non-ASCII string, to catch anything that round-trips through a lossy
// string coercion instead of reading the blob's actual bytes.
const POUND_SIGN_UTF8_BYTES = [0xc2, 0xa3];

async function bytesOf(blob: Blob): Promise<number[]> {
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
}

describe('Blob.prototype.arrayBuffer shim', () => {
    it('returns the blob\'s own bytes, not a stringified placeholder', async () => {
        expect(await bytesOf(new Blob(['abc']))).toEqual(ABC_BYTES);
    });

    it('preserves multi-byte UTF-8 content', async () => {
        expect(await bytesOf(new Blob(['£']))).toEqual(POUND_SIGN_UTF8_BYTES);
    });

    it('reads bytes for a blob carrying a media type, as recorded takes do', async () => {
        const take = new Blob(['abc'], { type: 'audio/webm' });
        expect(take.type).toBe('audio/webm');
        expect(await bytesOf(take)).toEqual(ABC_BYTES);
    });

    it('honours slice(), so partial reads are not silently full reads', async () => {
        expect(await bytesOf(new Blob(['abc']).slice(1))).toEqual(ABC_BYTES.slice(1));
    });

    // The reason the shim does not use jsdom's FileReader: fake timers stall it,
    // and a test reading a captured take under fake timers would hang instead of
    // failing. R4 forbids sleep-based waits, so this asserts settlement directly.
    it('settles under fake timers without any timer being advanced', async () => {
        vi.useFakeTimers();
        try {
            expect(await bytesOf(new Blob(['abc']))).toEqual(ABC_BYTES);
        } finally {
            vi.useRealTimers();
        }
    });
});
