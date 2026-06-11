import { useState, useEffect, useRef } from 'react';

/**
 * Latest-wins deferred value: while `held` is true, incoming `value` changes are
 * buffered (latest-wins). When `held` transitions to false, the latest buffered
 * value (if any) is released as the new current value.
 *
 * When `held` is false, values pass through immediately (no buffering).
 *
 * Use-case: gate tick counters that trigger data refetches while an animation
 * hold is in flight, so the refetch (and resulting re-render) can't block the
 * main thread mid-animation.
 */
export function useDeferredWhileHeld<T>(value: T, held: boolean): T {
    const [released, setReleased] = useState<T>(value);
    const heldRef = useRef<T | undefined>(undefined);
    // Track whether we actually have a buffered value to release.
    const hasHeldRef = useRef(false);

    // When value changes: pass through immediately if not held; buffer if held.
    useEffect(() => {
        if (!held) {
            setReleased(value);
        } else {
            heldRef.current = value;
            hasHeldRef.current = true;
        }
     
    }, [value, held]);

    // When hold ends: flush any buffered value.
    useEffect(() => {
        if (!held && hasHeldRef.current) {
            setReleased(heldRef.current as T);
            heldRef.current = undefined;
            hasHeldRef.current = false;
        }
     
    }, [held]);

    return released;
}
