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

  await page.route(`**/api/chapters/${chapterId}/production-blocks`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        base_revision_id: 'rev1',
        blocks: [],
        render_batches: []
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
