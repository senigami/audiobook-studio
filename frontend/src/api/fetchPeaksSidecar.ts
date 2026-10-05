import { parsePeaksSidecar } from './contracts/peaksSidecar';

/**
 * Derives the peaks URL from a chapter audio URL by replacing the /assets/audio
 * path segment with /assets/peaks (same `filename` query param). Returns null
 * for URLs that don't match the chapter-asset shape (segment/preview/sample
 * URLs use a different route entirely) so callers never fire a request for them.
 */
export function derivePeaksUrl(audioUrl: string): string | null {
  if (!audioUrl.includes('/assets/audio')) return null;
  return audioUrl.replace('/assets/audio', '/assets/peaks');
}

/**
 * Fetches and validates the server-computed peaks sidecar for a chapter audio
 * URL. Returns null (never throws) when the URL isn't a chapter-asset shape,
 * the request fails/404s, or the payload doesn't match the contract — callers
 * fall back to browser decode in all of those cases.
 */
export async function fetchPeaksSidecar(audioUrl: string): Promise<number[] | null> {
  const peaksUrl = derivePeaksUrl(audioUrl);
  if (!peaksUrl) return null;
  try {
    const res = await fetch(peaksUrl);
    if (!res.ok) return null;
    return parsePeaksSidecar(await res.json());
  } catch {
    return null;
  }
}
