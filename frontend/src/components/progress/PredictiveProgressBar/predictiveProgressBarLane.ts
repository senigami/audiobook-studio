import { isPreparingStatus, isQueuedStatus } from '@/components/progress/PredictiveProgressBar/predictiveProgressBarHelpers';

export type ProgressLane = {
    startedAtMs: number;
    startProgress: number;
    endAtMs: number | null;
};

export type LaneMigration = {
    startedAtMs: number;
    durationMs: number;
    fromLane: ProgressLane;
    toLane: ProgressLane;
};

export const resolveEndAtMs = ({
    nowMs,
    startedAt,
    etaSeconds,
    etaBasis,
    estimatedEndAt,
    updatedAt,
    presentationState,
}: {
    nowMs: number;
    startedAt?: number;
    etaSeconds?: number;
    etaBasis?: 'remaining_from_update' | 'total_from_start';
    estimatedEndAt?: number;
    updatedAt?: number;
    presentationState?: string;
}) => {
    // I10 (progress-presentation §2.6 — parallel-render model v1.8.0):
    // queued never shows a countdown (no synthesis clock).
    // preparing: the backend may publish a pre-factored ETA during the cold-load window
    // (reason_code=pre_load_eta); honor it when a positive etaSeconds is present.
    // A preparing frame without a positive eta remains indeterminate (return null).
    if (isQueuedStatus(presentationState)) {
        return null;
    }
    if (isPreparingStatus(presentationState)) {
        // Only allow through when a positive eta is actually present.
        if (typeof etaSeconds !== 'number' || !Number.isFinite(etaSeconds) || etaSeconds <= 0) {
            return null;
        }
        // Fall through to the normal resolution path below.
    }
    // NaN-safety: a NaN etaSeconds is `typeof 'number'` and `NaN < 0` is false, so
    // every numeric branch must use Number.isFinite or NaN flows into endAtMs and
    // surfaces as "NaN:NaN" in the ETA countdown. (Mirrors the clamp01 sink fix.)
    if (etaBasis === 'remaining_from_update' && typeof etaSeconds === 'number' && Number.isFinite(etaSeconds) && etaSeconds >= 0) {
        const anchorSeconds = (typeof updatedAt === 'number' && Number.isFinite(updatedAt)) ? updatedAt : (nowMs / 1000);
        return (anchorSeconds + etaSeconds) * 1000;
    }

    if (typeof estimatedEndAt === 'number' && Number.isFinite(estimatedEndAt) && estimatedEndAt > 0) {
        return estimatedEndAt * 1000;
    }

    if (typeof etaSeconds !== 'number' || !Number.isFinite(etaSeconds) || etaSeconds < 0) {
        return null;
    }

    if (typeof startedAt === 'number' && startedAt > 0) {
        return (startedAt + etaSeconds) * 1000;
    }

    return nowMs + (etaSeconds * 1000);
};

export const getLaneProgress = (startAtMs: number, endAtMs: number | null, startProgress: number, nowMs: number) => {
    if (endAtMs === null) return startProgress;
    const duration = endAtMs - startAtMs;
    // `!(duration > 0)` also catches NaN duration (a NaN lane end from a
    // null<->number migration blend) — `NaN <= 0` is false and would leak NaN.
    if (!(duration > 0)) return startProgress;
    const t = Math.max(0, Math.min(1, (nowMs - startAtMs) / duration));
    const result = startProgress + ((0.995 - startProgress) * t);
    return Number.isFinite(result) ? result : startProgress;
};

export const getRenderedStartAtMs = (currentLane: ProgressLane | null, migration: LaneMigration | null, nowMs: number) => {
    if (!currentLane) return nowMs;
    if (!migration) return currentLane.startedAtMs;

    const fromStartAtMs = migration.fromLane.startedAtMs;
    const toStartAtMs = migration.toLane.startedAtMs;

    const t = Math.max(0, Math.min(1, (nowMs - migration.startedAtMs) / migration.durationMs));
    return fromStartAtMs + ((toStartAtMs - fromStartAtMs) * t);
};

export const getRenderedEndAtMs = (currentLane: ProgressLane | null, migration: LaneMigration | null, nowMs: number) => {
    if (!currentLane) return null;
    if (!migration) return currentLane.endAtMs;

    const fromEndAtMs = migration.fromLane.endAtMs;
    const toEndAtMs = migration.toLane.endAtMs;
    if (fromEndAtMs == null || toEndAtMs == null) {
        return toEndAtMs ?? fromEndAtMs ?? null;
    }

    const t = Math.max(0, Math.min(1, (nowMs - migration.startedAtMs) / migration.durationMs));
    return fromEndAtMs + ((toEndAtMs - fromEndAtMs) * t);
};

export const getRenderedStartProgress = (currentLane: ProgressLane | null, migration: LaneMigration | null, nowMs: number) => {
    if (!currentLane) return 0;
    if (!migration) return currentLane.startProgress;

    const fromStartProgress = migration.fromLane.startProgress;
    const toStartProgress = migration.toLane.startProgress;

    const t = Math.max(0, Math.min(1, (nowMs - migration.startedAtMs) / migration.durationMs));
    return fromStartProgress + ((toStartProgress - fromStartProgress) * t);
};
