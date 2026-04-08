// Voice preview panel for Studio 2.0.
//
// Preview/test behavior is intentionally separated from canonical project
// rendering so it can stay lightweight and easier to debug.

import type { StudioJobEvent } from '../../../api/contracts/events';

export interface VoicePreviewPanelProps {
  latestPreviewEvent?: StudioJobEvent;
}

export const VoicePreviewPanel = (_props: VoicePreviewPanelProps) => {
  return null;
};
