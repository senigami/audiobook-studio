import React from 'react';
import { Mic2 } from 'lucide-react';
import type { DirectorsTool } from '../types';
import { ToolStub } from '../ToolStub';

const CastToolBody: React.FC = () => <ToolStub icon={Mic2} label="Cast" />;

/**
 * Cast mode — voice assignment (brush size selector, Cast palette, Match
 * Voice, Narrator eraser). Stub only; see design-docs/workflows/chapter-editor-modes.md §5.
 */
export const CastTool: DirectorsTool = {
  id: 'cast',
  label: 'Cast',
  icon: Mic2,
  component: CastToolBody,
  shortcut: 'V'
};
