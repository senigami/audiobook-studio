import { describe, expect, it } from 'vitest';
import type { Job } from '@/types';
import { selectChapterEditorJobs } from '@/pages/Book/lib/chapterJobs';

function buildJob(overrides: Partial<Job>): Job {
  return {
    id: overrides.id || 'job-1',
    engine: (overrides.engine || 'xtts') as Job['engine'],
    chapter_file: overrides.chapter_file || 'chapter-c1.txt',
    status: (overrides.status || 'queued') as Job['status'],
    created_at: overrides.created_at ?? 100,
    safe_mode: overrides.safe_mode ?? false,
    make_mp3: overrides.make_mp3 ?? false,
    progress: overrides.progress ?? 0,
    warning_count: overrides.warning_count ?? 0,
    project_id: overrides.project_id ?? 'book-1',
    chapter_id: overrides.chapter_id ?? 'c1',
    classification: overrides.classification,
    finished_at: overrides.finished_at,
    started_at: overrides.started_at,
  } as Job;
}

describe('selectChapterEditorJobs', () => {
  it('keeps the newest chapter job and includes recent done jobs for the editor', () => {
    const state = selectChapterEditorJobs({
      jobs: {
        recentDone: buildJob({ id: 'recentDone', status: 'done', created_at: 110, finished_at: 995 }),
        otherProject: buildJob({ id: 'otherProject', project_id: 'book-2', chapter_id: 'c1' }),
      },
      projectId: 'book-1',
      chapterId: 'c1',
      chapterAudioStatus: 'ready',
      chapterHasRenderedOutput: false,
      nowSeconds: 1000,
    });

    expect(state.job?.id).toBe('recentDone');
    expect(state.chapterJobs.map((job) => job.id)).toEqual(['recentDone']);
    expect(state.includeDoneForEditor).toBe(true);
  });

  it('drops done jobs once the chapter is already rendered or still processing', () => {
    const baseJobs = {
      recentDone: buildJob({ id: 'recentDone', status: 'done', created_at: 110, finished_at: 995 }),
    };

    const rendered = selectChapterEditorJobs({
      jobs: baseJobs,
      projectId: 'book-1',
      chapterId: 'c1',
      chapterAudioStatus: 'ready',
      chapterHasRenderedOutput: true,
      nowSeconds: 1000,
    });
    const processing = selectChapterEditorJobs({
      jobs: baseJobs,
      projectId: 'book-1',
      chapterId: 'c1',
      chapterAudioStatus: 'processing',
      chapterHasRenderedOutput: false,
      nowSeconds: 1000,
    });

    expect(rendered.job).toBeUndefined();
    expect(rendered.includeDoneForEditor).toBe(false);
    expect(processing.job).toBeUndefined();
    expect(processing.includeDoneForEditor).toBe(false);
  });
});
