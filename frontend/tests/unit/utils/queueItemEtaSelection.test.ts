import { describe, it, expect } from 'vitest';
import { selectEtaSource, selectEtaSourceTimestamp } from '@/utils/queueItemEtaSelection';

function makeJob(overrides: Partial<{
    eta_seconds: number | null;
    eta_updated_at: number | null;
    updated_at: number | null;
}> = {}) {
    return {
        eta_seconds: overrides.eta_seconds ?? null,
        eta_updated_at: overrides.eta_updated_at ?? null,
        updated_at: overrides.updated_at ?? null,
    };
}

function makeLiveJob(overrides: Partial<{
    eta_seconds: number | null;
    eta_updated_at: number | null;
    updated_at: number | null;
}> = {}) {
    return {
        eta_seconds: overrides.eta_seconds ?? null,
        eta_updated_at: overrides.eta_updated_at ?? null,
        updated_at: overrides.updated_at ?? null,
    };
}

describe('selectEtaSource', () => {
    it('returns fallback when both job and liveJob have no ETA', () => {
        expect(selectEtaSource(makeJob(), undefined, false)).toBe('fallback');
    });

    it('returns liveJob when only liveJob has positive ETA', () => {
        expect(selectEtaSource(makeJob(), makeLiveJob({ eta_seconds: 30 }), true)).toBe('liveJob');
    });

    it('returns job when only job has positive ETA', () => {
        expect(selectEtaSource(makeJob({ eta_seconds: 60 }), undefined, true)).toBe('job');
    });

    it('prefers liveJob when liveJob eta_updated_at is more recent', () => {
        const job = makeJob({ eta_seconds: 40, eta_updated_at: 100, updated_at: 100 });
        const live = makeLiveJob({ eta_seconds: 35, eta_updated_at: 200, updated_at: 200 });
        expect(selectEtaSource(job, live, true)).toBe('liveJob');
    });

    it('prefers job when job eta_updated_at is more recent', () => {
        const job = makeJob({ eta_seconds: 40, eta_updated_at: 300, updated_at: 300 });
        const live = makeLiveJob({ eta_seconds: 35, eta_updated_at: 200, updated_at: 200 });
        expect(selectEtaSource(job, live, true)).toBe('job');
    });

    it('falls back to updated_at when eta_updated_at is null for tie-breaking', () => {
        const job = makeJob({ eta_seconds: 10, updated_at: 50 });
        const live = makeLiveJob({ eta_seconds: 20, updated_at: 100 });
        // liveJob updated_at 100 >= job updated_at 50 → liveJob wins
        expect(selectEtaSource(job, live, true)).toBe('liveJob');
    });

    it('returns job when job.eta_seconds is 0 (non-positive) and liveJob is undefined', () => {
        // eta_seconds === 0: hasJobEta is false, but job.eta_seconds !== undefined
        const job = makeJob({ eta_seconds: 0 });
        expect(selectEtaSource(job, undefined, false)).toBe('job');
    });

    it('returns liveJob when liveJob.eta_seconds is 0 and job has no ETA', () => {
        // liveJob.eta_seconds === 0: hasLiveEta false, falls to typeof check
        const job = makeJob();
        const live = makeLiveJob({ eta_seconds: 0 });
        expect(selectEtaSource(job, live, false)).toBe('liveJob');
    });
});

describe('selectEtaSourceTimestamp', () => {
    it('returns liveJob.eta_updated_at when etaSource is liveJob and ETA positive', () => {
        const job = makeJob({ eta_seconds: 10, eta_updated_at: 100 });
        const live = makeLiveJob({ eta_seconds: 20, eta_updated_at: 200 });
        expect(selectEtaSourceTimestamp('liveJob', job, live)).toBe(200);
    });

    it('falls back to job.eta_updated_at when liveJob ETA is non-positive', () => {
        const job = makeJob({ eta_seconds: 10, eta_updated_at: 100 });
        const live = makeLiveJob({ eta_seconds: 0, eta_updated_at: 50, updated_at: 50 });
        expect(selectEtaSourceTimestamp('liveJob', job, live)).toBe(100);
    });

    it('returns job.updated_at when etaSource is job and no eta_updated_at', () => {
        const job = makeJob({ eta_seconds: 30, updated_at: 500 });
        expect(selectEtaSourceTimestamp('job', job, undefined)).toBe(500);
    });

    it('returns liveJob.updated_at ?? job.updated_at for fallback source', () => {
        const job = makeJob({ updated_at: 111 });
        const live = makeLiveJob({ updated_at: 222 });
        expect(selectEtaSourceTimestamp('fallback', job, live)).toBe(222);
    });

    it('returns job.updated_at when liveJob is undefined and etaSource is fallback', () => {
        const job = makeJob({ updated_at: 333 });
        expect(selectEtaSourceTimestamp('fallback', job, undefined)).toBe(333);
    });
});
