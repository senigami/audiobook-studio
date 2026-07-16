import type { LucideIcon } from 'lucide-react';

interface MobileModeSwitcherProps {
  tools: Array<{ id: string; label: string; icon: LucideIcon }>;
  activeToolId: string;
  onSelect: (id: string) => void;
}

/**
 * Persistent bottom tab bar for switching between ChapterEditor's
 * mobile-eligible modes (Booth, Book view). Presentational only — the
 * caller (DirectorsConsole) decides which tools are mobile-eligible and
 * owns the active-tool state; this component just renders the bar and
 * reports selections.
 *
 * Mirrors `MobileNavDrawer`'s active-state signaling convention
 * (`aria-current` on the active item, icon+label button structure), but
 * this is a persistent bar rather than a modal overlay, so it does not use
 * `useFocusTrap`. Uses `role="tablist"`/`role="tab"` to match the desktop
 * rail in `DirectorsConsole/index.tsx`.
 */
export function MobileModeSwitcher({ tools, activeToolId, onSelect }: MobileModeSwitcherProps) {
  return (
    <div className="mobile-mode-switcher" role="tablist" aria-label="Chapter editor modes">
      {tools.map((tool) => {
        const Icon = tool.icon;
        const isActive = tool.id === activeToolId;

        return (
          <button
            key={tool.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-current={isActive ? 'true' : undefined}
            aria-label={tool.label}
            className={`mobile-mode-switcher__item${isActive ? ' mobile-mode-switcher__item--active' : ''}`}
            onClick={() => onSelect(tool.id)}
          >
            <Icon aria-hidden="true" size={18} strokeWidth={isActive ? 2.4 : 2} />
            <span className="mobile-mode-switcher__label">{tool.label}</span>
          </button>
        );
      })}
    </div>
  );
}
