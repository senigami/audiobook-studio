import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest'

// Mock global fetch
global.fetch = vi.fn()

// JSDOM does not implement matchMedia. Default to "no query matches" (e.g.
// prefers-reduced-motion: reduce is OFF) so any component reading it during
// render (PlayerBar's reduced-motion check, etc.) doesn't crash in tests that
// don't care about the value. Individual test files that DO care (e.g.
// WaveformTape.test.tsx) already reassign window.matchMedia locally, which
// simply overrides this default for the duration of that file/test.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// JSDOM does not implement Element.prototype.scrollIntoView. Default to a
// no-op so any component calling it during render/effects (e.g. keyboard-nav
// listboxes that scroll the focused option into view) doesn't crash in tests
// that don't care about scroll behavior. Tests that DO care (e.g. the
// ChapterDropdown scroll-containment fixture) spy on this directly.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

// JSDOM's `Blob` implements only constructor/slice/size/type, so recorded-take
// code (task 009's qualityCheck/transcodeToWav pipeline) that reads captured
// Blobs via `.arrayBuffer()` needs a shim. Two traps this has already hit:
//
// 1. It must NOT route through `Response`. Undici does not recognise a jsdom Blob
//    as a Blob, so `new Response(jsdomBlob)` throws on Node 22 ("object.stream is
//    not a function") and on Node 24 silently coerces the blob to the string
//    "[object Blob]", returning those 13 bytes instead of the blob's contents.
//    That divergence is what made the recording tests pass on Node 24 and fail on
//    the Node 20/22 CI runner.
// 2. It must settle without the event loop. jsdom's FileReader queues its work in
//    a way vitest's fake timers stall, so a FileReader-only shim never resolves in
//    a test using `vi.useFakeTimers()`.
//
// So: read jsdom's own byte storage synchronously (its wrapper keeps the impl
// under a symbol, and the impl holds a Node Buffer), and fall back to FileReader
// if a future jsdom stops exposing it. `blobArrayBufferShim.test.ts` pins the
// bytes and the fake-timer behaviour, so losing the fast path fails loudly.
if (typeof Blob !== 'undefined' && !Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
    const impl = Object.getOwnPropertySymbols(this)
      .map((symbol) => (this as any)[symbol])
      .find((candidate) => candidate && Buffer.isBuffer(candidate._buffer));

    if (impl) {
      const stored: Buffer = impl._buffer
      // Copy, so a caller mutating the result cannot corrupt jsdom's own storage.
      const copy = new Uint8Array(stored.byteLength)
      copy.set(stored)
      return Promise.resolve(copy.buffer)
    }

    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error ?? new Error('Blob.arrayBuffer shim: FileReader failed'))
      reader.readAsArrayBuffer(this)
    })
  };
}
