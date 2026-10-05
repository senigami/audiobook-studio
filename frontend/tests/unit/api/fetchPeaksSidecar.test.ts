/**
 * fetchPeaksSidecar.test.ts
 *
 * Tests for frontend/src/api/fetchPeaksSidecar.ts (task 008) — derives the
 * peaks sidecar URL from a chapter audio URL and fetches/validates the
 * server-computed peaks payload (app/api/routers/chapters_assets.py).
 *
 * Mocks (R2 — boundaries outside the unit): `fetch` (external network
 * boundary) only. derivePeaksUrl/fetchPeaksSidecar/parsePeaksSidecar
 * themselves are the unit under test and are never mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { derivePeaksUrl, fetchPeaksSidecar } from '@/api/fetchPeaksSidecar';

const CHAPTER_AUDIO_URL =
  '/api/projects/proj1/chapters/ch1/assets/audio?filename=chapter.wav';

function validSidecarPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    version: 2, // must match CURRENT_SIDECAR_VERSION / backend SIDECAR_VERSION

    peaks: [0, 0.25, 0.5, 0.75, 1],
    duration_sec: 120,
    sample_rate: 44100,
    channels: 1,
    peaks_per_sec: 10,
    source: { filename: 'chapter.wav', size_bytes: 1234, mtime_ns: 1 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('derivePeaksUrl', () => {
  it('returns the derived /assets/peaks URL for a chapter audio URL, preserving the filename query param', () => {
    expect(derivePeaksUrl(CHAPTER_AUDIO_URL)).toBe(
      '/api/projects/proj1/chapters/ch1/assets/peaks?filename=chapter.wav',
    );
  });

  it('returns null for a segment-shaped asset URL', () => {
    expect(derivePeaksUrl('/api/projects/proj1/chapters/ch1/assets/segment?filename=seg1.wav')).toBeNull();
  });

  it('returns null for a preview URL (different route entirely)', () => {
    expect(derivePeaksUrl('/api/chapters/ch1/preview')).toBeNull();
  });

  it('returns null for a sample URL', () => {
    expect(derivePeaksUrl('/api/voices/v1/samples/preview.mp3')).toBeNull();
  });

  it('returns null for an arbitrary external URL with no /assets/audio substring', () => {
    expect(derivePeaksUrl('https://example.com/seek-test.mp3')).toBeNull();
  });
});

describe('fetchPeaksSidecar', () => {
  it('returns null without calling fetch when the URL is not a chapter-asset shape', async () => {
    const result = await fetchPeaksSidecar('https://example.com/seg.mp3');
    expect(result).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('fetches the derived peaks URL and returns the validated peaks array on success', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validSidecarPayload()),
    });

    const result = await fetchPeaksSidecar(CHAPTER_AUDIO_URL);

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/projects/proj1/chapters/ch1/assets/peaks?filename=chapter.wav',
    );
    expect(result).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it('returns null on a 404 response', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    });

    const result = await fetchPeaksSidecar(CHAPTER_AUDIO_URL);
    expect(result).toBeNull();
  });

  it('returns null when the response body is malformed JSON (fetch throws)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('invalid JSON')),
    });

    const result = await fetchPeaksSidecar(CHAPTER_AUDIO_URL);
    expect(result).toBeNull();
  });

  it('returns null when the network request itself rejects', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));

    const result = await fetchPeaksSidecar(CHAPTER_AUDIO_URL);
    expect(result).toBeNull();
  });

  it('returns null when the payload fails contract validation (wrong version)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(validSidecarPayload({ version: 1 })),
    });

    const result = await fetchPeaksSidecar(CHAPTER_AUDIO_URL);
    expect(result).toBeNull();
  });
});
