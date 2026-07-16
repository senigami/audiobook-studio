/**
 * ArchetypeQuickPick.tsx — owner-requested (2026-07-16)
 *
 * A single combobox over the 39-row voice archetype table
 * (`recordingArchetypes.ts`, statically bundled from
 * design-docs/reference/voice-archetypes/voice_archetypes.json).
 * Picking an archetype fills class/gender/age/tone/timbre/pace at once,
 * instead of tagging each field by hand — a fast starting point for a new
 * voice's metadata (`OverviewTab.tsx`) or a Record-mode session
 * (`ArchetypePicker.tsx`), used in both places per the owner's explicit ask.
 *
 * Owner-confirmed behavior: picking an archetype OVERWRITES all six fields
 * unconditionally, even if some are already set — a deliberate reset, not a
 * merge. This is a bare picker with no local selection state of its own; the
 * caller's fields are the only source of truth (so re-rendering with a
 * different `value` — e.g. after a manual edit — doesn't fight the picker).
 */
import type { VoiceAttributes } from '@/types';
import SearchableSelect from '@/components/forms/SearchableSelect';
import { recordingArchetypes } from './recordingArchetypes';

export type ArchetypeQuickPickFields = Pick<VoiceAttributes, 'class' | 'gender' | 'age' | 'tone' | 'timbre' | 'pace'>;

function splitList(csv: string): string[] {
    return csv.split(',').map(s => s.trim()).filter(Boolean);
}

const ARCHETYPE_OPTIONS = recordingArchetypes.map(a => ({ id: a.archetype_name, name: a.archetype_name }));

export interface ArchetypeQuickPickProps {
    onPick: (fields: ArchetypeQuickPickFields) => void;
    disabled?: boolean;
}

export function ArchetypeQuickPick({ onPick, disabled }: ArchetypeQuickPickProps) {
    const handleChange = (archetypeName: string) => {
        const archetype = recordingArchetypes.find(a => a.archetype_name === archetypeName);
        if (!archetype) return;
        onPick({
            class: archetype.class,
            gender: archetype.gender,
            age: archetype.age,
            tone: splitList(archetype.dominant_tones),
            timbre: splitList(archetype.dominant_timbres),
            pace: archetype.pace,
        });
    };

    return (
        <div className="metadata-field">
            <label className="metadata-field-label">Quick pick (optional)</label>
            <SearchableSelect
                options={ARCHETYPE_OPTIONS}
                value=""
                onChange={handleChange}
                placeholder="Pick a voice archetype to fill class/gender/age/tone/timbre/pace…"
                showCreateNew={false}
                disabled={disabled}
            />
        </div>
    );
}
