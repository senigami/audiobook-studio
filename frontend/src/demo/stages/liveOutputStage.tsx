/**
 * liveOutputStage — mounts the real LiveOutputTable, purely bus-driven.
 * Zero props needed; the component subscribes to liveEventAuditStore itself.
 */

import { LiveOutputTable } from '@/components/LiveOutputTable';

export const liveOutputStage = {
  id: 'live-output',
  title: 'Live Event Stream',
  description:
    'Watch the real-time event stream as the demo timeline plays. Shows topic, event kind, job/chapter/segment IDs, progress, Group ticking, ETA, and more.',
  element: <LiveOutputTable />,
};
