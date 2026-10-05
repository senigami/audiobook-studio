import React from 'react';
import { Radar, ClipboardList, Puzzle } from 'lucide-react';
import type { DirectorsTool } from './types';
import { ToolStub } from './ToolStub';

/**
 * Demo placeholder slots for future Director's Console tools (see
 * design-docs/workflows/chapter-editor-modes.md §16 / §17). These reserve
 * the icon-rail position and render the same "coming soon" stub shape as
 * the real tools, but have no functionality and no dedicated folder yet —
 * a future task promotes one of these into its own tool module.
 */

const CastingCallBody: React.FC = () => <ToolStub icon={Radar} label="Casting Call" />;

export const CastingCallPlaceholder: DirectorsTool = {
  id: 'casting-call',
  label: 'Casting Call',
  icon: Radar,
  component: CastingCallBody,
  demoPlaceholder: true,
  group: 'tool'
};

const ScriptSupervisorBody: React.FC = () => <ToolStub icon={ClipboardList} label="Script Supervisor" />;

export const ScriptSupervisorPlaceholder: DirectorsTool = {
  id: 'script-supervisor',
  label: 'Script Supervisor',
  icon: ClipboardList,
  component: ScriptSupervisorBody,
  demoPlaceholder: true,
  group: 'tool'
};

const PluginBody: React.FC = () => <ToolStub icon={Puzzle} label="Plugin" />;

export const PluginPlaceholder: DirectorsTool = {
  id: 'plugin',
  label: 'Plugin',
  icon: Puzzle,
  component: PluginBody,
  demoPlaceholder: true,
  group: 'tool'
};
