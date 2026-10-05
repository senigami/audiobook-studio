import { parseChapterTimingPayload, type ChapterTimingPayload } from './contracts/chapterTiming';

/**
 * Fetches and validates the `chapter_segment_timing` sidecar for a chapter
 * (synced-reader plan, Task 5 serving route:
 * GET /api/projects/{project_id}/chapters/{chapter_id}/timing). Returns null
 * (never throws) on a 404 (no sidecar / stale / invalid — the route treats
 * all of these as "no usable timing", not as an error to surface), a
 * network failure, or a payload that fails contract validation.
 */
export async function fetchChapterTiming(
  projectId: string,
  chapterId: string,
): Promise<ChapterTimingPayload | null> {
  try {
    const res = await fetch(`/api/projects/${projectId}/chapters/${chapterId}/timing`);
    if (!res.ok) return null;
    return parseChapterTimingPayload(await res.json());
  } catch {
    return null;
  }
}
