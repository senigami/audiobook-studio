import type { Job } from '../../types';

// Hydration boundary for Studio 2.0.
//
// These helpers keep initial/reconnect snapshots separate from websocket live
// overlays without forcing the rest of the app to understand transport details.

export type HydrationSource = 'bootstrap' | 'reconnect';

export interface HydrationSnapshot {
  jobs: Record<string, Job>;
  hydrated_at: number;
  source: HydrationSource;
}

export interface HydrationCoordinator {
  createSnapshot: (jobs: Job[], source?: HydrationSource) => HydrationSnapshot;
  mergeLiveJob: (snapshot: HydrationSnapshot, liveJob: Job) => HydrationSnapshot;
}

export const createHydrationCoordinator = (): HydrationCoordinator => ({
  createSnapshot: (jobs, source = 'bootstrap') => ({
    jobs: indexJobs(jobs),
    hydrated_at: Date.now(),
    source,
  }),
  mergeLiveJob: (snapshot, liveJob) => ({
    ...snapshot,
    hydrated_at: Date.now(),
    jobs: {
      ...snapshot.jobs,
      [liveJob.id]: liveJob,
    },
  }),
});

export const createMockHydrationSnapshot = (jobs: Job[] = [], source: HydrationSource = 'bootstrap'): HydrationSnapshot => {
  return createHydrationCoordinator().createSnapshot(jobs, source);
};

const indexJobs = (jobs: Job[]): Record<string, Job> => {
  return jobs.reduce((acc, job) => {
    acc[job.id] = job;
    return acc;
  }, {} as Record<string, Job>);
};
