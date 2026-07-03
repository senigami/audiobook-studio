import React from 'react';
import { Headphones } from 'lucide-react';
import type { DirectorsTool } from '../types';
import { ToolStub } from '../ToolStub';

const BoothToolBody: React.FC = () => <ToolStub icon={Headphones} label="Booth" />;

/**
 * Booth mode — the listening booth (karaoke highlight, tap-line-to-play,
 * playback speed, session-only margin pins). Stub only; see
 * design-docs/workflows/chapter-editor-modes.md §6.
 */
export const BoothTool: DirectorsTool = {
  id: 'booth',
  label: 'Booth',
  icon: Headphones,
  component: BoothToolBody
};
