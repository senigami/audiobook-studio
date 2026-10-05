/**
 * Stage-5 gate coverage for the backlog-batch-mobile-mode-and-cleanup plan
 * (task 016) — Playwright snapshot + axe scans for 3 pages this plan actually
 * touched, at light+dark theme. Mirrors the setup/teardown and `test.fixme`
 * non-blocking convention already established in `tests/e2e/a11y/axe.spec.ts`
 * (see that file's header for the resolved 2026-07-09 CI-now, non-blocking
 * rollout decision this task reuses rather than re-deciding).
 *
 * Pages chosen (most representative of this plan's actual edits):
 *   - ChapterEditor mobile Booth mode (tasks 006-008: MobileModeSwitcher,
 *     DirectorsConsole mobile filtering, BoothTool responsive pass) — scanned
 *     at a 390px viewport so `useMediaQuery('(max-width: 640px)')` in
 *     `DirectorsConsole/index.tsx` actually engages mobile routing.
 *   - Queue drawer (tasks 009/011/013: undo toasts, queue-ux-cluster,
 *     QueueDrawerHost split out of App.tsx) — reached via the `/queue` route,
 *     which `useQueueDrawer` (QueueDrawerHost.tsx) opens as an overlay over
 *     whatever page was already showing, then redirects away from `/queue`.
 *   - Voices page (empty state) — reused from the same fixture/route recipe
 *     as `axe.spec.ts`'s "voices page (empty state)" target; called out
 *     alongside Library/Book as a plan-relevant candidate and is the
 *     lowest-risk of the four candidates against upstream shape drift.
 *
 * Both a Playwright snapshot (`toHaveScreenshot`, 2% diff tolerance per doc
 * 07 §4.1's own snapshot precedent) and an axe scan (serious/critical +
 * color-contrast, per doc 07 §4.2 / the a11y-axe CI job) run per page/theme.
 * As with axe.spec.ts, any known pre-existing violation is logged and the
 * test marked `.fixme` so CI stays green while findings are documented —
 * finding it IS the deliverable, fixing it is a follow-up (do not fix
 * unrelated pre-existing violations here per this task's explicit scope).
 *
 * Known violations (recorded 2026-07-14, run locally with `.fixme` removed):
 *   voices page (empty state), LIGHT and DARK — same pre-existing findings
 *   already documented in axe.spec.ts's header:
 *     - aria-required-parent (critical) — `.voices-tab-pill[role="tab"]`
 *       missing a `tablist` parent role
 *     - color-contrast (serious) — header "Studio" wordmark (#2b6eff on
 *       #f0f3f9, ratio 3.95 vs required 4.5:1)
 *   queue drawer, LIGHT and DARK — shares axe.spec.ts's already-documented
 *   home-page finding (the drawer overlays the home shell):
 *     - color-contrast (serious) — `.top-bar` "Studio" wordmark, same
 *       #2b6eff-on-surface contrast issue as the home page target
 *   chapter workspace mobile Booth mode — no serious/critical violations on
 *   first local run. If a future re-run surfaces a new violation, add a
 *   `test.fixme` for that specific case and record it here rather than
 *   fixing it silently.
 *
 * Re-run command (from repo root, requires a built frontend):
 *   npm -C frontend run build && npx playwright test tests/e2e/a11y/mobile_mode_gate.spec.ts --project=chromium
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const THEMES = ['light', 'dark'] as const;

// Same tag set as axe.spec.ts — serious/critical + color-contrast, not the
// full wcag2aa gate (that remains a future step per doc 07 §4.3).
const AXE_TAGS = ['color-contrast', 'wcag2a', 'wcag2aa'];

const fulfillJson = async (route: import('@playwright/test').Route, payload: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
};

// Same minimal empty-jobs-snapshot reply used by settings-navigation.spec.ts,
// chapter-render.spec.ts, and axe.spec.ts.
const mockEmptyJobsWebSocket = async (page: Page) => {
  await page.routeWebSocket('**/ws', ws => {
    ws.on('message', message => {
      const data = JSON.parse(typeof message === 'string' ? message : message.toString());
      if (data.type === 'jobs_snapshot_request') {
        ws.send(JSON.stringify({ type: 'jobs_snapshot', jobs: [] }));
      }
    });
  });
};

// ChapterEditor mobile Booth mode — mock recipe copied from axe.spec.ts's
// "chapter workspace" target (itself copied from chapter-render.spec.ts),
// scanned at a 390px viewport so DirectorsConsole's mobile filtering (task
// 007) routes to Booth by default (task 008's responsive pass target).
const setupChapterWorkspacePage = async (page: Page) => {
  const chapterId = 'mobile-gate-chapter-1';
  const projectId = 'mobile-gate-project-1';

  await page.route('**/api/home', route => fulfillJson(route, {
    system_info: { startup_ready: true },
    projects: [{ id: projectId, name: 'Mobile Gate Project' }],
    chapters: [{ id: chapterId, project_id: projectId, title: 'Mobile Gate Chapter' }],
    jobs: [],
    engines: [{
      engine_id: 'xtts',
      display_name: 'XTTS (Local)',
      status: 'ready',
      verified: true,
      enabled: true,
      version: '1.0.0',
      local: true,
      cloud: false,
      network: false,
      languages: ['en'],
      capabilities: [],
      resource: {},
      author: '',
      homepage: '',
    }],
  }));

  await page.route(`**/api/chapters/${chapterId}`, route => fulfillJson(route, {
    id: chapterId,
    project_id: projectId,
    title: 'Mobile Gate Chapter',
    text_content: 'This is some text for s1. This is some text for s2. This is some text for s3.',
  }));

  await page.route(`**/api/chapters/${chapterId}/segments`, route => fulfillJson(route, {
    segments: [
      { id: 's1', chapter_id: chapterId, segment_order: 0, text_content: 'Paragraph 1 segment 1.', character_id: null, speaker_profile_name: null, audio_file_path: null, audio_status: 'unprocessed', audio_generated_at: null },
      { id: 's2', chapter_id: chapterId, segment_order: 1, text_content: 'Paragraph 1 segment 2.', character_id: null, speaker_profile_name: null, audio_file_path: null, audio_status: 'unprocessed', audio_generated_at: null },
      { id: 's3', chapter_id: chapterId, segment_order: 2, text_content: 'Paragraph 2 segment 3.', character_id: null, speaker_profile_name: null, audio_file_path: null, audio_status: 'unprocessed', audio_generated_at: null },
    ],
  }));

  await page.route(`**/api/chapters/${chapterId}/script-view`, route => fulfillJson(route, {
    chapter_id: chapterId,
    base_revision_id: 'rev1',
    paragraphs: [
      { id: 'p1', span_ids: ['s1', 's2'] },
      { id: 'p2', span_ids: ['s3'] },
    ],
    spans: [
      { id: 's1', order_index: 0, text: 'Paragraph 1 segment 1.', status: 'idle', char_count: 20, sanitized_char_count: 20 },
      { id: 's2', order_index: 1, text: 'Paragraph 1 segment 2.', status: 'idle', char_count: 20, sanitized_char_count: 20 },
      { id: 's3', order_index: 2, text: 'Paragraph 2 segment 3.', status: 'idle', char_count: 20, sanitized_char_count: 20 },
    ],
    render_batches: [
      { id: 'b1', span_ids: ['s1', 's2'], status: 'idle', estimated_work_weight: 40 },
      { id: 'b2', span_ids: ['s3'], status: 'idle', estimated_work_weight: 20 },
    ],
    audio_groups: [],
  }));

  await page.route(`**/api/projects/${projectId}/characters`, route => fulfillJson(route, []));
  await page.route(`**/api/projects/${projectId}/chapters/${chapterId}/render_groups`, route => fulfillJson(route, []));
  await page.route(`**/api/projects/${projectId}/audiobooks`, route => fulfillJson(route, []));
  await page.route(`**/api/projects/${projectId}`, route => fulfillJson(route, {
    id: projectId, name: 'Mobile Gate Project', series: null, author: null,
    speaker_profile_name: null, cover_image_path: null, created_at: 0, updated_at: 0,
  }));
  await page.route(`**/api/projects/${projectId}/chapters`, route => fulfillJson(route, [
    { id: chapterId, project_id: projectId, title: 'Mobile Gate Chapter' },
  ]));
  await page.route('**/api/processing_queue', route => fulfillJson(route, []));

  await mockEmptyJobsWebSocket(page);

  return { chapterId };
};

// Queue drawer — home shell mocks (same shape as axe.spec.ts's home-page
// target) plus a non-empty processing_queue so GlobalQueue/QueueItem
// (tasks 009/011) render actual rows, not just an empty drawer.
const setupQueueDrawerPage = async (page: Page) => {
  await mockEmptyJobsWebSocket(page);
  await page.route('**/api/home', route => fulfillJson(route, {
    jobs: {},
    settings: {},
    engines: [],
    paused: false,
    chapters: [],
    narrator_ok: true,
    speaker_profiles: [],
    speakers: [],
    projects: [],
    system_info: { startup_ready: true },
  }));
  await page.route('**/api/processing_queue', route => fulfillJson(route, [
    {
      id: 'queue-item-1',
      project_id: 'mobile-gate-project-1',
      chapter_id: 'mobile-gate-chapter-1',
      chapter_title: 'Mobile Gate Chapter',
      split_part: 0,
      status: 'queued',
      engine: 'xtts',
      created_at: Date.now() / 1000,
    },
  ]));
};

// Voices page — deliberately scanned in its empty-data state, matching
// axe.spec.ts's own "voices page (empty state)" target verbatim.
const setupVoicesPage = async (page: Page) => {
  await mockEmptyJobsWebSocket(page);
  await page.route('**/api/home', route => fulfillJson(route, {
    jobs: {},
    settings: {},
    engines: [],
    paused: false,
    chapters: [],
    narrator_ok: true,
    speaker_profiles: [],
    speakers: [],
    projects: [],
    system_info: { startup_ready: true },
  }));
  await page.route('**/api/speakers', route => fulfillJson(route, []));
  await page.route('**/api/voices/', route => fulfillJson(route, []));
  await page.route('**/api/processing_queue', route => fulfillJson(route, []));
};

type ScanTarget = {
  name: string;
  viewport?: { width: number; height: number };
  goto: (page: Page) => Promise<void>;
};

const SCAN_TARGETS: ScanTarget[] = [
  {
    name: 'chapter workspace mobile Booth mode',
    viewport: { width: 390, height: 844 },
    goto: async (page) => {
      const { chapterId } = await setupChapterWorkspacePage(page);
      await page.goto(`/chapter/${chapterId}`);
      await page.locator('[data-testid="directors-console"]').waitFor({ state: 'visible', timeout: 15000 });
    },
  },
  {
    name: 'queue drawer',
    goto: async (page) => {
      await setupQueueDrawerPage(page);
      await page.goto('/queue');
      await page.getByLabel('Processing Queue').getByText('Mobile Gate Chapter').waitFor({ state: 'visible', timeout: 15000 });
    },
  },
  {
    name: 'voices page (empty state)',
    goto: async (page) => {
      await setupVoicesPage(page);
      await page.goto('/voices');
    },
  },
];

for (const theme of THEMES) {
  test.describe(`Mobile-mode gate — ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      // Set theme preference in localStorage before the app loads, matching
      // axe.spec.ts's approach (avoids a theme-flash affecting the scan).
      await page.addInitScript((t) => {
        localStorage.setItem('studio-theme', t);
      }, theme);
    });

    for (const target of SCAN_TARGETS) {
      // Snapshot assertion — always a real (non-fixme) test; visual
      // regressions are always actionable regardless of axe status.
      test(`${target.name} snapshot [${theme}]`, async ({ page }) => {
        if (target.viewport) {
          await page.setViewportSize(target.viewport);
        }

        await target.goto(page);
        // Allow the app to settle (React hydration, theme attribute applied).
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveScreenshot(
          `${target.name.replace(/\s+/g, '-')}-${theme}.png`,
          { maxDiffPixelRatio: 0.02 },
        );
      });

      // Axe scan — a known pre-existing violation gets `.fixme` per the
      // established axe.spec.ts convention (finding it IS the deliverable;
      // fixing unrelated pre-existing violations is explicitly out of scope
      // for this task). "voices page (empty state)" shares axe.spec.ts's
      // already-documented `aria-required-parent` (critical, tab-pill
      // missing a tablist parent) + `color-contrast` (serious, header
      // "Studio" wordmark) findings — same page, same pre-existing issues,
      // not introduced by this plan.
      // "queue drawer" renders as an overlay atop the home shell, which
      // shares axe.spec.ts's already-documented home-page `color-contrast`
      // (serious) finding on the `.top-bar` "Studio" wordmark — same
      // pre-existing issue, not introduced by this plan.
      const hasKnownViolation =
        target.name === 'voices page (empty state)' || target.name === 'queue drawer';
      const axeTest = hasKnownViolation ? test.fixme : test;

      axeTest(`${target.name} axe scan [${theme}]`, async ({ page }) => {
        if (target.viewport) {
          await page.setViewportSize(target.viewport);
        }

        await target.goto(page);
        await page.waitForLoadState('networkidle');

        const results = await new AxeBuilder({ page })
          .withTags(AXE_TAGS)
          .analyze();

        const violationsToFix = results.violations.filter((v) =>
          v.impact === 'serious' || v.impact === 'critical',
        );

        if (violationsToFix.length > 0) {
          console.warn(
            `[mobile-gate ${theme} — ${target.name}] ${violationsToFix.length} serious/critical violation(s):`,
            violationsToFix.map((v) => ({
              id: v.id,
              impact: v.impact,
              description: v.description,
              nodes: v.nodes.length,
            })),
          );
        }

        expect(violationsToFix).toEqual([]);
      });
    }
  });
}
