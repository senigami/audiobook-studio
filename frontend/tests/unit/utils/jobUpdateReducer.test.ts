import { describe, it, expect } from 'vitest';
import type { Job } from '@/types';
import { applyJobUpdated, detectNewerRun, applySegmentFieldRules } from '@/utils/jobUpdateReducer';

function makeJob(overrides: Partial<Job> = {}): Job {
    return {
        id: 'job-1',
        engine: 'xtts',
        chapter_file: 'ch.txt',
        status: 'queued',
        progress: 0,
        created_at: 0,
        safe_mode: false,
        make_mp3: false,
        warning_count: 0,
        ...overrides,
    };
}

function makeJobs(job: Job): Record<string, Job> {
    return { [job.id]: job };
}

describe('applyJobUpdated — overlay-only guard', () => {
    it('returns null when overlayOnly and job does not exist', () => {
        const result = applyJobUpdated({}, 'nonexistent', { status: 'running' }, { overlayOnly: true });
        expect(result).toBeNull();
    });

    it('creates a new job entry when not overlayOnly and job does not exist', () => {
        const result = applyJobUpdated({}, 'new-job', { status: 'queued', progress: 0 });
        expect(result).not.toBeNull();
        expect(result!['new-job'].status).toBe('queued');
    });
});

describe('applyJobUpdated — stale-update guard', () => {
    it('returns null (no change) when incoming updated_at is older and no segment fields', () => {
        const old = makeJob({ updated_at: 1000, status: 'running', progress: 0.5 });
        const result = applyJobUpdated(makeJobs(old), 'job-1', { updated_at: 500, status: 'queued', progress: 0.1 });
        expect(result).toBeNull();
    });

    it('passes through segment fields even when updated_at is stale', () => {
        const old = makeJob({ updated_at: 1000, status: 'running' });
        const result = applyJobUpdated(makeJobs(old), 'job-1', {
            updated_at: 500,
            active_segment_id: 'seg-1',
            active_segment_progress: 0.3,
        });
        expect(result).not.toBeNull();
        expect(result!['job-1'].active_segment_id).toBe('seg-1');
        expect(result!['job-1'].active_segment_progress).toBe(0.3);
        // Non-segment field must not bleed through
        expect(result!['job-1'].status).toBe('running');
    });
});

describe('applyJobUpdated — terminal status regression protection', () => {
    it('returns null when terminal job receives a lower-priority status update without segment fields (same run, not newer)', () => {
        // finished_at is set so db_updated_at < finished_at → isNewerRun=false
        const old = makeJob({ status: 'done', progress: 1, updated_at: 2000, finished_at: 2100 });
        // updated_at < old.updated_at → stale guard triggers first, returns null (no segment fields)
        const result = applyJobUpdated(makeJobs(old), 'job-1', { updated_at: 1999, status: 'running', progress: 0.5 });
        expect(result).toBeNull();
    });

    it('allows segment overlay on terminal job — drops status+progress but keeps segment fields (same-run, older updated_at)', () => {
        // Use updated_at OLDER than old so isNewerRun stays false, hitting the terminal guard
        const old = makeJob({ status: 'done', progress: 1, updated_at: 2000, finished_at: 2100 });
        const result = applyJobUpdated(makeJobs(old), 'job-1', {
            updated_at: 1999,
            status: 'running',
            progress: 0.5,
            active_segment_id: 'seg-x',
            active_segment_progress: 0.8,
        });
        // stale guard fires first when updated_at < old.updated_at and segment fields present
        expect(result).not.toBeNull();
        expect(result!['job-1'].active_segment_id).toBe('seg-x');
        expect(result!['job-1'].active_segment_progress).toBe(0.8);
        // stale guard: non-segment fields are not applied
        expect(result!['job-1'].status).toBe('done');
    });
});

describe('applyJobUpdated — progress regression guard', () => {
    it('drops progress when incoming is lower and status is active (not queued/preparing)', () => {
        const old = makeJob({ status: 'running', progress: 0.7, updated_at: 100 });
        const result = applyJobUpdated(makeJobs(old), 'job-1', { updated_at: 200, progress: 0.3 });
        expect(result).not.toBeNull();
        // progress should not regress
        expect(result!['job-1'].progress).toBe(0.7);
    });

    it('allows progress to reset when status is queued (newer run)', () => {
        const old = makeJob({ status: 'done', progress: 1, finished_at: 500 });
        // Simulate a genuine newer run via db timestamps
        const result = applyJobUpdated(makeJobs(old), 'job-1', {
            status: 'queued',
            progress: 0,
            updated_at: 600,
            db_updated_at: 600,
        });
        expect(result).not.toBeNull();
        expect(result!['job-1'].status).toBe('queued');
        expect(result!['job-1'].progress).toBe(0);
    });
});

describe('applyJobUpdated — ETA epsilon guard', () => {
    it('drops eta_seconds update when change is less than 1 second during active status', () => {
        const old = makeJob({ status: 'running', eta_seconds: 100, updated_at: 100 });
        const result = applyJobUpdated(makeJobs(old), 'job-1', { updated_at: 200, eta_seconds: 100.4 });
        expect(result).not.toBeNull();
        // ETA change < 1s should be dropped
        expect(result!['job-1'].eta_seconds).toBe(100);
    });

    it('applies eta_seconds update when change is >= 1 second', () => {
        const old = makeJob({ status: 'running', eta_seconds: 100, updated_at: 100 });
        const result = applyJobUpdated(makeJobs(old), 'job-1', { updated_at: 200, eta_seconds: 95 });
        expect(result).not.toBeNull();
        expect(result!['job-1'].eta_seconds).toBe(95);
    });
});

describe('detectNewerRun', () => {
    it('returns false for non-rollback statuses', () => {
        const old = makeJob({ status: 'done', updated_at: 1000 });
        expect(detectNewerRun(old, { updated_at: 2000 }, 'done')).toBe(false);
        expect(detectNewerRun(old, { updated_at: 2000 }, 'failed')).toBe(false);
    });

    it('returns true when db_updated_at exceeds old updated_at and incoming is queued', () => {
        const old = makeJob({ status: 'done', updated_at: 1000, finished_at: 1100 });
        expect(detectNewerRun(old, { db_updated_at: 2000, updated_at: 2000 }, 'queued')).toBe(true);
    });

    it('returns false when db_updated_at is not newer than old timestamps', () => {
        const old = makeJob({ status: 'done', updated_at: 2000, finished_at: 2100 });
        expect(detectNewerRun(old, { db_updated_at: 1000, updated_at: 1000 }, 'queued')).toBe(false);
    });
});

describe('applySegmentFieldRules', () => {
    it('strips active_segment_* fields from non-segment-progress topics without explicit reset', () => {
        const nextUpdates: Record<string, any> = {
            active_segment_id: 'seg-1',
            active_segment_progress: 0.5,
            status: 'running',
        };
        applySegmentFieldRules(nextUpdates, makeJob(), 'queue.items');
        expect(nextUpdates.active_segment_id).toBeUndefined();
        expect(nextUpdates.active_segment_progress).toBeUndefined();
        // status should survive
        expect(nextUpdates.status).toBe('running');
    });

    it('preserves active_segment_* null reset from jobs.lifecycle', () => {
        const nextUpdates: Record<string, any> = {
            active_segment_id: null,
            active_segment_progress: 0,
            status: 'done',
        };
        applySegmentFieldRules(nextUpdates, makeJob({ status: 'running' }), 'jobs.lifecycle');
        expect(nextUpdates.active_segment_id).toBeNull();
        expect(nextUpdates.active_segment_progress).toBe(0);
    });

    it('passes through all fields from segments.progress topic unchanged', () => {
        const nextUpdates: Record<string, any> = {
            active_segment_id: 'seg-2',
            active_segment_progress: 0.7,
            status: 'running',
        };
        applySegmentFieldRules(nextUpdates, makeJob(), 'segments.progress');
        expect(nextUpdates.active_segment_id).toBe('seg-2');
        expect(nextUpdates.active_segment_progress).toBe(0.7);
    });
});
