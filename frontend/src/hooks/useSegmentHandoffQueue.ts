import { useRef, useState, useCallback, useEffect } from 'react';

export interface SegmentHandoffInput {
    jobId: string;
    segmentId: string;
    progress: number;
    status?: string;
    etaSeconds?: number | null;
    etaBasis?: string | null;
    updatedAt?: number | null;
}

interface PendingSegment {
    /** The START_SEGMENT frame — what we mount the bar with (progress = 0). */
    startFrame: SegmentHandoffInput;
    /** The newest progress frame received for the pending segment while waiting. */
    latestFrame: SegmentHandoffInput;
}

export interface SegmentHandoffState {
    /** The segment identity and progress currently shown to the bar. */
    displayedSegmentId: string;
    displayedProgress: number;
    displayedEtaSeconds?: number | null;
    displayedEtaBasis?: string | null;
    displayedUpdatedAt?: number | null;
    displayedJobId: string;
    /** True when a next segment is waiting for the current bar to visually finish. */
    hasPending: boolean;
    /**
     * Call this when the visual bar for the currently-displayed segment reaches 1.0.
     * Flushes the pending segment (mounting it at 0%, then applying latestFrame on
     * the next scheduler tick).
     */
    onVisualComplete: () => void;
    /**
     * Notify the queue of the bar's current visual progress (0–1).
     * When progress reaches ≥0.999 for the first time, triggers visual completion
     * and flushes the pending segment if one exists.
     */
    notifyDisplayProgress: (progress: number) => void;
}

/**
 * Manages the display-layer queueing for segment-level progress bars in the
 * Chapter Editor.  When a new segment starts (segmentId changes) while the
 * current bar has not yet visually reached 100%, the swap is deferred.
 *
 * State machine:
 *   IDLE  — displayedSegmentId tracks props.segmentId directly.
 *   COMPLETING — displayedSegmentId is held at the old value; pendingRef holds
 *                the queued segment (pendingStart + pendingLatest).
 *   After onVisualComplete fires:
 *     1. displayedSegmentId swaps to the pending segment's id.
 *     2. displayedProgress is set to 0 (the start frame).
 *     3. On the next scheduler tick: displayedProgress advances to pendingLatest.progress.
 */
export function useSegmentHandoffQueue(input: SegmentHandoffInput): SegmentHandoffState {
    const [displayed, setDisplayed] = useState<SegmentHandoffInput>(input);
    const [hasPending, setHasPending] = useState(false);

    // Whether we are currently in COMPLETING state (old bar finishing).
    const completingRef = useRef(false);
    // Whether the visual bar has been reported as complete (onVisualComplete called).
    const visualCompleteRef = useRef(false);
    // The queued next segment.
    const pendingRef = useRef<PendingSegment | null>(null);
    // Tracks the last displayed segmentId so we can detect identity changes.
    const displayedRef = useRef<SegmentHandoffInput>(input);
    // Debounce timer for applying latestFrame after mount.
    const catchUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Safety timeout: if COMPLETING and onVisualComplete never fires, force-flush after 3s.
    const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Ref to the onVisualComplete callback so the safety timer can call it without a
    // stale-closure dependency cycle (callback defined after the main effect).
    const onVisualCompleteRef = useRef<(() => void) | null>(null);

    // Keep displayedRef in sync with displayed state.
    useEffect(() => {
        displayedRef.current = displayed;
    }, [displayed]);

    // Sentinel value for "no real segment" — used when there is no active segment yet.
    const NO_SEGMENT = 'none';

    // Main effect: react to incoming prop changes.
    useEffect(() => {
        const currentDisplayed = displayedRef.current;

        // Same segment: just update displayed progress directly (no queueing needed).
        if (input.segmentId === currentDisplayed.segmentId) {
            // If we're completing (old bar finishing) but same segmentId, just pass through.
            if (!completingRef.current) {
                setDisplayed(input);
            }
            // If the segmentId matches what's pending, update pendingLatest.
            if (pendingRef.current && pendingRef.current.startFrame.segmentId === input.segmentId) {
                pendingRef.current = { ...pendingRef.current, latestFrame: input };
            }
            return;
        }

        // segmentId changed. Check if visual is already complete or if we are NOT mid-animation.
        if (!completingRef.current && visualCompleteRef.current) {
            // Visual was already complete (e.g. bar reached 100 before new segment arrived).
            // Mount immediately without queueing — and reset the flag so the *next* change
            // doesn't also short-circuit into the immediate-mount path.
            visualCompleteRef.current = false;
            pendingRef.current = null;
            setHasPending(false);
            setDisplayed(input);
            return;
        }

        // If the previous segment was the sentinel (no real segment before), swap immediately.
        // This handles the "first segment arrives" case — no animation to wait for.
        if (currentDisplayed.segmentId === NO_SEGMENT) {
            completingRef.current = false;
            pendingRef.current = null;
            setHasPending(false);
            setDisplayed(input);
            return;
        }

        // If the *incoming* segmentId is the sentinel (liveJob disappeared), reset state
        // immediately — no bar is visible so no deferral is needed.
        if (input.segmentId === NO_SEGMENT) {
            completingRef.current = false;
            pendingRef.current = null;
            setHasPending(false);
            visualCompleteRef.current = false;
            setDisplayed(input);
            return;
        }

        // New segment while bar has not visually finished.
        completingRef.current = true;
        visualCompleteRef.current = false;

        if (pendingRef.current && pendingRef.current.startFrame.segmentId === input.segmentId) {
            // Already pending for this same segment — just update latestFrame.
            pendingRef.current = { ...pendingRef.current, latestFrame: input };
        } else {
            // New pending segment (latest-wins: overwrite any previous pending).
            pendingRef.current = {
                startFrame: input,
                latestFrame: input,
            };
            // Re-arm the safety timer for the new pending identity (latest-wins).
            if (safetyTimerRef.current !== null) {
                clearTimeout(safetyTimerRef.current);
            }
            safetyTimerRef.current = setTimeout(() => {
                safetyTimerRef.current = null;
                onVisualCompleteRef.current?.();
            }, 3000);
        }
        // Update hasPending state so the caller can observe it.
        setHasPending(true);
        // The arrival of the next segment proves the outgoing segment is done.
        // Force displayed progress to 1.0 (and clear ETA) so the visual bar
        // animates forward to 100% naturally instead of stalling at whatever
        // partial value A last reported.
        setDisplayed(prev => ({ ...prev, progress: 1.0, etaSeconds: null }));
    }, [input.segmentId, input.progress, input.etaSeconds, input.updatedAt, input.status, setHasPending]);

    // Tracks whether we already called onVisualComplete for the current high-water
    // visual progress, to avoid calling it multiple times as the bar hovers at ~1.0.
    const visualCompleteFiredRef = useRef(false);

    const onVisualComplete = useCallback(() => {
        // Clear safety timer — flush is happening now (either natural or forced).
        if (safetyTimerRef.current !== null) {
            clearTimeout(safetyTimerRef.current);
            safetyTimerRef.current = null;
        }

        const pending = pendingRef.current;

        if (!pending) {
            // No pending segment: simply mark that visual is complete so the next
            // segment change (if it arrives later) can skip the queue.
            visualCompleteRef.current = true;
            completingRef.current = false;
            return;
        }

        // Mount the pending segment at progress 0 (start frame).
        const startFrame = { ...pending.startFrame, progress: 0 };
        const latestFrame = pending.latestFrame;

        completingRef.current = false;
        pendingRef.current = null;
        setHasPending(false);
        visualCompleteRef.current = false;

        setDisplayed(startFrame);
        visualCompleteFiredRef.current = false;

        // On the next tick: apply latestFrame so the bar visibly starts at 0,
        // then catches up to current progress via the normal lane transition.
        if (catchUpTimerRef.current !== null) {
            clearTimeout(catchUpTimerRef.current);
        }
        catchUpTimerRef.current = setTimeout(() => {
            catchUpTimerRef.current = null;
            setDisplayed(latestFrame);
        }, 16); // one rAF-ish tick
    }, []);

    // Keep onVisualCompleteRef current so the safety timer always calls the live callback.
    useEffect(() => {
        onVisualCompleteRef.current = onVisualComplete;
    }, [onVisualComplete]);

    const notifyDisplayProgress = useCallback((progress: number) => {
        if (progress >= 0.999 && !visualCompleteFiredRef.current) {
            visualCompleteFiredRef.current = true;
            onVisualComplete();
        } else if (progress < 0.999) {
            visualCompleteFiredRef.current = false;
        }
    }, [onVisualComplete]);

    // Cleanup timers on unmount.
    useEffect(() => {
        return () => {
            if (catchUpTimerRef.current !== null) {
                clearTimeout(catchUpTimerRef.current);
            }
            if (safetyTimerRef.current !== null) {
                clearTimeout(safetyTimerRef.current);
            }
        };
    }, []);

    return {
        displayedSegmentId: displayed.segmentId,
        displayedProgress: displayed.progress,
        displayedEtaSeconds: displayed.etaSeconds,
        displayedEtaBasis: displayed.etaBasis,
        displayedUpdatedAt: displayed.updatedAt,
        displayedJobId: displayed.jobId,
        hasPending,
        onVisualComplete,
        notifyDisplayProgress,
    };
}
