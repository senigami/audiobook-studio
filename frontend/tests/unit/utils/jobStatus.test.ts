import { describe, it, expect } from 'vitest';
import { ACTIVE_STATUSES, HAS_LIVE_ETA_STATUSES, isPendingJobStatus } from '@/utils/jobStatus';

describe('job status sets', () => {
  it('treats a job waiting for resources as active but without a live ETA', () => {
    expect(ACTIVE_STATUSES.has('waiting_for_resources')).toBe(true);
    expect(HAS_LIVE_ETA_STATUSES.has('waiting_for_resources')).toBe(false);
  });

  it('does not know processing as a job status', () => {
    expect(ACTIVE_STATUSES.has('processing')).toBe(false);
    expect(HAS_LIVE_ETA_STATUSES.has('processing')).toBe(false);
  });

  it('treats queued and waiting_for_resources as pending, nothing else', () => {
    expect(isPendingJobStatus('queued')).toBe(true);
    expect(isPendingJobStatus('waiting_for_resources')).toBe(true);
    for (const s of ['preparing', 'running', 'finalizing', 'done', 'failed', 'cancelled', undefined]) {
      expect(isPendingJobStatus(s)).toBe(false);
    }
  });
});
