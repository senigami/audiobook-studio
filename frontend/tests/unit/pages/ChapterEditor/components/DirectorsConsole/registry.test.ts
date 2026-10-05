import { describe, it, expect } from 'vitest';
import { CastTool } from '@/pages/ChapterEditor/components/DirectorsConsole/CastTool';
import { BoothTool } from '@/pages/ChapterEditor/components/DirectorsConsole/BoothTool';
import { ReviseTool } from '@/pages/ChapterEditor/components/DirectorsConsole/ReviseTool';
import { WriteTool } from '@/pages/ChapterEditor/components/DirectorsConsole/WriteTool';
import type { DirectorsTool } from '@/pages/ChapterEditor/components/DirectorsConsole/types';

// Consolidated "registry contract" test for the four real (non-placeholder)
// Director's Console tools — CastTool/BoothTool/ReviseTool/WriteTool each
// used to carry their own near-identical block asserting only hardcoded
// id/label/demoPlaceholder constants (no interaction or branch). Collapsed
// here per the 2026-07-10 test value audit (DISCUSS section): a single
// parametrized table keeps the precise per-tool failure message while
// removing four copies of the same shape.
const tools: { name: string; tool: DirectorsTool; expectedId: string; expectedLabel: string }[] = [
  { name: 'CastTool', tool: CastTool, expectedId: 'cast', expectedLabel: 'Cast' },
  { name: 'BoothTool', tool: BoothTool, expectedId: 'booth', expectedLabel: 'Booth' },
  { name: 'ReviseTool', tool: ReviseTool, expectedId: 'revise', expectedLabel: 'Revise' },
  { name: 'WriteTool', tool: WriteTool, expectedId: 'write', expectedLabel: 'Write' },
];

describe('DirectorsConsole tool registry contract', () => {
  it.each(tools)('$name registers with the id/label/component expected by the registry', ({ tool, expectedId, expectedLabel }) => {
    expect(tool.id).toBe(expectedId);
    expect(tool.label).toBe(expectedLabel);
    expect(tool.demoPlaceholder).toBe(false);
    expect(typeof tool.component).toBe('function');
  });
});
