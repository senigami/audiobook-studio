/**
 * Hold/release timing state machine for queue status display.
 * Extracted from ChapterHeader.tsx / useChapterStatus.
 *
 * Keeps the last active status visible for a short hold window (400ms)
 * after rawQueueStatus goes null, bridging jitter between state transitions.
 */

import React from 'react';

export interface QueueStatusHoldTimerOptions {
    rawQueueStatus: string | null;
    hasChapterAudio: boolean;
    audioStatus: string | undefined;
    recentlyFinishedDoneJob: boolean;
}

export interface QueueStatusHoldTimerResult {
    heldQueueStatus: string | null;
}

export function useQueueStatusHoldTimer({
    rawQueueStatus,
    hasChapterAudio,
    audioStatus,
    recentlyFinishedDoneJob,
}: QueueStatusHoldTimerOptions): QueueStatusHoldTimerResult {
    const [heldQueueStatus, setHeldQueueStatus] = React.useState<string | null>(null);
    const releaseHoldTimerRef = React.useRef<number | null>(null);
    const lastActiveQueueStatusRef = React.useRef<string | null>(null);
    const holdUntilRef = React.useRef<number>(0);

    React.useEffect(() => {
        if (releaseHoldTimerRef.current !== null) {
            window.clearTimeout(releaseHoldTimerRef.current);
            releaseHoldTimerRef.current = null;
        }

        if (rawQueueStatus) {
            lastActiveQueueStatusRef.current = rawQueueStatus;
            holdUntilRef.current = Date.now() + 400;
            if (heldQueueStatus !== rawQueueStatus) {
                setHeldQueueStatus(rawQueueStatus);
            }
            return;
        }

        const shouldBridge = !hasChapterAudio
            && audioStatus !== 'done'
            && holdUntilRef.current > Date.now()
            && !!lastActiveQueueStatusRef.current;

        if (shouldBridge) {
            const bridged = recentlyFinishedDoneJob ? 'Finalizing' : lastActiveQueueStatusRef.current;
            if (heldQueueStatus !== bridged) {
                setHeldQueueStatus(bridged);
            }
            const remainingMs = Math.max(0, holdUntilRef.current - Date.now());
            releaseHoldTimerRef.current = window.setTimeout(() => {
                setHeldQueueStatus(null);
                releaseHoldTimerRef.current = null;
            }, remainingMs);
            return;
        }

        if (heldQueueStatus !== null) {
            setHeldQueueStatus(null);
        }
    }, [rawQueueStatus, hasChapterAudio, audioStatus, recentlyFinishedDoneJob, heldQueueStatus]);

    React.useEffect(() => () => {
        if (releaseHoldTimerRef.current !== null) {
            window.clearTimeout(releaseHoldTimerRef.current);
        }
    }, []);

    return { heldQueueStatus };
}
