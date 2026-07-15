import React, { useCallback, useState } from 'react';
import { directorsConsoleTools } from './registry';
import { DirtyGuardProvider } from './DirtyGuardContext';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';

interface DirectorsConsoleProps {
  /** Tool id to activate initially. Defaults to the first registered tool. */
  initialToolId?: string;
}

interface DirtyState {
  isDirty: boolean;
  message?: string;
}

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

  return (
    <div
      data-testid="directors-console"
      style={{ display: 'flex', height: '100%', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}
    >
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
