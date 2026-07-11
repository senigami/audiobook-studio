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
