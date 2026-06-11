import { useRef, useState, useCallback, useEffect } from 'react';

// ---------------------------------------------------------------------------
// Debug ring buffer — module-level, allocation-cheap, max 200 entries.
// Matches the progressMemory pattern in PredictiveProgressBar.
// ---------------------------------------------------------------------------

export interface HandoffTransition {
    t: number;
    event: string;
    segmentId?: string;
    detail?: Record<string, unknown>;
}

const RING_MAX = 200;
const _ring: HandoffTransition[] = [];

function recordHandoffTransition(event: string, segmentId?: string, detail?: Record<string, unknown>): void {
    try {
        if (_ring.length >= RING_MAX) {
            _ring.shift();
        }
        const entry: HandoffTransition = { t: Date.now(), event };
        if (segmentId !== undefined) entry.segmentId = segmentId;
        if (detail !== undefined) entry.detail = detail;
        _ring.push(entry);
    } catch {
        // never throw from instrumentation
    }
}

/** Returns a shallow copy of all recorded handoff transitions. */
export function getHandoffTransitions(): HandoffTransition[] {
    return [..._ring];
}

/** Clears the ring buffer (for tests). */
export function clearHandoffTransitions(): void {
    _ring.length = 0;
}

/** Records an externally-sourced event into the same ring (for page-level callers). */
export function recordExternalHandoffEvent(event: string, detail?: Record<string, unknown>): void {
    recordHandoffTransition(event, undefined, detail);
}

// ---------------------------------------------------------------------------
// display_progress throttle: track last bucket to avoid excessive entries.
// Buckets: 0.25, 0.5, 0.75, 0.999
// ---------------------------------------------------------------------------
const DISPLAY_PROGRESS_BUCKETS = [0.25, 0.5, 0.75, 0.999];

// ---------------------------------------------------------------------------

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
 * How long (ms) to hold the completed frame visible before flushing to the
 * pending segment (or sentinel).  Exported so callers can advance fake timers.
 */
export const COMPLETION_HOLD_MS = 500;

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
 *     1. A COMPLETION_HOLD_MS hold timer is started; displayed stays at 1.0.
 *     2. When hold fires: displayedSegmentId swaps to the pending segment's id.
 *     3. displayedProgress is set to 0 (the start frame).
 *     4. On the next scheduler tick: displayedProgress advances to pendingLatest.progress.
 */
export function useSegmentHandoffQueue(input: SegmentHandoffInput): SegmentHandoffState {
    const [displayed, setDisplayed] = useState<SegmentHandoffInput>(input);
    const [hasPending, setHasPending] = useState(false);

    // Whether we are currently in COMPLETING state (old bar finishing).
    const completingRef = useRef(false);
    // Whether the visual bar has been reported as complete (onVisualComplete called).
    const visualCompleteRef = useRef(false);
    // Timestamp (Date.now()) when visualCompleteRef was set with no pending segment.
    // Used to compute remaining hold time when a swap arrives after early visual completion.
    const visualCompletedAtRef = useRef<number | null>(null);
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
    const onVisualCompleteRef = useRef<((source?: 'display' | 'safety') => void) | null>(null);
    // Hold timer: after visual 100%, wait COMPLETION_HOLD_MS before flushing.
    const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Guard against double-entry into the hold phase.
    const holdActiveRef = useRef(false);

    // Tracks the last seen (segmentId, progress) for the `input` event to skip pure pass-throughs.
    const lastInputKeyRef = useRef<string>('');

    // Tracks last display_progress bucket crossed upward.
    const lastDisplayBucketRef = useRef<number>(-1);

    // Keep displayedRef in sync with displayed state.
    useEffect(() => {
        displayedRef.current = displayed;
    }, [displayed]);

    // Sentinel value for "no real segment" — used when there is no active segment yet.
    const NO_SEGMENT = 'none';

    // Shared flush body: called from both the normal hold timer and the remaining-hold timer.
    // Resets all COMPLETING state and mounts the pending segment (or sentinel).
    const flushPending = useCallback(() => {
        holdTimerRef.current = null;
        holdActiveRef.current = false;

        // Capture latest pending at the time the hold fires (latest-wins update may
        // have changed latestFrame while we were holding).
        const flushedPending = pendingRef.current;

        // A new segment arriving during the hold re-arms the safety timer; clear it
        // here so a stray fire after the flush can't mark visual-complete and make
        // the next handoff skip its animation.
        if (safetyTimerRef.current !== null) {
            clearTimeout(safetyTimerRef.current);
            safetyTimerRef.current = null;
        }

        completingRef.current = false;
        pendingRef.current = null;
        setHasPending(false);
        visualCompleteRef.current = false;
        visualCompletedAtRef.current = null;
        visualCompleteFiredRef.current = false;

        const targetId = flushedPending?.startFrame.segmentId ?? 'none';
        recordHandoffTransition('flush', targetId, { target: flushedPending ? targetId : 'none' });

        if (!flushedPending || flushedPending.startFrame.segmentId === NO_SEGMENT) {
            // Flushing to sentinel (end-of-chapter) or nothing pending — just clear.
            setDisplayed(flushedPending?.latestFrame ?? displayedRef.current);
            return;
        }

        // Mount the pending segment at progress 0 (start frame).
        const startFrame = { ...flushedPending.startFrame, progress: 0 };
        const latestFrame = flushedPending.latestFrame;

        setDisplayed(startFrame);

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

    // Tracks whether we already called onVisualComplete for the current high-water
    // visual progress, to avoid calling it multiple times as the bar hovers at ~1.0.
    const visualCompleteFiredRef = useRef(false);

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

        // segmentId changed — record input transition (skip same-segment pass-throughs above).
        const inputKey = `${input.segmentId}:${input.progress}`;
        if (inputKey !== lastInputKeyRef.current) {
            lastInputKeyRef.current = inputKey;
            recordHandoffTransition('input', input.segmentId, {
                from: currentDisplayed.segmentId,
                to: input.segmentId,
                progress: input.progress,
            });
        }

        // segmentId changed. Check if visual is already complete or if we are NOT mid-animation.
        if (!completingRef.current && visualCompleteRef.current) {
            // Visual was already complete (e.g. bar reached 100 before new segment arrived).
            // Compute remaining hold time — if positive, serve it out rather than swapping immediately.
            const elapsed = Date.now() - (visualCompletedAtRef.current ?? 0);
            const remaining = COMPLETION_HOLD_MS - elapsed;

            if (remaining <= 0) {
                // Hold has already elapsed — mount immediately and reset flags.
                recordHandoffTransition('immediate_mount', input.segmentId, { elapsedMs: elapsed });
                visualCompleteRef.current = false;
                visualCompletedAtRef.current = null;
                pendingRef.current = null;
                setHasPending(false);
                setDisplayed(input);
                return;
            }

            // Hold has not yet elapsed — enter COMPLETING/hold flow with remaining time.
            recordHandoffTransition('remaining_hold_start', input.segmentId, { remainingMs: remaining });
            pendingRef.current = { startFrame: input, latestFrame: input };
            setHasPending(true);
            completingRef.current = true;
            // visualCompleteRef stays true; holdActiveRef guards double-entry.
            if (holdActiveRef.current) {
                // A hold timer is already running (shouldn't normally happen, but be safe).
                return;
            }
            holdActiveRef.current = true;
            if (holdTimerRef.current !== null) {
                clearTimeout(holdTimerRef.current);
            }
            holdTimerRef.current = setTimeout(() => {
                flushPending();
            }, remaining);
            return;
        }

        // If the previous segment was the sentinel (no real segment before), swap immediately.
        // This handles the "first segment arrives" case — no animation to wait for.
        if (currentDisplayed.segmentId === NO_SEGMENT) {
            recordHandoffTransition('sentinel_reset', input.segmentId);
            completingRef.current = false;
            pendingRef.current = null;
            setHasPending(false);
            setDisplayed(input);
            return;
        }

        // If the *incoming* segmentId is the sentinel (liveJob disappeared / end of chapter),
        // and the displayed segment is a real segment with an animation in flight, treat this
        // like a normal handoff: drive the displayed bar to 1.0, queue the sentinel as pending,
        // then flush after the visual hold.
        if (input.segmentId === NO_SEGMENT) {
            // If the displayed segment is already sentinel, or visual has already completed,
            // reset immediately — nothing to animate.
            if (currentDisplayed.segmentId === NO_SEGMENT || visualCompleteRef.current) {
                completingRef.current = false;
                pendingRef.current = null;
                setHasPending(false);
                visualCompleteRef.current = false;
                visualCompletedAtRef.current = null;
                setDisplayed(input);
                return;
            }
            // Otherwise: enter COMPLETING with the sentinel as the pending segment.
            // This lets the bar animate to 100% and hold before clearing.
            recordHandoffTransition('sentinel_completing', input.segmentId, { pending: input.segmentId });
            completingRef.current = true;
            visualCompleteRef.current = false;

            pendingRef.current = {
                startFrame: input,
                latestFrame: input,
            };
            // Arm the safety timer.
            if (safetyTimerRef.current !== null) {
                clearTimeout(safetyTimerRef.current);
            }
            safetyTimerRef.current = setTimeout(() => {
                safetyTimerRef.current = null;
                onVisualCompleteRef.current?.('safety');
            }, 3000);
            setHasPending(true);
            setDisplayed(prev => ({ ...prev, progress: 1.0, etaSeconds: null }));
            return;
        }

        // New segment while bar has not visually finished.
        recordHandoffTransition('completing_enter', input.segmentId, { pending: input.segmentId });
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
                onVisualCompleteRef.current?.('safety');
            }, 3000);
        }
        // Update hasPending state so the caller can observe it.
        setHasPending(true);
        // The arrival of the next segment proves the outgoing segment is done.
        // Force displayed progress to 1.0 (and clear ETA) so the visual bar
        // animates forward to 100% naturally instead of stalling at whatever
        // partial value A last reported.
        setDisplayed(prev => ({ ...prev, progress: 1.0, etaSeconds: null }));
    }, [input.segmentId, input.progress, input.etaSeconds, input.updatedAt, input.status, setHasPending, flushPending]);

    const onVisualComplete = useCallback((source: 'display' | 'safety' = 'display') => {
        // Clear safety timer — flush is happening now (either natural or forced).
        if (safetyTimerRef.current !== null) {
            clearTimeout(safetyTimerRef.current);
            safetyTimerRef.current = null;
        }

        const pending = pendingRef.current;

        recordHandoffTransition('visual_complete', displayedRef.current.segmentId, {
            hasPending: !!pending,
            source,
        });

        if (!pending) {
            // No pending segment: simply mark that visual is complete so the next
            // segment change (if it arrives later) can skip the queue (or serve remaining hold).
            visualCompleteRef.current = true;
            visualCompletedAtRef.current = Date.now();
            completingRef.current = false;
            return;
        }

        // Guard against double-entry into the hold phase.
        if (holdActiveRef.current) {
            return;
        }
        holdActiveRef.current = true;

        // Start the completion hold: keep the displayed frame at 1.0 for COMPLETION_HOLD_MS
        // so the user can visually register the completion, then flush.
        if (holdTimerRef.current !== null) {
            clearTimeout(holdTimerRef.current);
        }
        recordHandoffTransition('hold_start', displayedRef.current.segmentId, { holdMs: COMPLETION_HOLD_MS });
        holdTimerRef.current = setTimeout(() => {
            flushPending();
        }, COMPLETION_HOLD_MS);
    }, [flushPending]);

    // Keep onVisualCompleteRef current so the safety timer always calls the live callback.
    useEffect(() => {
        onVisualCompleteRef.current = onVisualComplete;
    }, [onVisualComplete]);

    const notifyDisplayProgress = useCallback((progress: number) => {
        // Throttled display_progress recording: only on upward bucket crossings.
        try {
            for (const bucket of DISPLAY_PROGRESS_BUCKETS) {
                if (progress >= bucket && lastDisplayBucketRef.current < bucket) {
                    lastDisplayBucketRef.current = bucket;
                    recordHandoffTransition('display_progress', displayedRef.current.segmentId, { progress });
                    break;
                }
            }
            // Reset bucket tracking when progress drops back below threshold (new segment mounted at 0).
            if (progress < 0.25 && lastDisplayBucketRef.current >= 0) {
                lastDisplayBucketRef.current = -1;
            }
        } catch {
            // never throw
        }

        if (progress >= 0.999 && !visualCompleteFiredRef.current) {
            visualCompleteFiredRef.current = true;
            onVisualComplete('display');
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
            if (holdTimerRef.current !== null) {
                clearTimeout(holdTimerRef.current);
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
        onVisualComplete: () => onVisualComplete('display'),
        notifyDisplayProgress,
    };
}
