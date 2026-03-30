import type { ProcessingQueueItem } from '../types';

export function formatQueueContext(job: ProcessingQueueItem): string {
  if (!job.project_name) {
    return 'Internal Process';
  }

  if ((job.split_part ?? 0) > 0) {
    return `${job.project_name} • Part ${job.split_part + 1}`;
  }

  return job.project_name;
}
