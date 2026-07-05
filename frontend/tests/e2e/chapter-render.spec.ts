import { test, expect } from '@playwright/test';

test('chapter segment rendering highlights correctly', async ({ page }) => {
  const chapterId = 'test-chapter-1';
  const projectId = 'test-project-1';
  const jobId = 'test-job-1';
  
  // Mock API responses
  await page.route('**/api/home', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        system_info: { startup_ready: true },
        projects: [{ id: projectId, name: 'Test Project' }],
        chapters: [{ id: chapterId, project_id: projectId, title: 'Test Chapter' }],
        jobs: []
      })
    });
  });

  await page.route(`**/api/chapters/${chapterId}`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: chapterId,
        project_id: projectId,
        title: 'Test Chapter',
        text_content: 'This is some text for s1. This is some text for s2. This is some text for s3.'
      })
    });
  });

  await page.route(`**/api/chapters/${chapterId}/script-view`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        chapter_id: chapterId,
        base_revision_id: 'rev1',
        paragraphs: [
          { id: 'p1', span_ids: ['s1', 's2'] },
          { id: 'p2', span_ids: ['s3'] }
        ],
        spans: [
          { id: 's1', order_index: 0, text: 'Paragraph 1 segment 1.', status: 'idle', char_count: 20, sanitized_char_count: 20 },
          { id: 's2', order_index: 1, text: 'Paragraph 1 segment 2.', status: 'idle', char_count: 20, sanitized_char_count: 20 },
          { id: 's3', order_index: 2, text: 'Paragraph 2 segment 3.', status: 'idle', char_count: 20, sanitized_char_count: 20 }
        ],
        render_batches: [
          { id: 'b1', span_ids: ['s1', 's2'], status: 'idle', estimated_work_weight: 40 },
          { id: 'b2', span_ids: ['s3'], status: 'idle', estimated_work_weight: 20 }
        ],
        audio_groups: []
      })
    });
  });

  await page.route(`**/api/projects/${projectId}/characters`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });


  await page.route('**/api/processing_queue', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([])
    });
  });

  await page.route('**/api/segments/generate', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' })
    });
  });

  let wsClient: any;
  await page.routeWebSocket('**/ws', ws => {
    wsClient = ws;
    ws.on('message', message => {
      const data = JSON.parse(typeof message === 'string' ? message : message.toString());
      if (data.type === 'jobs_snapshot_request') {
        ws.send(JSON.stringify({ type: 'jobs_snapshot', jobs: [] }));
      }
    });
  });

  await page.goto(`/chapter/${chapterId}`);

  // Wait for the span to be present in the DOM
  const s1 = page.locator('[data-testid="script-span-s1"]');
  const s2 = page.locator('[data-testid="script-span-s2"]');
  const s3 = page.locator('[data-testid="script-span-s3"]');

  await expect(s1).toBeVisible({ timeout: 15000 });
  await expect(s1).toHaveAttribute('data-render-status', 'idle');

  // Click generate to trigger optimistic highlights
  await s1.hover();
  await page.locator('[data-testid="generate-span-s1"]').click();

  // Verify optimistic highlights
  await expect(s1).toHaveAttribute('data-render-status', 'rendering');
  await expect(s2).toHaveAttribute('data-render-status', 'rendering');

  // Start the job
  await wsClient.send(JSON.stringify({
    type: 'job_updated',
    job_id: jobId,
    updates: {
      status: 'running',
      project_id: projectId,
      chapter_id: chapterId,
      segment_ids: ['s1', 's2', 's3'],
      active_segment_id: 's1',
      progress: 0.1,
      updated_at: Date.now()
    }
  }));

  await expect(s1).toHaveAttribute('data-render-status', 'rendering');
  await expect(s2).toHaveAttribute('data-render-status', 'rendering');
  await expect(s3).toHaveAttribute('data-render-status', 'queued');

  // Move to next segment (next batch)
  await wsClient.send(JSON.stringify({
    type: 'job_updated',
    job_id: jobId,
    updates: {
      project_id: projectId,
      active_segment_id: 's3',
      progress: 0.7,
      updated_at: Date.now() + 1000
    }
  }));

  // Regression check: s1 and s2 must lose highlights even if they were optimistically added
  await expect(s1).not.toHaveAttribute('data-render-status', 'rendering');
  await expect(s2).not.toHaveAttribute('data-render-status', 'rendering');
  await expect(s3).toHaveAttribute('data-render-status', 'rendering');
});

test('W-PAR concurrent fan-out: active_segments_map highlights multiple non-adjacent segments simultaneously', async ({ page }) => {
  // Escaped-defect regression pin (2026-07-05): this is the actual W-PAR
  // Phase 1 visual-check criterion ("multiple segment bars advance
  // simultaneously, not one at a time") simulated end-to-end against the
  // REAL running app, with only the network/websocket boundary mocked
  // (Playwright page.route / page.routeWebSocket) — no real backend, no real
  // TTS synthesis, but every frontend code path (studioSocketBus ->
  // liveEventAuditStore -> useJobs -> useStudioChapter -> ScriptView DOM) is
  // real. This is the "can I simulate the whole thing and just look at it"
  // verification a live TTS render can't give cheaply.
  const chapterId = 'test-chapter-2';
  const projectId = 'test-project-2';
  const jobId = 'test-job-2';

  await page.route('**/api/home', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        system_info: { startup_ready: true },
        projects: [{ id: projectId, name: 'Test Project' }],
        chapters: [{ id: chapterId, project_id: projectId, title: 'Test Chapter' }],
        jobs: []
      })
    });
  });

  await page.route(`**/api/chapters/${chapterId}`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: chapterId,
        project_id: projectId,
        title: 'Test Chapter',
        text_content: 'This is some text for s1. This is some text for s2. This is some text for s3.'
      })
    });
  });

  // Two DIFFERENT render batches (b1=[s1,s2], b2=[s3]) — matching a real
  // multi-chunk-group chapter fan-out, so lighting up both batches at once
  // proves genuinely separate concurrent children, not just one entry's
  // batch-sibling expansion.
  await page.route(`**/api/chapters/${chapterId}/script-view`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        chapter_id: chapterId,
        base_revision_id: 'rev1',
        paragraphs: [
          { id: 'p1', span_ids: ['s1', 's2'] },
          { id: 'p2', span_ids: ['s3'] }
        ],
        spans: [
          { id: 's1', order_index: 0, text: 'Paragraph 1 segment 1.', status: 'idle', char_count: 20, sanitized_char_count: 20 },
          { id: 's2', order_index: 1, text: 'Paragraph 1 segment 2.', status: 'idle', char_count: 20, sanitized_char_count: 20 },
          { id: 's3', order_index: 2, text: 'Paragraph 2 segment 3.', status: 'idle', char_count: 20, sanitized_char_count: 20 }
        ],
        render_batches: [
          { id: 'b1', span_ids: ['s1', 's2'], status: 'idle', estimated_work_weight: 40 },
          { id: 'b2', span_ids: ['s3'], status: 'idle', estimated_work_weight: 20 }
        ],
        audio_groups: []
      })
    });
  });

  await page.route(`**/api/projects/${projectId}/characters`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
  await page.route(`**/api/projects/${projectId}/chapters/${chapterId}/render_groups`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
  await page.route(`**/api/projects/${projectId}/audiobooks`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
  // useBookData.ts's Promise.all also fetches the bare project + its chapter
  // list directly (api.fetchProject / api.fetchChapters) — missing from the
  // original test in this file too; an uncaught "Project not found" error
  // here doesn't visibly break rendering but it's worth not leaving latent.
  await page.route(`**/api/projects/${projectId}`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: projectId, name: 'Test Project', series: null, author: null, speaker_profile_name: null, cover_image_path: null, created_at: 0, updated_at: 0 }),
    });
  });
  await page.route(`**/api/projects/${projectId}/chapters`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: chapterId, project_id: projectId, title: 'Test Chapter' }]),
    });
  });
  await page.route('**/api/processing_queue', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  // NOTE: the OTHER test in this file establishes its job via a raw
  // `{type: 'job_updated', ...}` websocket message — there is no handler for
  // that message type anywhere in the current frontend (grep confirms it;
  // that test is stale against an old wire protocol, pre-existing/unrelated
  // to this fix). The only currently-live way to seed a job row over the
  // mocked socket is a `jobs_snapshot` reply, so this test uses that instead.
  const jobsSnapshotMessage = JSON.stringify({
    type: 'jobs_snapshot',
    jobs: [{
      id: jobId,
      engine: 'xtts',
      status: 'running',
      project_id: projectId,
      chapter_id: chapterId,
      progress: 0.1,
      created_at: Date.now() / 1000,
      has_segment_support: true,
    }],
  });

  let wsClient: any;
  await page.routeWebSocket('**/ws', ws => {
    wsClient = ws;
    // Push proactively on connect (a real backend can do this too, not just
    // reply to a snapshot request) AND still answer an explicit request —
    // sidesteps needing to prove exactly when/whether the client's own
    // request fires, which isn't what this test is trying to verify.
    ws.send(jobsSnapshotMessage);
    ws.on('message', message => {
      const data = JSON.parse(typeof message === 'string' ? message : message.toString());
      if (data.type === 'jobs_snapshot_request') {
        ws.send(jobsSnapshotMessage);
      }
    });
  });

  await page.goto(`/chapter/${chapterId}`);

  const s1 = page.locator('[data-testid="script-span-s1"]');
  const s2 = page.locator('[data-testid="script-span-s2"]');
  const s3 = page.locator('[data-testid="script-span-s3"]');
  await expect(s1).toBeVisible({ timeout: 15000 });
  // No explicit wait needed here: the jobs_snapshot was pushed the instant
  // the mocked connection opened (early in page load), well before the
  // slower REST round-trip that gates s1's visibility above resolves.

  // The actual fix under test: a real backend now emits active_segments_map
  // on the chapters.progress topic (the "delivery leg", build_chapter_progress_event
  // + ws.py), populated event-driven per child tick (_on_child_segment_tick) —
  // simulate exactly that frame shape (app.api.contracts.events.build_studio_event).
  await wsClient.send(JSON.stringify({
    type: 'studio_event',
    version: 1,
    topic: 'chapters.progress',
    eventKind: 'chapter_progress',
    source: 'e2e-sim',
    emittedAt: Date.now() / 1000,
    pluginId: null,
    ids: { projectId, chapterId, jobId, segmentId: null },
    payload: {
      status: 'running',
      progress: 0.4,
      groupedProgress: 0.4,
      etaSeconds: null,
      message: null,
      reasonCode: null,
      renderGroupCount: 2,
      completedRenderGroups: 0,
      hasSegmentSupport: true,
      confidence: 1.0,
      active_segments_map: {
        s1: { phase: 'rendering', progress: 0.4, eta_seconds: 12 },
        s3: { phase: 'rendering', progress: 0.2, eta_seconds: 20 },
      },
    },
  }));

  // The actual W-PAR Phase 1 visual-check criterion: TWO non-adjacent
  // segments (different render batches — genuinely separate concurrent
  // children, not one entry's batch-sibling expansion) rendering AT THE
  // SAME TIME, not one-at-a-time.
  await expect(s1).toHaveAttribute('data-render-status', 'rendering');
  await expect(s2).toHaveAttribute('data-render-status', 'rendering'); // batch b1 sibling of s1
  await expect(s3).toHaveAttribute('data-render-status', 'rendering');
});
