import type { Job } from '@/types';
import { isChapterScopedJob, pickRelevantJob } from '@/utils/jobSelection';

const DEFAULT_RECENT_DONE_WINDOW_SECONDS = 60;

export interface ChapterEditorJobState {
  job?: Job;
  chapterJobs: Job[];
  includeDoneForEditor: boolean;
}

interface SelectChapterEditorJobsOptions {
  jobs: Record<string, Job>;
  projectId: string;
  chapterId?: string | null;
  chapterAudioStatus?: string | null;
  chapterHasRenderedOutput?: boolean;
  recentDoneWindowSeconds?: number;
  nowSeconds?: number;
}

export function selectChapterEditorJobs({
  jobs,
  projectId,
  chapterId,
  chapterAudioStatus,
  chapterHasRenderedOutput = false,
  recentDoneWindowSeconds = DEFAULT_RECENT_DONE_WINDOW_SECONDS,
  nowSeconds = Date.now() / 1000,
}: SelectChapterEditorJobsOptions): ChapterEditorJobState {
  if (!projectId || !chapterId) {
    return {
      job: undefined,
      chapterJobs: [],
      includeDoneForEditor: false,
    };
  }

  const rawMatchingJobs = Object.values(jobs).filter((job) => (
    job.project_id === projectId && (
      job.chapter_id === chapterId || job.chapter_file?.includes(chapterId || 'none')
    )
  ));

  const rawChapterRenderJobs = rawMatchingJobs.filter(isChapterScopedJob);
  const newestChapterScopedJob = pickRelevantJob(rawChapterRenderJobs, true);

  const matchingChapterJobs = rawMatchingJobs.filter((job) => (
    !isChapterScopedJob(job) || (newestChapterScopedJob && job.id === newestChapterScopedJob.id)
  ));

  const chapterRenderJobs = matchingChapterJobs.filter(isChapterScopedJob);
  const includeDoneForEditor = chapterAudioStatus !== 'processing'
    && !chapterHasRenderedOutput
    && chapterRenderJobs.some((job) => (
      job.status === 'done'
      && !!job.finished_at
      && (nowSeconds - job.finished_at) <= recentDoneWindowSeconds
    ));

  return {
    job: pickRelevantJob(chapterRenderJobs, includeDoneForEditor),
    chapterJobs: matchingChapterJobs,
    includeDoneForEditor,
  };
}
