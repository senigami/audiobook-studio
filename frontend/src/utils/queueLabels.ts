import type { ProcessingQueueItem } from '../types';

export function formatQueueContext(job: ProcessingQueueItem): string {
  if (!job.project_name) {
    switch (job.engine) {
      case 'voice_test':
        return 'Voice Preview';
      case 'voice_build':
        return 'Voice Build';
      case 'audiobook':
        return 'Audiobook Assembly';
      case 'voxtral':
        return 'Voxtral Generation';
      case 'mixed':
        return 'Mixed Engine Generation';
      case 'xtts':
        return 'XTTS Generation';
      default:
        return 'Internal Process';
    }
  }

  if ((job.split_part ?? 0) > 0) {
    return `${job.project_name} • Part ${job.split_part + 1}`;
  }

  return job.project_name;
}
