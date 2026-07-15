/**
 * ArchetypePicker.tsx — task 007 (voice-card-consolidation, P7)
 *
 * Reduced pre-recording attribute picker exposing ONLY the 6 fields that
 * actually drive archetype matching in `recordingPromptSuggester.ts`'s
 * `scoreArchetype()` (class/gender/age/tone/timbre/pace) — NOT the full
 * 11-field taxonomy MetadataEditorModal exposes (accent/language/style/
 * use_case/quality are confirmed unused by the matcher). Reuses the same
 * OneSelect/ManySelect components and getSection() lookup as the metadata
 * editor for visual/behavioral consistency.
 */
import type { VoiceAttributes } from '@/types';
import { getSection } from '@/pages/Voices/components/metadata/taxonomy';
import { OneSelect } from '@/pages/Voices/components/metadata/OneSelect';
import { ManySelect } from '@/pages/Voices/components/metadata/ManySelect';

export type ArchetypeAttrs = Pick<VoiceAttributes, 'class' | 'gender' | 'age' | 'tone' | 'timbre' | 'pace'>;

const ONE_FIELDS: Array<keyof ArchetypeAttrs> = ['class', 'gender', 'age', 'pace'];
const MANY_FIELDS: Array<keyof ArchetypeAttrs> = ['tone', 'timbre'];

export function ArchetypePicker({
    value,
    onChange,
    onSkip,
}: {
    value: ArchetypeAttrs;
    onChange: (v: ArchetypeAttrs) => void;
    onSkip: () => void;
}) {
    const setField = (key: keyof ArchetypeAttrs, val: any) => {
        onChange({ ...value, [key]: val });
    };

    return (
        <div className="archetype-picker">
            {ONE_FIELDS.map(key => {
                const section = getSection(key);
                if (!section) return null;
                return (
                    <OneSelect
                        key={key}
                        section={section}
                        value={value[key] as string | undefined}
                        onChange={val => setField(key, val)}
                    />
                );
            })}

            {MANY_FIELDS.map(key => {
                const section = getSection(key);
                if (!section) return null;
                return (
                    <ManySelect
                        key={key}
                        section={section}
                        value={value[key] as string[] | undefined}
                        onChange={val => setField(key, val)}
                    />
                );
            })}

            <button
                type="button"
                onClick={onSkip}
                className="btn-ghost archetype-picker__skip-btn"
            >
                Skip — use a generic prompt
            </button>
        </div>
    );
}
