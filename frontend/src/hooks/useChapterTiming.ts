import { useEffect, useRef, useState } from 'react';
import { fetchChapterTiming } from '@/api/fetchChapterTiming';
import type { ChapterTimingGroup } from '@/api/contracts/chapterTiming';

export interface UseChapterTimingResult {
  groups: ChapterTimingGroup[];
  audioDurationMs: number;
}

/**
 * Fetches the chapter timing sidecar (synced-reader plan, Task 5 route:
 * GET /api/projects/{projectId}/chapters/{chapterId}/timing) and returns
 * `{ groups, audioDurationMs }`, or `null` when no usable timing exists
 * (404 — no sidecar, stale, or invalid; treated as "no timing," not an
 * error).
 *
 * No cross-mount cache: this repo has no invalidation signal fired anywhere
 * when a chapter finishes re-rendering (checked — the closest analog, the
 * peaks sidecar fetched in `PlayerBar.tsx`, has the same property: it just
 * refetches whenever its own dependencies change rather than caching across
 * mounts; `queue_item_invalidated`/`project_invalidated` are queue-list
 * signals, not a render-completion event). Without such a signal, caching
 * this hook's result across mounts would let an already-cached mount keep
 * serving stale timing against newly rendered audio — even though the
 * backend route itself correctly 404s a stale sidecar via its own
 * `audio_generated_at` check. So this hook always fetches fresh on mount,
 * matching `useRenderGroups.ts`/`useChapterAnalysis.ts`'s existing pattern.
 */
export function useChapterTiming(chapterId: string, projectId: string): UseChapterTimingResult | null {
  const [result, setResult] = useState<UseChapterTimingResult | null>(null);

  // Monotonically increasing request counter; only the latest request's
  // response is applied (matches useRenderGroups.ts's stale-response guard).
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!projectId || !chapterId) {
      setResult(null);
      return;
    }

    setResult(null);
    const myRequestId = ++requestIdRef.current;
    fetchChapterTiming(projectId, chapterId).then(payload => {
      if (requestIdRef.current !== myRequestId) return; // stale

      if (!payload) {
        setResult(null);
        return;
      }
      setResult({ groups: payload.groups, audioDurationMs: payload.audio_duration_ms });
    });
  }, [projectId, chapterId]);

  return result;
}
