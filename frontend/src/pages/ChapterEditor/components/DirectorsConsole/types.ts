import type { ComponentType } from 'react';

/**
 * Registration contract for a Director's Console tool.
 *
 * Each tool module (CastTool/, BoothTool/, ReviseTool/, and future slots)
 * exports one of these from its `index.tsx`. The DirectorsConsole renders
 * whatever is in the registry, in order — adding a tool means adding an
 * entry, not touching the Console itself.
 *
 * This is the v1 scaffold shape (see design-docs/workflows/chapter-editor-modes.md §17).
 * Fields like `shortcut`, `onModeEnter`, and `onModeExit` are reserved for
 * future wiring and are intentionally unused by this pass.
 */
export interface DirectorsTool {
  id: string;
  label: string;
  /**
   * Optional richer rail-tooltip copy (the `title` attribute on the rail
   * button). Falls back to `label` when omitted — see
   * DirectorsConsole/index.tsx.
   */
  description?: string;
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  component: ComponentType;
  shortcut?: string;
  demoPlaceholder?: boolean;
}
