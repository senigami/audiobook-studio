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
        <div className="metadata-field">
            <label className="metadata-field-label">
                {section.label.toUpperCase()}
            </label>
            <div className="metadata-chip-row">
                {section.values.map(opt =>
                    chip(opt.label, selected.includes(opt.id), () => toggle(opt.id))
                )}
            </div>
        </div>
    );
}
