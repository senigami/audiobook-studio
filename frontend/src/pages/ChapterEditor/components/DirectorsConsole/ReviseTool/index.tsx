import React from 'react';
import { PenLine } from 'lucide-react';
import type { DirectorsTool } from '../types';
import { ToolStub } from '../ToolStub';

const ReviseToolBody: React.FC = () => <ToolStub icon={PenLine} label="Revise" />;

/**
 * Revise mode — in-place paragraph editing per segment, with a labeled
 * escape hatch for structural editing. Stub only; see
 * design-docs/workflows/chapter-editor-modes.md §7.
 */
export const ReviseTool: DirectorsTool = {
  id: 'revise',
  label: 'Revise',
  icon: PenLine,
  component: ReviseToolBody
};
