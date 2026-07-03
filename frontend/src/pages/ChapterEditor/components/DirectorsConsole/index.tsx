import React, { useState } from 'react';
import { directorsConsoleTools } from './registry';

interface DirectorsConsoleProps {
  /** Tool id to activate initially. Defaults to the first registered tool. */
  initialToolId?: string;
}

/**
 * Left-rail router for the Director's Console: renders the icon rail from
 * the tool registry and the active tool's body below it.
 *
 * This is a foundation-only scaffold (design-docs/workflows/chapter-editor-modes.md §17).
 * It is not yet mounted into the chapter editor route — a future pass wires
 * mode state, keyboard shortcuts, and render-on-mode-exit hooks.
 */
export const DirectorsConsole: React.FC<DirectorsConsoleProps> = ({ initialToolId }) => {
  const tools = directorsConsoleTools;
  const initialIndex = Math.max(0, tools.findIndex((tool) => tool.id === initialToolId));
  const [activeToolId, setActiveToolId] = useState<string>(tools[initialIndex]?.id ?? tools[0]?.id);

  const activeTool = tools.find((tool) => tool.id === activeToolId) ?? tools[0];
  const ActiveToolBody = activeTool?.component;

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
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = tool.id === activeTool?.id;
          return (
            <button
              key={tool.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={tool.label}
              title={tool.label}
              onClick={() => setActiveToolId(tool.id)}
              className={isActive ? 'btn-primary' : 'btn-ghost'}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.2rem',
                padding: '0.6rem',
                borderRadius: '10px',
                fontSize: '0.7rem',
                fontWeight: 700,
                minWidth: '64px'
              }}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{tool.label}</span>
            </button>
          );
        })}
      </div>

      <div role="tabpanel" style={{ flex: 1, overflow: 'auto' }}>
        {ActiveToolBody ? <ActiveToolBody /> : null}
      </div>
    </div>
  );
};
