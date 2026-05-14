import type { ProcessingQueueItem } from '@/types';
import { formatVoiceEngineLabel } from '@/utils/voiceProfiles';

export function formatQueueContext(job: ProcessingQueueItem, engines: import('@/types').TtsEngine[] = []): string {
  if (!job.project_name) {
    const meta = engines.find(e => e.engine_id === job.engine);
    if (meta) return `${meta.display_name} Synthesis`;

    switch (job.engine) {
      case 'voice_test':
        return 'Voice Preview';
      case 'voice_build':
        return 'Voice Build';
      case 'audiobook':
        return 'Audiobook Assembly';
      case 'mixed':
        return 'Mixed Engine Synthesis';
      default:
        return `${formatVoiceEngineLabel(job.engine)} Synthesis`;
    }
  }

  if ((job.split_part ?? 0) > 0) {
    return `${job.project_name} • Part ${job.split_part + 1}`;
  }

  return job.project_name;
}
