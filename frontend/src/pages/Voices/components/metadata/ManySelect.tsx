import { chip } from './chip';
import type { TaxonomySection } from './taxonomy';

// ---------------------------------------------------------------------------
// ManySelect — multi-value taxonomy field
// ---------------------------------------------------------------------------
export function ManySelect({
    section,
    value,
    onChange,
}: {
    section: TaxonomySection;
    value: string[] | undefined;
    onChange: (v: string[]) => void;
}) {
    const selected = value || [];
    const toggle = (id: string) => {
        if (selected.includes(id)) {
            onChange(selected.filter(x => x !== id));
        } else {
            onChange([...selected, id]);
        }
    };
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                {section.label.toUpperCase()}
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {section.values.map(opt =>
                    chip(opt.label, selected.includes(opt.id), () => toggle(opt.id))
                )}
            </div>
        </div>
    );
}
