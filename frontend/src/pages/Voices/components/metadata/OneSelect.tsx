import { chip } from './chip';
import type { TaxonomySection } from './taxonomy';

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
    return (
        <div className="metadata-field">
            <label className="metadata-field-label">
                {section.label.toUpperCase()}
                {isRequired && <span style={{ color: 'var(--error)', marginLeft: '2px' }}>*</span>}
            </label>
            <div className="metadata-chip-row">
                {section.values.map(opt =>
                    chip(opt.label, value === opt.id, () => onChange(value === opt.id && !isRequired ? undefined : opt.id), isRequired)
                )}
            </div>
        </div>
    );
}
