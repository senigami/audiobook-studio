/**
 * OverviewTab.tsx — task 002 (voice-card-consolidation, P2)
 *
 * Overview tabpanel: inline, always-editable voice metadata content,
 * relocated from `MetadataEditorModal.tsx` (`Voices/components/`,
 * body `:150-243`) per this task's "Exact files" note. The modal chrome
 * (`:104-130`, `useFocusTrap`, `role="dialog"`, Escape handling) is
 * deliberately NOT ported -- there is nothing to trap focus into once
 * this content lives inline in a tabpanel.
 *
 * Save logic (`handleSave`, `MetadataEditorModal.tsx:70-93`) and the
 * required-fields gating (`requiredMissing`, `:95-96`) are reused
 * verbatim: same patch shape passed to `api.patchVoiceMetadata`, same
 * required warning text.
 *
 * Explicit-Save vs autosave-on-change (flagged per this task's own
 * instruction, not silently decided): kept explicit Save button. The
 * modal's affordance was already look-then-commit (edit several fields,
 * then Save); autosaving on every field change would fire a PATCH per
 * keystroke-equivalent (e.g. one per tag added, per select changed) with
 * no debounce infrastructure in this codebase to lean on, and would
 * silently swallow the existing 422 error-surfacing UX (there'd be no
 * single moment to show a failure against unsaved-vs-saved state). The
 * only real change from the original modal is that there's no
 * Cancel/dismiss action (nothing to cancel out of -- the tab is always
 * present), which the target-shape pseudocode already reflects.
 */
import React, { useCallback, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { VoiceAttributes, VoiceMetadata } from '@/types';
import { api } from '@/api';
import { getSection } from '@/pages/Voices/components/metadata/taxonomy';
import { OneSelect } from '@/pages/Voices/components/metadata/OneSelect';
import { ManySelect } from '@/pages/Voices/components/metadata/ManySelect';
import { categoryForAttributeKey } from '@/pages/Voices/components/VoicePills';
import SearchableSelect from '@/components/forms/SearchableSelect';
import { TagsInput } from '@/pages/Voices/components/metadata/TagsInput';
import { ArchetypeQuickPick, type ArchetypeQuickPickFields } from '@/pages/Voices/components/metadata/ArchetypeQuickPick';

export interface OverviewTabProps {
    voice: VoiceMetadata;
    onSaved: (updated: VoiceMetadata) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ voice, onSaved }) => {
    // Local draft state -- reset when voice changes
    const [attrs, setAttrs] = useState<VoiceAttributes>(voice?.attributes || {});
    const [tags, setTags] = useState<string[]>(voice?.tags || []);
    const [description, setDescription] = useState(voice?.description || '');
    const [languages, setLanguages] = useState<string>((voice?.languages || []).join(', '));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Sync when voice prop changes (different voice opened)
    React.useEffect(() => {
        setAttrs(voice?.attributes || {});
        setTags(voice?.tags || []);
        setDescription(voice?.description || '');
        setLanguages((voice?.languages || []).join(', '));
        setError(null);
    }, [voice?.id]);

    const setAttr = useCallback((key: keyof VoiceAttributes, val: any) => {
        setAttrs(prev => ({ ...prev, [key]: val }));
    }, []);

    // Owner-requested (2026-07-16): picking an archetype overwrites
    // class/gender/age/tone/timbre/pace unconditionally -- a deliberate
    // reset, not a merge with whatever was already tagged.
    const handleArchetypePick = useCallback((fields: ArchetypeQuickPickFields) => {
        setAttrs(prev => ({ ...prev, ...fields }));
    }, []);

    const handleSave = async () => {
        if (!voice) return;
        setSaving(true);
        setError(null);
        try {
            const patch = {
                description: description.trim() || undefined,
                attributes: Object.keys(attrs).length > 0 ? attrs : undefined,
                tags: tags.length > 0 ? tags : undefined,
                languages: languages
                    .split(',')
                    .map(l => l.trim())
                    .filter(Boolean),
            };
            const updated = await api.patchVoiceMetadata(voice.id, patch);
            onSaved(updated);
        } catch (err: any) {
            // Surface 422 verbatim per spec
            setError(err.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const requiredMissing =
        !attrs.class || !attrs.gender || !attrs.age;

    if (!voice) return null;

    const comboboxFields: Array<keyof VoiceAttributes> = ['class', 'gender', 'age'];
    const oneFields: Array<keyof VoiceAttributes> = ['accent', 'pace'];
    const manyFields: Array<keyof VoiceAttributes> = ['language', 'style', 'tone', 'timbre', 'use_case', 'quality'];

    return (
        <div className="overview-tab">
            {/* Description */}
            <div className="metadata-field">
                <label htmlFor="voice-description" className="metadata-field-label">
                    DESCRIPTION
                </label>
                <textarea
                    id="voice-description"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="1-3 sentences describing this voice..."
                    rows={3}
                    className="metadata-field-input"
                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
            </div>

            {/* Languages */}
            <div className="metadata-field">
                <label htmlFor="voice-languages" className="metadata-field-label">
                    LANGUAGES (BCP-47, comma-separated)
                </label>
                <input
                    id="voice-languages"
                    type="text"
                    value={languages}
                    onChange={e => setLanguages(e.target.value)}
                    placeholder="en-US, fr-FR..."
                    className="metadata-field-input"
                    style={{ minHeight: '44px' }}
                />
            </div>

            <hr className="metadata-editor-modal__divider" />

            <ArchetypeQuickPick onPick={handleArchetypePick} />

            <p className="metadata-field-label" style={{ margin: 0 }}>
                ATTRIBUTES <span style={{ color: 'var(--error)' }}>*</span> required fields
            </p>

            {/* Single-value required fields (class/gender/age) — searchable combobox,
                laid out side by side (user-reported, 2026-07-16: these read as
                unnecessarily wide stacked full-width). */}
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {comboboxFields.map(key => {
                const section = getSection(key);
                if (!section) return null;
                // F3.1: tint the header to match this field's pill hue
                // (design-system.md §5) so it visually maps to the
                // corresponding summary pill above.
                const category = categoryForAttributeKey(section.key);
                return (
                    <div className="metadata-field" key={key} style={{ flex: '1 1 140px', minWidth: '140px' }}>
                        <label className="metadata-field-label" style={{ color: `var(--pill-${category}-text)` }}>
                            {section.label.toUpperCase()}
                            <span style={{ color: 'var(--error)', marginLeft: '2px' }}>*</span>
                        </label>
                        <SearchableSelect
                            options={section.values.map(v => ({ id: v.id, name: v.label }))}
                            value={(attrs as any)[key] ?? ''}
                            onChange={val => setAttr(key, val === 'none' ? undefined : val)}
                            placeholder={`Select ${section.label}...`}
                            showCreateNew={false}
                        />
                    </div>
                );
            })}
            </div>

            {/* One-value fields */}
            {oneFields.map(key => {
                const section = getSection(key);
                if (!section) return null;
                return (
                    <OneSelect
                        key={key}
                        section={section}
                        value={(attrs as any)[key]}
                        onChange={val => setAttr(key, val)}
                    />
                );
            })}

            {/* Many-value fields */}
            {manyFields.map(key => {
                const section = getSection(key);
                if (!section) return null;
                return (
                    <ManySelect
                        key={key}
                        section={section}
                        value={(attrs as any)[key]}
                        onChange={val => setAttr(key, val)}
                    />
                );
            })}

            <hr className="metadata-editor-modal__divider" />

            {/* Free tags */}
            <TagsInput tags={tags} onChange={setTags} />

            {/* 422 error */}
            {error && (
                <div className="metadata-editor-modal__error-banner">
                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <span style={{ whiteSpace: 'pre-wrap' }}>{error}</span>
                </div>
            )}

            <div className="overview-tab__footer">
                {requiredMissing && (
                    <span className="metadata-editor-modal__required-warning">
                        Class, Gender, and Age are required to save.
                    </span>
                )}
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || requiredMissing}
                    className="btn-primary metadata-editor-modal__action-btn"
                    style={{ padding: '0 var(--space-5)', opacity: (saving || requiredMissing) ? 0.5 : 1 }}
                >
                    {saving ? 'Saving…' : 'Save'}
                </button>
            </div>
        </div>
    );
};
