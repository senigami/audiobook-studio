/**
 * VoiceDetailTabs.tsx — task 001 (voice-card-consolidation, P1)
 *
 * Generic, reusable ARIA tabs primitive. No existing tabs primitive was found
 * under `frontend/src/components/ui/` (re-checked per this task's research
 * note) — `ChapterEditor/components/EditorTabs.tsx` is a same-named-pattern
 * component but is not a `role="tablist"` implementation, so it isn't reused
 * here.
 *
 * Implements the full WAI-ARIA Authoring Practices tabs pattern:
 * - `role="tablist"`/`"tab"`/`"tabpanel"`, `aria-controls`/`aria-labelledby` pairing
 * - roving tabindex (only the active tab is `tabIndex=0`, others `-1`)
 * - ArrowLeft/ArrowRight move + activate (automatic activation), Home/End jump
 *   to the first/last tab
 * - `aria-selected` synced to the active tab
 * - focus-visible: tab triggers are native `<button>` elements, so they pick
 *   up this repo's existing global keyboard-focus ring unmodified
 *   (`theme/base.css` `button:focus-visible` / `[tabindex]:focus-visible` —
 *   3px solid `var(--action-primary)` outline + a white/black box-shadow
 *   ring for AA contrast on either theme). No local override needed; the
 *   repo's button reset (`base.css`) only suppresses the ring on
 *   `:not(:focus-visible)` (mouse interaction), so the keyboard ring survives.
 *
 * Focus/announcement handoff on tab change: automatic activation means every
 * ArrowLeft/ArrowRight/Home/End press both moves focus AND changes the active
 * tab in the same keystroke — so focus must stay on the tablist for roving
 * navigation to keep working (moving focus into the panel after every arrow
 * press would break keyboard tab-to-tab browsing). Per this task's
 * acceptance criteria, panel-change is instead surfaced via an explicit
 * assistive-tech announcement (this repo's existing `sr-only` +
 * `role="status"` + `aria-live="polite"` convention, see
 * `ChapterEditor/components/DirectorsConsole/BoothTool/index.tsx`) rather
 * than by moving `document.activeElement`. Flagged here since the task's
 * "Target shape" pseudocode doesn't show this and the acceptance text
 * explicitly allows either ("asserting document.activeElement OR an
 * announced heading").
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';

export interface VoiceDetailTabDef {
    id: string;
    label: string;
    content: React.ReactNode;
}

export interface VoiceDetailTabsProps {
    tabs: VoiceDetailTabDef[];
    ariaLabel?: string;
    /** Defaults to the first tab's id. Ignored once `activeTabId` (controlled mode) is set. */
    defaultTabId?: string;
    /**
     * Controlled active-tab id (task 005) — lets a parent (e.g. `VoiceLabPage`) switch tabs
     * programmatically, such as a Variants-tab "Script" button jumping to the Test tab. Omit for
     * the original fully-uncontrolled behavior (internal state only).
     */
    activeTabId?: string;
    /** Fires whenever the active tab changes (click, arrow-key navigation, or Home/End) — required
     * alongside `activeTabId` for controlled mode. */
    onTabChange?: (id: string) => void;
}

export const VoiceDetailTabs: React.FC<VoiceDetailTabsProps> = ({
    tabs,
    ariaLabel = 'Voice management',
    defaultTabId,
    activeTabId,
    onTabChange,
}) => {
    const isControlled = activeTabId !== undefined;
    const [internalActiveId, setInternalActiveId] = useState<string>(defaultTabId ?? tabs[0]?.id ?? '');
    const activeId = isControlled ? activeTabId! : internalActiveId;
    const [announcement, setAnnouncement] = useState('');
    const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

    const activeIndex = useMemo(
        () => Math.max(0, tabs.findIndex(t => t.id === activeId)),
        [tabs, activeId]
    );

    const activate = useCallback((id: string, focusTrigger: boolean) => {
        if (!isControlled) setInternalActiveId(id);
        onTabChange?.(id);
        const tab = tabs.find(t => t.id === id);
        if (tab) setAnnouncement(`${tab.label} panel selected`);
        if (focusTrigger) tabRefs.current[id]?.focus();
    }, [tabs, isControlled, onTabChange]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (tabs.length === 0) return;
        let nextIndex: number | null = null;
        switch (e.key) {
            case 'ArrowRight':
                nextIndex = (activeIndex + 1) % tabs.length;
                break;
            case 'ArrowLeft':
                nextIndex = (activeIndex - 1 + tabs.length) % tabs.length;
                break;
            case 'Home':
                nextIndex = 0;
                break;
            case 'End':
                nextIndex = tabs.length - 1;
                break;
            default:
                return;
        }
        e.preventDefault();
        const next = tabs[nextIndex];
        if (next) activate(next.id, true);
    };

    return (
        <div className="voice-detail-tabs">
            <div
                role="tablist"
                aria-label={ariaLabel}
                className="voice-detail-tabs__list"
                onKeyDown={handleKeyDown}
            >
                {tabs.map(tab => {
                    const isActive = tab.id === activeId;
                    return (
                        <button
                            key={tab.id}
                            ref={el => { tabRefs.current[tab.id] = el; }}
                            type="button"
                            role="tab"
                            id={`voice-detail-tab-${tab.id}`}
                            aria-controls={`voice-detail-panel-${tab.id}`}
                            aria-selected={isActive}
                            tabIndex={isActive ? 0 : -1}
                            className={
                                'voice-detail-tabs__tab' +
                                (isActive ? ' voice-detail-tabs__tab--active' : '')
                            }
                            onClick={() => activate(tab.id, false)}
                        >
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {tabs.map(tab => (
                <div
                    key={tab.id}
                    role="tabpanel"
                    id={`voice-detail-panel-${tab.id}`}
                    aria-labelledby={`voice-detail-tab-${tab.id}`}
                    hidden={tab.id !== activeId}
                    className="voice-detail-tabs__panel"
                >
                    {tab.content}
                </div>
            ))}

            {/* Assistive-tech-only announcement on tab change (repo convention:
                sr-only + role=status + aria-live=polite, see BoothTool/index.tsx) */}
            <div className="sr-only" role="status" aria-live="polite">
                {announcement}
            </div>
        </div>
    );
};
