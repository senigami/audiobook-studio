import { chip } from './chip';
import type { TaxonomySection } from './taxonomy';
import { categoryForAttributeKey } from '../VoicePills';

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
    // F3.1: tint the section header to match the pill hue its values render
    // under (design-system.md §5).
    const category = categoryForAttributeKey(section.key);
    return (
        <div className="metadata-field">
            <label className="metadata-field-label" style={{ color: `var(--pill-${category}-text)` }}>
                {section.label.toUpperCase()}
            </label>
            <div className="metadata-chip-row">
                {section.values.map(opt =>
                    chip(opt.label, selected.includes(opt.id), () => toggle(opt.id), undefined, category)
                )}
            </div>
        </div>
    );
}
