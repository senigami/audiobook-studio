import type { DirectorsTool } from './types';
import { CastTool } from './CastTool';
import { BoothTool } from './BoothTool';
import { ReviseTool } from './ReviseTool';
import { CastingCallPlaceholder, ScriptSupervisorPlaceholder, PluginPlaceholder } from './placeholders';

/**
 * The Director's Console tool registry. DirectorsConsole renders these, in
 * order, as the icon rail — adding a tool means adding an entry here, not
 * editing the Console itself. See design-docs/workflows/chapter-editor-modes.md §17.
 */
export const directorsConsoleTools: DirectorsTool[] = [
  CastTool,
  BoothTool,
  ReviseTool,
  CastingCallPlaceholder,
  ScriptSupervisorPlaceholder,
  PluginPlaceholder
];
