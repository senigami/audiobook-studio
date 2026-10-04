import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useChapterStatus } from '@/pages/ChapterEditor/components/useChapterStatus';
import type { Chapter, Job } from '@/types';

const chapter = { id: 'chap-1', project_id: 'proj-1', title: 'Chapter 1', audio_status: 'unprocessed' } as unknown as Chapter;

describe('useChapterStatus', () => {
  it.each(['queued', 'waiting_for_resources'])('reads a %s job as Queued', (status) => {
    const job = { id: 'job-1', chapter_id: 'chap-1', status, progress: 0 } as unknown as Job;
    const { result } = renderHook(() => useChapterStatus(chapter, job));
    expect(result.current.queueStatus).toBe('Queued');
    expect(result.current.isQueued).toBe(true);
  });
});
