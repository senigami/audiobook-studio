/**
 * TakeManager.tsx — task 009 (voice-card-consolidation, P8)
 *
 * Non-destructive candidate list layered on top of `RecordControls.tsx`'s
 * Keep/Retake actions (INV-REC-2): Keep appends a new take, Retake starts a
 * fresh capture without touching any previously kept take, and Discard is a
 * separate, explicit per-take action. Finalizing transcodes every kept take
 * to WAV (`transcodeToWav.ts`) and hands the resulting `File[]` — each with
 * a unique filename — to the existing `uploadFiles` sink via `onFinalize`.
 *
 * Keyboard shortcuts (documented here per task 009's completion report,
 * since the full set is split across two task files):
 *   - Space: start/stop recording (task 008, wired at the `SamplesTab`
 *     container level, above this component)
 *   - Enter: Keep the current captured take (this task)
 *   - R: Retake — discard the current in-progress capture and start a new
 *     one, without touching any previously kept take (this task)
 * Both Enter and R are ignored while focus is on a text input/select so
 * typing "r" or submitting a form field doesn't accidentally trigger them.
 *
 * Note (R1 from 01-map.md, left as an explicit open call, not resolved
 * here): this task does not merge or retire `RecordingGuide.tsx` — that
 * disposition call belongs to task 007/P7, not P8.
 */
import { useCallback, useRef, useState } from 'react';
import { RecordControls } from '@/pages/VoiceLab/components/record/RecordControls';
import { transcodeToWav } from '@/utils/audio/transcodeToWav';

interface Take {
    id: string;
    blob: Blob;
    url: string;
}

export function TakeManager({ onFinalize }: { onFinalize: (takes: File[]) => Promise<void> }) {
    const [takes, setTakes] = useState<Take[]>([]);
    const [isFinalizing, setIsFinalizing] = useState(false);
    const takeCounterRef = useRef(0);
    const containerRef = useRef<HTMLDivElement>(null);

    // Keep appends a new candidate — it never replaces a previous entry in
    // place. RecordControls has already reset itself back to `idle` by the
    // time this fires, ready for the next capture.
    const handleKeep = useCallback((blob: Blob) => {
        takeCounterRef.current += 1;
        const id = `take-${takeCounterRef.current}-${Date.now()}`;
        setTakes(prev => [...prev, { id, blob, url: URL.createObjectURL(blob) }]);
    }, []);

    // Retake discards only the in-progress (not-yet-kept) capture —
    // RecordControls resets itself; every previously kept take in `takes`
    // is untouched.
    const handleRetake = useCallback(() => {
        // Intentionally a no-op at this layer: nothing in `takes` changes.
    }, []);

    // Explicit, separate Discard action — the only way a previously kept
    // take is ever removed.
    const handleDiscard = useCallback((id: string) => {
        setTakes(prev => {
            const target = prev.find(t => t.id === id);
            if (target) URL.revokeObjectURL(target.url);
            return prev.filter(t => t.id !== id);
        });
    }, []);

    const handleFinalize = useCallback(async () => {
        if (takes.length === 0) return;
        setIsFinalizing(true);
        try {
            const files = await Promise.all(
                takes.map(async (take, index) => {
                    const wavBlob = await transcodeToWav(take.blob);
                    // Unique filename per finalized take: timestamp + index +
                    // a random suffix, so neither a reload resetting a
                    // counter nor two takes finalized in the same
                    // millisecond can collide client-side (the server also
                    // guards against collision independently — see
                    // voices_actions.py's upload endpoint).
                    const uniqueSuffix = Math.random().toString(36).slice(2, 8);
                    const filename = `take-${index + 1}-${Date.now()}-${uniqueSuffix}.wav`;
                    return new File([wavBlob], filename, { type: 'audio/wav' });
                })
            );
            await onFinalize(files);
            takes.forEach(t => URL.revokeObjectURL(t.url));
            setTakes([]);
        } finally {
            setIsFinalizing(false);
        }
    }, [takes, onFinalize]);

    // Enter = keep the current captured take, R = retake. Both are wired at
    // this container level (mirroring task 008's Space handling in
    // `SamplesTab.tsx`) rather than only relying on the buttons themselves
    // having focus, and both defer to the actual Keep/Retake buttons
    // rendered inside `RecordControls` so the quality gate (Keep disabled
    // until the verdict is ok) is respected rather than bypassed.
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;

        if (event.code === 'Enter') {
            const keepBtn = containerRef.current?.querySelector<HTMLButtonElement>('[data-take-keep-btn]');
            if (keepBtn && !keepBtn.disabled) {
                event.preventDefault();
                keepBtn.click();
            }
            return;
        }

        if (event.key === 'r' || event.key === 'R') {
            const retakeBtn = containerRef.current?.querySelector<HTMLButtonElement>('[data-take-retake-btn]');
            if (retakeBtn) {
                event.preventDefault();
                retakeBtn.click();
            }
        }
    };

    return (
        <div className="take-manager" ref={containerRef} onKeyDown={handleKeyDown}>
            <RecordControls onKeep={handleKeep} onRetake={handleRetake} />

            {takes.length > 0 && (
                <div className="take-manager__list">
                    <h4 className="take-manager__list-heading">
                        {takes.length} take{takes.length === 1 ? '' : 's'} kept
                    </h4>
                    <ul>
                        {takes.map((take, index) => (
                            <li key={take.id} className="take-manager__item">
                                <span>Take {index + 1}</span>
                                <audio controls src={take.url} />
                                <button
                                    type="button"
                                    className="btn-ghost"
                                    onClick={() => handleDiscard(take.id)}
                                >
                                    Discard
                                </button>
                            </li>
                        ))}
                    </ul>
                    <button
                        type="button"
                        className="btn-primary"
                        onClick={handleFinalize}
                        disabled={isFinalizing}
                    >
                        {isFinalizing ? 'Uploading…' : `Finalize ${takes.length} take${takes.length === 1 ? '' : 's'}`}
                    </button>
                </div>
            )}
        </div>
    );
}
