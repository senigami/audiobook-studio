import { chip } from './chip';
import type { TaxonomySection } from './taxonomy';
import { categoryForAttributeKey } from '../VoicePills';

// ---------------------------------------------------------------------------
// OneSelect — single-value taxonomy field
// ---------------------------------------------------------------------------
export function OneSelect({
    section,
    value,
    onChange,
}: {
    section: TaxonomySection;
    value: string | undefined;
    onChange: (v: string | undefined) => void;
}) {
    const isRequired = section.rule === 'one-required';
    // F3.1: tint the section header to match the pill hue its values render
    // under (design-system.md §5), so "this pink pill" ⇒ "the GENDER
    // section" is legible without reading every pill.
    const category = categoryForAttributeKey(section.key);
    return (
        <div className="metadata-field">
            <label className="metadata-field-label" style={{ color: `var(--pill-${category}-text)` }}>
                {section.label.toUpperCase()}
                {isRequired && <span style={{ color: 'var(--error)', marginLeft: '2px' }}>*</span>}
            </label>
            <div className="metadata-chip-row">
                {section.values.map(opt =>
                    chip(opt.label, value === opt.id, () => onChange(value === opt.id && !isRequired ? undefined : opt.id), isRequired, category)
                )}
            </div>
        </div>
    );
}
