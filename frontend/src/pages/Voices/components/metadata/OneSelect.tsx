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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                {section.label.toUpperCase()}
                {isRequired && <span style={{ color: 'var(--error)', marginLeft: '2px' }}>*</span>}
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {section.values.map(opt =>
                    chip(opt.label, value === opt.id, () => onChange(value === opt.id && !isRequired ? undefined : opt.id), isRequired)
                )}
            </div>
        </div>
    );
}
