/**
 * REST fixtures for the demo API shim.
 *
 * These are the JSON bodies served for GET /api/<path> requests during the demo.
 * Job/chapter IDs match the ids used in scenes/renderArcScene.ts.
 */

import type { DemoApiFixtures } from '@/demo/demoApiShim';

// ---------------------------------------------------------------------------
// Ids from renderArcScene
// ---------------------------------------------------------------------------
const PROJECT_ID = 'demo-project-1';

// ---------------------------------------------------------------------------
// /api/home — shape consumed by useInitialData / App.tsx
// ---------------------------------------------------------------------------
const homeFixture = {
  projects: [
    {
      id: PROJECT_ID,
      name: 'Voyages of the Aurora',
      author: 'A. Demo Author',
      series: 'Aurora Series',
      speaker_profile_name: 'Studio Voice',
      chapter_count: 4,
      cover_image: null,
    },
    {
      id: 'demo-project-2',
      name: 'The Quiet Shore',
      author: 'B. Example',
      series: null,
      speaker_profile_name: 'Studio Voice',
      chapter_count: 2,
      cover_image: null,
    },
  ],
  chapters: [
    {
      id: 'demo-chapter-lighthouse',
      project_id: PROJECT_ID,
      title: 'Chapter 1 — The Lighthouse',
      order: 1,
      status: 'done',
      speaker_profile_name: 'Studio Voice',
    },
    {
      id: 'demo-ch-q1',
      project_id: PROJECT_ID,
      title: 'Chapter 2 — The Storm',
      order: 2,
      status: 'queued',
      speaker_profile_name: 'Studio Voice',
    },
    {
      id: 'demo-ch-q2',
      project_id: PROJECT_ID,
      title: 'Chapter 3 — First Light',
      order: 3,
      status: 'queued',
      speaker_profile_name: 'Studio Voice',
    },
    {
      id: 'demo-ch-q3',
      project_id: PROJECT_ID,
      title: 'Chapter 4 — The Return',
      order: 4,
      status: 'queued',
      speaker_profile_name: 'Studio Voice',
    },
  ],
  speaker_profiles: [
    { name: 'Studio Voice', engine: 'xtts', has_samples: true },
  ],
  speakers: [
    { name: 'Studio Voice', engine: 'xtts', preview_url: null },
  ],
  engines: [
    { id: 'xtts', label: 'XTTS', available: true },
    { id: 'voxtral', label: 'Voxtral', available: true },
    { id: 'mixed', label: 'Mixed', available: true },
  ],
  settings: {
    default_engine: 'mixed',
    default_speaker: 'Studio Voice',
  },
  paused: false,
  system_info: {
    startup_message: 'Audiobook Studio is ready.',
    startup_detail: null,
  },
};

// ---------------------------------------------------------------------------
// /api/projects
// ---------------------------------------------------------------------------
const projectsFixture = homeFixture.projects;

// ---------------------------------------------------------------------------
// /api/processing_queue — pre-scene state (3 queued jobs from queueFillScene)
// ---------------------------------------------------------------------------
const processingQueueFixture = [
  {
    id: 'demo-job-render-arc',
    chapter_id: 'demo-chapter-lighthouse',
    project_id: PROJECT_ID,
    chapter_title: 'Chapter 1 — The Lighthouse',
    engine: 'mixed',
    status: 'queued',
    progress: 0,
    eta_seconds: 59,
    message: null,
    has_segment_support: true,
    started_at: null,
    completed_at: null,
  },
  {
    id: 'demo-q-1',
    chapter_id: 'demo-ch-q1',
    project_id: PROJECT_ID,
    chapter_title: 'Chapter 2 — The Storm',
    engine: 'xtts',
    status: 'queued',
    progress: 0,
    eta_seconds: 60,
    message: null,
    has_segment_support: true,
    started_at: null,
    completed_at: null,
  },
  {
    id: 'demo-q-2',
    chapter_id: 'demo-ch-q2',
    project_id: PROJECT_ID,
    chapter_title: 'Chapter 3 — First Light',
    engine: 'voxtral',
    status: 'queued',
    progress: 0,
    eta_seconds: 75,
    message: null,
    has_segment_support: true,
    started_at: null,
    completed_at: null,
  },
  {
    id: 'demo-q-3',
    chapter_id: 'demo-ch-q3',
    project_id: PROJECT_ID,
    chapter_title: 'Chapter 4 — The Return',
    engine: 'mixed',
    status: 'queued',
    progress: 0,
    eta_seconds: 90,
    message: null,
    has_segment_support: true,
    started_at: null,
    completed_at: null,
  },
];

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
export const demoRestFixtures: DemoApiFixtures = {
  '/api/home': homeFixture,
  '/api/projects': projectsFixture,
  '/api/processing_queue': processingQueueFixture,
};
