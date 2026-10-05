import { describe, it, expect } from 'vitest';
import type { Job } from '@/types';
import { selectSegmentProgressFields } from '@/utils/segmentProgressSelection';

function makeJob(overrides: Partial<Job> & { segmentProgressSocketProvenance?: any } = {}): Job {
    const { segmentProgressSocketProvenance, ...rest } = overrides;
    const job: any = {
        id: 'job-1',
        engine: 'xtts',
        chapter_file: 'ch.txt',
        status: 'running',
        progress: 0,
        created_at: 0,
        safe_mode: false,
        make_mp3: false,
        warning_count: 0,
        has_segment_support: true,
        hasSegmentSupport: true,
        segment_ids: ['seg-a'],
        ...rest,
    };
    if (segmentProgressSocketProvenance) {
        job.segmentProgressSocketProvenance = segmentProgressSocketProvenance;
    }
    return job as Job;
}

describe('selectSegmentProgressFields', () => {
    it('returns empty/zero state when candidate is undefined', () => {
        const result = selectSegmentProgressFields(undefined);
        expect(result.hasSegmentSupport).toBe(false);
        expect(result.hasActiveSegment).toBe(false);
        expect(result.liveSegmentProgressValue).toBe(0);
        expect(result.liveSegmentProgressJob).toBeUndefined();
    });

    it('prefers direct active_segment_id over provenance activeSegmentId', () => {
        const job = makeJob({
            active_segment_id: 'direct-seg',
            active_segment_progress: 0.5,
            segmentProgressSocketProvenance: {
                selectedFields: { activeSegmentId: 'prov-seg', activeSegmentProgress: 0.3 },
            },
        });
        const result = selectSegmentProgressFields(job);
        expect(result.selectedActiveSegmentId).toBe('direct-seg');
        expect(result.selectedActiveSegmentProgress).toBeCloseTo(0.5);
    });

    it('falls back to provenance activeSegmentId when direct is absent', () => {
        const job = makeJob({
            active_segment_id: undefined,
            segmentProgressSocketProvenance: {
                selectedFields: { activeSegmentId: 'prov-seg', activeSegmentProgress: 0.4 },
            },
        });
        const result = selectSegmentProgressFields(job);
        expect(result.selectedActiveSegmentId).toBe('prov-seg');
        expect(result.selectedActiveSegmentProgress).toBeCloseTo(0.4);
    });

    it('clamps progress values to [0, 1]', () => {
        const job = makeJob({
            active_segment_id: 'seg-1',
            active_segment_progress: 1.5, // out of range
        });
        const result = selectSegmentProgressFields(job);
        expect(result.selectedActiveSegmentProgress).toBe(1);
        expect(result.liveSegmentProgressValue).toBe(1);
    });

    it('prefers direct ETA seconds over provenance when direct segment id present', () => {
        const job = makeJob({
            active_segment_id: 'seg-1',
            active_segment_progress: 0.6,
            active_segment_eta_seconds: 45,
            segmentProgressSocketProvenance: {
                selectedFields: {
                    activeSegmentId: 'seg-1',
                    activeSegmentProgress: 0.6,
                    etaSeconds: 99,
                },
            },
        });
        const result = selectSegmentProgressFields(job);
        expect(result.selectedSegmentEtaSeconds).toBe(45);
    });

    it('produces a patched liveSegmentProgressJob with selected fields', () => {
        const job = makeJob({
            active_segment_id: 'seg-1',
            active_segment_progress: 0.7,
            active_segment_eta_seconds: 30,
            active_segment_eta_basis: 'remaining_from_update',
            active_segment_updated_at: 12345,
        });
        const result = selectSegmentProgressFields(job);
        expect(result.hasActiveSegment).toBe(true);
        expect(result.liveSegmentProgressJob?.active_segment_id).toBe('seg-1');
        expect(result.liveSegmentProgressJob?.active_segment_progress).toBeCloseTo(0.7);
        expect(result.liveSegmentProgressJob?.active_segment_eta_seconds).toBe(30);
    });
});
