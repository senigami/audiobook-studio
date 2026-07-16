/**
 * RecordingCueCard.tsx — task 007 (voice-card-consolidation, P7)
 *
 * Live "read this aloud" cue card shown while recording a sample. Calls the
 * existing `suggestRecordingPrompt()` unmodified — this component adds no new
 * matching logic.
 *
 * `suggestRecordingPrompt()` returns `null` for the true zero-selection case
 * (no attrs, or all fields empty — `hasMeaningfulAttrs` gate in
 * recordingPromptSuggester.ts:106-112), which is DIFFERENT from its
 * `composeFallback()` path: that one only runs once at least one attribute is
 * set but nothing scores a close archetype match, and it always returns a
 * real prompt. The `null` case is only reachable via true "Skip" with nothing
 * selected at all, so it needs its own generic prompt here rather than
 * reusing composeFallback's output (there isn't one to reuse).
 */
import type { VoiceAttributes } from '@/types';
import { suggestRecordingPrompt } from '@/pages/Voices/components/metadata/recordingPromptSuggester';

const GENERIC_SKIP_PROMPT =
    "Read a few sentences in your natural speaking voice, at a comfortable, conversational pace.";
const GENERIC_SKIP_DIRECTION =
    'No specific direction — just sound like yourself.';

export function RecordingCueCard({ attrs }: { attrs: Partial<VoiceAttributes> }) {
    const suggestion = suggestRecordingPrompt(attrs as VoiceAttributes);
    const display = suggestion ?? {
        prompt: GENERIC_SKIP_PROMPT,
        directionNote: GENERIC_SKIP_DIRECTION,
    };

    return (
        <div className="recording-cue-card">
            <p className="recording-cue-card__prompt">{display.prompt}</p>
            <p className="recording-cue-card__direction">{display.directionNote}</p>
        </div>
    );
}
