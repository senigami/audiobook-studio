import React, { useCallback, useEffect, useState } from 'react';
import { directorsConsoleTools } from './registry';
import { DirtyGuardProvider } from './DirtyGuardContext';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import type { LucideIcon } from 'lucide-react';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MobileModeSwitcher } from './MobileModeSwitcher';

interface DirectorsConsoleProps {
  /** Tool id to activate initially. Defaults to the first registered tool. */
  initialToolId?: string;
}

interface DirtyState {
  isDirty: boolean;
  message?: string;
}

// Tool ids that remain reachable at mobile width (see
// design-docs/plans/active/final_release/... INV-MAP-4: filter at the data
// level so Cast/Revise/Write/placeholders are never mounted into the DOM on
// mobile, not merely hidden with CSS).
//
// NOTE: the originating task described this set as "Booth + Book-view", but
// no `book-view` tool id exists in `directorsConsoleTools` today (Book View
// is a separate page — see `pages/Book/BookLayout.tsx` — not a Director's
// Console tool). Flagging this rather than guessing: until a `book-view`
// tool is registered here, Booth is the only mobile-eligible entry. Add its
// id to this set when it exists.
const MOBILE_ELIGIBLE_TOOL_IDS = new Set(['booth']);

/**
 * Left-rail router for the Director's Console: renders the icon rail from
 * the tool registry and the active tool's body below it.
 *
 * Mounted as the live Chapter Workspace body by `BookLayout.tsx`
 * (design-docs/workflows/chapter-editor-modes.md §17). A future pass still
 * wires additional mode state, keyboard shortcuts, and render-on-mode-exit
 * hooks.
 */
export const DirectorsConsole: React.FC<DirectorsConsoleProps> = ({ initialToolId }) => {
  const tools = directorsConsoleTools;
  const isMobile = useMediaQuery('(max-width: 640px)');
  const mobileEligibleTools = tools.filter((tool) => MOBILE_ELIGIBLE_TOOL_IDS.has(tool.id));
  const visibleTools = isMobile ? mobileEligibleTools : tools;
  const initialIndex = Math.max(0, tools.findIndex((tool) => tool.id === initialToolId));
  const [activeToolId, setActiveToolId] = useState<string>(tools[initialIndex]?.id ?? tools[0]?.id);

  // Dirty-exit guard (see DirtyGuardContext.tsx): the active tool body
  // reports whether it has unsaved/uncommitted work via context; the
  // console owns that flag and gates rail-tab switches on it so a click
  // that would unmount the tool body can't silently destroy that work.
  const [dirty, setDirtyState] = useState<DirtyState>({ isDirty: false });
  const [pendingToolId, setPendingToolId] = useState<string | null>(null);

  const handleDirtyChange = useCallback((isDirty: boolean, message?: string) => {
    setDirtyState({ isDirty, message });
  }, []);

  const activeTool = tools.find((tool) => tool.id === activeToolId) ?? tools[0];
  const ActiveToolBody = activeTool?.component;

  const handleToolClick = (toolId: string) => {
    if (toolId === activeToolId) return;
    if (dirty.isDirty) {
      setPendingToolId(toolId);
      return;
    }
    setActiveToolId(toolId);
  };

  const handleConfirmSwitch = () => {
    if (pendingToolId) {
      setActiveToolId(pendingToolId);
      setDirtyState({ isDirty: false });
    }
    setPendingToolId(null);
  };

  const handleCancelSwitch = () => {
    setPendingToolId(null);
  };

  // If the viewport crosses into mobile width while a desktop-only mode
  // (Cast/Revise/Write/placeholders) is active, redirect to the first
  // mobile-eligible tool (Booth) so the user isn't left on a mode no longer
  // reachable via any visible control.
  useEffect(() => {
    if (!isMobile) return;
    if (MOBILE_ELIGIBLE_TOOL_IDS.has(activeToolId)) return;
    const fallback = mobileEligibleTools[0]?.id;
    if (fallback) {
      setActiveToolId(fallback);
    }
    // Bypass the dirty-exit guard here: the previous mode's controls are
    // about to disappear from the DOM entirely, so there is no UI left for
    // the user to confirm against.
    setDirtyState({ isDirty: false });
    setPendingToolId(null);
  }, [isMobile, activeToolId, mobileEligibleTools]);

  return (
    <div
      data-testid="directors-console"
      style={{ display: 'flex', height: '100%', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}
    >
      {isMobile ? (
        <MobileModeSwitcher
          tools={visibleTools.map((tool) => ({ id: tool.id, label: tool.label, icon: tool.icon as LucideIcon }))}
          activeToolId={activeToolId}
          onSelect={handleToolClick}
        />
      ) : (
        <div
          role="tablist"
          aria-label="Director's Console tools"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
            padding: '0.75rem 0.5rem',
            borderRight: '1px solid var(--border)',
            background: 'var(--surface)',
            flexShrink: 0
          }}
        >
          {tools.map((tool, index) => {
            const Icon = tool.icon;
            // Exactly one tab is ever active — activeTool is derived from a
            // single activeToolId, so this is the sole source of truth for
            // "selected" (no other condition can also make a tab read active).
            const isActive = tool.id === activeTool?.id;
            const group = tool.group ?? 'mode';
            const prevGroup = index > 0 ? (tools[index - 1].group ?? 'mode') : group;
            const isFirstOfGroup = group !== prevGroup;
            return (
              <React.Fragment key={tool.id}>
                {isFirstOfGroup && (
                  <div className="directors-console__rail-divider" role="separator" aria-orientation="horizontal" />
                )}
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={tool.label}
                  title={tool.description ?? tool.label}
                  onClick={() => handleToolClick(tool.id)}
                  className={`directors-console__rail-tab${isActive ? ' directors-console__rail-tab--active' : ''}`}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{tool.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      )}

      <div role="tabpanel" style={{ flex: 1, overflow: 'auto' }}>
        <DirtyGuardProvider onDirtyChange={handleDirtyChange}>
          {ActiveToolBody ? <ActiveToolBody /> : null}
        </DirtyGuardProvider>
      </div>

      <ConfirmModal
        isOpen={pendingToolId !== null}
        title="Unsaved changes"
        message={`You have unsaved changes in ${activeTool?.label ?? 'this tool'}${dirty.message ? ` (${dirty.message})` : ''}. Switch tabs anyway? Your changes will be lost.`}
        onConfirm={handleConfirmSwitch}
        onCancel={handleCancelSwitch}
        confirmText="Switch tabs"
        cancelText="Stay"
        isDestructive
      />
    </div>
  );
};
