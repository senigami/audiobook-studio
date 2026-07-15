/**
 * SamplesTab.tsx — task 003 (voice-card-consolidation, P3)
 *
 * Thin composition wrapper relocating the existing SamplesSection/
 * SampleManager upload UI into the Samples tabpanel. Pure relocation, no
 * new capability — props/wiring are unchanged from the prior direct
 * `<SamplesSection ... />` call site in VoiceLabPage.tsx.
 *
 * Task 007 adds an Upload | Record mode toggle: Record mode surfaces the
 * archetype picker + live cue card ahead of the actual capture UI. Task 008
 * adds the record/stop/level-meter controls (`RecordControls`) below the cue
 * card, plus a Space-key shortcut wired at this container level to toggle
 * start/stop. Task 009 adds `TakeManager` (non-destructive retakes,
 * capture-time quality gate, WAV transcode) on top of `RecordControls`, and
 * its own Enter (keep)/R (retake) shortcuts on that same keydown surface —
 * see `TakeManager.tsx`'s header comment for the full shortcut set.
 */
import React, { useRef, useState } from 'react';
import type { SpeakerProfile } from '@/types';
import { SamplesSection, type SamplesSectionProps } from '@/pages/VoiceLab/components/SamplesSection';
import { ArchetypePicker, type ArchetypeAttrs } from '@/pages/VoiceLab/components/record/ArchetypePicker';
import { RecordingCueCard } from '@/pages/VoiceLab/components/record/RecordingCueCard';
import { TakeManager } from '@/pages/VoiceLab/components/record/TakeManager';
import { useVariantActions } from '@/hooks/useVariantActions';

type SamplesTabMode = 'upload' | 'record';

const EMPTY_ARCHETYPE_ATTRS: ArchetypeAttrs = {};

// Mirrors `SamplesSection.tsx`'s guard: `useVariantActions` reads several
// profile fields unconditionally, and hooks can't be called conditionally,
// so this stable placeholder stands in during the transient window where
// `profiles` is empty on a cold load.
const EMPTY_PROFILE: SpeakerProfile = {
    name: '',
    wav_count: 0,
    speed: 1,
    is_default: false,
    speaker_id: null,
    variant_name: null,
    preview_url: null,
};

export const SamplesTab: React.FC<SamplesSectionProps> = (props) => {
    const [mode, setMode] = useState<SamplesTabMode>('upload');
    const [archetypeAttrs, setArchetypeAttrs] = useState<ArchetypeAttrs>(EMPTY_ARCHETYPE_ATTRS);
    const [skipped, setSkipped] = useState(false);
    const recordModeRef = useRef<HTMLDivElement>(null);
    const profile = props.profiles[0];
    // `uploadFiles` is the existing sink (`useVariantActions.ts:159-174`) —
    // TakeManager's finalized, transcoded takes are handed to it unchanged,
    // exactly like an uploaded file.
    const { uploadFiles } = useVariantActions(profile ?? EMPTY_PROFILE, props.onRefresh, async () => undefined, () => undefined);

    // Space toggles start/stop from anywhere within the record-mode
    // container (the button already handles Space natively when it has
    // focus — this covers the rest of the container, e.g. right after using
    // the archetype picker). Ignored when focus is on a form control that
    // needs Space for its own purpose (inputs/selects/textareas/the button
    // itself, which already handles it).
    const handleRecordModeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.code !== 'Space') return;
        const target = event.target as HTMLElement;
        if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
        const toggleBtn = recordModeRef.current?.querySelector<HTMLButtonElement>('[data-record-toggle-btn]');
        if (!toggleBtn) return;
        event.preventDefault();
        toggleBtn.click();
    };

    return (
        <div className="samples-tab">
            <div className="samples-tab__mode-toggle" role="tablist" aria-label="Sample source">
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'upload'}
                    className={mode === 'upload' ? 'btn-primary' : 'btn-ghost'}
                    onClick={() => setMode('upload')}
                >
                    Upload
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'record'}
                    className={mode === 'record' ? 'btn-primary' : 'btn-ghost'}
                    onClick={() => setMode('record')}
                >
                    Record
                </button>
            </div>

            {mode === 'upload' && <SamplesSection {...props} />}

            {mode === 'record' && (
                <div
                    className="samples-tab__record-mode"
                    ref={recordModeRef}
                    onKeyDown={handleRecordModeKeyDown}
                >
                    {!skipped && (
                        <ArchetypePicker
                            value={archetypeAttrs}
                            onChange={setArchetypeAttrs}
                            onSkip={() => setSkipped(true)}
                        />
                    )}
                    <RecordingCueCard attrs={skipped ? {} : archetypeAttrs} />
                    <TakeManager onFinalize={uploadFiles} />
                </div>
            )}
        </div>
    );
};
