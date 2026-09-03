/**
 * Accessibility scan — axe-core via @axe-core/playwright
 *
 * Owner decision 2026-06-11 (doc 07 §4.2): run axe now; visual snapshots later.
 * Owner decision 2026-07-09 (design-docs/plans/active/final_release/08_release_sequence.md
 * Stage 5): the "when does axe run" rollout question is resolved as CI-now,
 * non-blocking — this file already runs in `.github/workflows/ci.yml`'s `a11y-axe`
 * job on every PR/main push (`|| true` keeps it from failing the build; findings are
 * documented via `test.fixme`, not enforced yet). Manual/release-validation runs
 * remain useful for reviewing the fuller report locally, but CI is the source of
 * "did this regress" signal going forward.
 *
 * Scope: color-contrast + all "serious" and "critical" severity violations.
 * Themes tested: light and dark (set via localStorage key `studio-theme` before navigation
 * so the app's theme initialisation picks it up on load; see frontend/src/utils/theme.ts).
 *
 * Pages scanned: Welcome/home shell (no network mocking — static content, matches CI's
 * unmocked `vite preview` run), the Voices page (empty-state — a real, unmocked-data-shape
 * route rather than a fixture-heavy one), and the Chapter Workspace (mocked via
 * `page.route`/`page.routeWebSocket`, reusing the same network-mock recipe already
 * established in `tests/e2e/chapter-render.spec.ts`, populated with real segments so the
 * scan covers actual interactive script-view content, not just an empty shell).
 * Book Contents / Director's-console-specific chrome is exercised via the same
 * Chapter Workspace route (BookLayout) that page also lands on.
 *
 * If axe finds violations the tests are marked `.fixme` so CI stays green while the
 * violations are documented — finding them IS the deliverable; fixing is a follow-up.
 *
 * Known violations (recorded 2026-07-09, run locally with `.fixme` temporarily removed —
 * update this list when re-run):
 *
 *   LIGHT and DARK themes (identical violation ids in both — only node counts vary slightly)
 *   -------------------------------------------------------------------------------------
 *   home page:
 *     - color-contrast (serious) — 1-2 node(s)
 *   voices page (empty state):
 *     - aria-required-parent (critical) — 2 node(s)
 *     - color-contrast (serious) — 1 node
 *   chapter workspace:
 *     - color-contrast (serious) — 1-4 node(s)
 *     - select-name (critical) — 3 node(s) — `.span-control-select` in ScriptView has no
 *       accessible name (frontend/src/pages/ChapterEditor/components/ScriptView.tsx)
 *
 * Re-run command (from repo root, requires a built frontend + a browser — see "Local/CI run"
 * below for exact steps):
 *   npm -C frontend run build && npx playwright test tests/e2e/a11y/axe.spec.ts --project=chromium
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const THEMES = ['light', 'dark'] as const;

// Axe rule tags that map to "serious" and "critical" severity plus color-contrast.
// We do NOT run the full wcag2aa suite as a gate here — that is a future step (doc 07 §4.3).
const AXE_TAGS = ['color-contrast', 'wcag2a', 'wcag2aa'];

const fulfillJson = async (route: import('@playwright/test').Route, payload: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
};

// Reply to jobs_snapshot_request with an empty jobs list — same minimal pattern used by
// tests/e2e/settings-navigation.spec.ts and tests/e2e/chapter-render.spec.ts.
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

// Voices page — deliberately scanned in its empty-data state (no speakers/profiles) rather
// than a populated fixture: keeps this scan low-risk against upstream shape drift while still
// covering the real page shell, header, and empty-state messaging.
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

// Chapter Workspace — mocks copied from the already-passing
// tests/e2e/chapter-render.spec.ts recipe so this scan exercises real, populated
// script-view content (not an empty/error shell).
const setupChapterWorkspacePage = async (page: Page) => {
  const chapterId = 'axe-chapter-1';
  const projectId = 'axe-project-1';

  await page.route('**/api/home', route => fulfillJson(route, {
    system_info: { startup_ready: true },
    projects: [{ id: projectId, name: 'Axe Test Project' }],
    chapters: [{ id: chapterId, project_id: projectId, title: 'Axe Test Chapter' }],
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
    title: 'Axe Test Chapter',
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
    id: projectId, name: 'Axe Test Project', series: null, author: null,
    speaker_profile_name: null, cover_image_path: null, created_at: 0, updated_at: 0,
  }));
  await page.route(`**/api/projects/${projectId}/chapters`, route => fulfillJson(route, [
    { id: chapterId, project_id: projectId, title: 'Axe Test Chapter' },
  ]));
  await page.route('**/api/processing_queue', route => fulfillJson(route, []));

  await mockEmptyJobsWebSocket(page);

  return { chapterId };
};

type ScanTarget = {
  name: string;
  goto: (page: Page) => Promise<void>;
};

const SCAN_TARGETS: ScanTarget[] = [
  {
    name: 'home page',
    goto: async (page) => {
      await page.goto('/');
    },
  },
  {
    name: 'voices page (empty state)',
    goto: async (page) => {
      await setupVoicesPage(page);
      await page.goto('/voices');
    },
  },
  {
    name: 'chapter workspace (Book Contents / Director\'s console chrome)',
    goto: async (page) => {
      const { chapterId } = await setupChapterWorkspacePage(page);
      await page.goto(`/chapter/${chapterId}`);
      await page.locator('[data-testid="script-span-s1"]').waitFor({ state: 'visible', timeout: 15000 });
    },
  },
];

for (const theme of THEMES) {
  test.describe(`Axe scan — ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      // Set theme preference in localStorage before the app loads so theme is
      // applied during React initialisation (avoids a flash that could affect scan).
      await page.addInitScript((t) => {
        localStorage.setItem('studio-theme', t);
      }, theme);
    });

    for (const target of SCAN_TARGETS) {
      // Mark fixme so CI stays green while violations are being triaged.
      // Remove the fixme once all serious/critical violations below are resolved.
      test.fixme(
        `${target.name} has no serious/critical axe violations [${theme}]`,
        async ({ page }) => {
          await target.goto(page);
          // Allow the app to settle (React hydration, theme attribute applied).
          await page.waitForLoadState('networkidle');

          const results = await new AxeBuilder({ page })
            .withTags(AXE_TAGS)
            // Filter to serious and critical only — best-practice/minor are noise at this stage.
            .analyze();

          const violationsToFix = results.violations.filter((v) =>
            v.impact === 'serious' || v.impact === 'critical',
          );

          if (violationsToFix.length > 0) {
            // Log details to help the fixer — visible in Playwright HTML report.
            console.warn(
              `[axe ${theme} — ${target.name}] ${violationsToFix.length} serious/critical violation(s):`,
              violationsToFix.map((v) => ({
                id: v.id,
                impact: v.impact,
                description: v.description,
                nodes: v.nodes.length,
              })),
            );
          }

          expect(violationsToFix).toEqual([]);
        },
      );
    }
  });
}
