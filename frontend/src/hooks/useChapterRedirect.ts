import { useEffect, useState } from 'react';
import { useMatch } from 'react-router-dom';
import { api } from '@/api';
import type { Chapter } from '@/types';

// Resolves the parent project for a legacy `/chapter/:chapterId` deep link so
// it can redirect into the chapter workspace at `/book/:projectId/chapter/:chapterId`.
export const useChapterRedirect = () => {
  const chapterMatch = useMatch('/chapter/:chapterId');
  const chapterIdFromRoute = chapterMatch?.params.chapterId;
  const [chapterRouteData, setChapterRouteData] = useState<Chapter | null>(null);
  const [chapterRouteLoading, setChapterRouteLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!chapterIdFromRoute) {
      setChapterRouteData(null);
      setChapterRouteLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setChapterRouteLoading(true);
    api.fetchChapter(chapterIdFromRoute)
      .then(chapter => {
        if (!cancelled) {
          setChapterRouteData(chapter);
        }
      })
      .catch(err => {
        if (!cancelled) {
          console.error('Failed to load chapter route data', err);
          setChapterRouteData(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setChapterRouteLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chapterIdFromRoute]);

  return { chapterIdFromRoute, chapterRouteData, chapterRouteLoading };
};
