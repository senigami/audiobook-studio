import { useState, useEffect, useRef } from 'react';
import { api } from '@/api';

export interface UseRenderGroupsResult {
  count: number | null;
  groupNumberBySegmentId: Map<string, number>;
  firstSpanGroupNumber: Map<string, number>;
}

/**
 * Fetches render group data for a chapter.
 * - Refetches whenever refreshKey changes.
 * - Latest-wins: stale responses are ignored via a request-id counter.
 * - Errors are swallowed; count returns null and maps are empty.
 */
export function useRenderGroups(
  projectId: string,
  chapterId: string,
  refreshKey: number,
): UseRenderGroupsResult {
  const [count, setCount] = useState<number | null>(null);
  const [groupNumberBySegmentId, setGroupNumberBySegmentId] = useState<Map<string, number>>(new Map());
  const [firstSpanGroupNumber, setFirstSpanGroupNumber] = useState<Map<string, number>>(new Map());

  // Monotonically increasing request counter; only the latest request's response is applied.
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!projectId || !chapterId) return;

    const myRequestId = ++requestIdRef.current;

    api.fetchChapterRenderGroups(projectId, chapterId)
      .then((data) => {
        if (requestIdRef.current !== myRequestId) return; // stale

        const bySegment = new Map<string, number>();
        const firstOnly = new Map<string, number>();

        data.groups.forEach((group, idx) => {
          const groupNumber = idx + 1;
          group.segment_ids.forEach((sid, sidIdx) => {
            bySegment.set(sid, groupNumber);
            if (sidIdx === 0) {
              firstOnly.set(sid, groupNumber);
            }
          });
        });

        setCount(data.count);
        setGroupNumberBySegmentId(bySegment);
        setFirstSpanGroupNumber(firstOnly);
      })
      .catch(() => {
        if (requestIdRef.current !== myRequestId) return;
        setCount(null);
        setGroupNumberBySegmentId(new Map());
        setFirstSpanGroupNumber(new Map());
      });
  }, [projectId, chapterId, refreshKey]);

  return { count, groupNumberBySegmentId, firstSpanGroupNumber };
}
