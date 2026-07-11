import type { DirectorsTool } from './types';
import { CastTool } from './CastTool';
import { BoothTool } from './BoothTool';
import { ReviseTool } from './ReviseTool';
import { WriteTool } from './WriteTool';
import { CastingCallPlaceholder, ScriptSupervisorPlaceholder, PluginPlaceholder } from './placeholders';

/**
 * The Director's Console tool registry. DirectorsConsole renders these, in
 * order, as the icon rail — adding a tool means adding an entry here, not
 * editing the Console itself. See design-docs/workflows/chapter-editor-modes.md §17.
 */
export const directorsConsoleTools: DirectorsTool[] = [
  CastTool,
  BoothTool,
  // Richer rail tooltip added here (not in ReviseTool/index.tsx, which is
  // out of scope for this pass) — Write/Revise read as near-synonyms
  // without it. See design-docs/specs/voice-tone.md.
  { ...ReviseTool, description: 'Revise — fix one segment (other audio untouched)' },
  WriteTool,
  CastingCallPlaceholder,
  ScriptSupervisorPlaceholder,
  PluginPlaceholder
];
