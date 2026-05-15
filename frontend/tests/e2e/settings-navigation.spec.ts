import { expect, test } from '@playwright/test';

const mockEngine = {
  engine_id: 'xtts-local',
  display_name: 'XTTS Local',
  status: 'ready',
  verified: true,
  enabled: true,
  version: '1.2.3',
  local: true,
  cloud: false,
  network: false,
  languages: ['en'],
  capabilities: ['preview'],
  resource: { gpu: false, vram_mb: 0, cpu_heavy: true },
  author: 'Studio',
  homepage: 'https://example.com/xtts',
  can_enable: true,
  settings_schema: {
    properties: {
      temperature: { type: 'number', title: 'Temperature', default: 0.7, minimum: 0, maximum: 1 },
    },
  },
  current_settings: {
    temperature: 0.55,
  },
};

const mockHome = {
  jobs: {},
  settings: {
    safe_mode: true,
    mistral_api_key: 'test-key',
    voxtral_enabled: true,
    default_speaker_profile: 'V1',
  },
  engines: [mockEngine],
  paused: false,
  chapters: [],
  narrator_ok: true,
  speaker_profiles: [],
  speakers: [],
  projects: [],
  render_stats: {
    sample_count: 4,
    word_count: 1234,
    chars: 5678,
    audio_duration_seconds: 7500,
    render_duration_seconds: 8100,
    audio_hours_rendered: 2,
    render_hours_spent: 2.25,
    since_timestamp: 1710000000,
    since_date: '2024-03-09T00:00:00.000Z',
    by_engine: [
      { engine: 'xtts', sample_count: 3, audio_duration_seconds: 5400, render_duration_seconds: 6000 },
      { engine: 'voxtral', sample_count: 1, audio_duration_seconds: 2100, render_duration_seconds: 2100 },
    ],
  },
  runtime_services: [
    {
      id: 'backend',
      label: 'Backend API',
      kind: 'api',
      url: 'http://127.0.0.1:8000',
      port: 8000,
      healthy: true,
      pingable: true,
      status: 'online',
      message: 'Responding to Studio API requests.',
      can_restart: false,
    },
  ],
  system_info: {
    backend_mode: 'Direct-In-Process',
    orchestrator: 'Studio 2.0',
    startup_ready: true,
    startup_message: 'Studio ready',
    startup_detail: 'All services are running.',
  },
};

const fulfillJson = async (route, payload: unknown) => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(payload),
  });
};

test.describe('settings navigation', () => {
  test('switches tabs and shows production tally data', async ({ page }) => {
    await page.routeWebSocket('/ws', ws => {
      ws.on('message', message => {
        const data = JSON.parse(typeof message === 'string' ? message : message.toString());
        if (data.type === 'jobs_snapshot_request') {
          ws.send(JSON.stringify({ type: 'jobs_snapshot', jobs: [] }));
        }
      });
    });

    await page.route('**/api/home', route => fulfillJson(route, mockHome));
    await page.route('**/api/processing_queue', route => fulfillJson(route, []));
    await page.route('**/api/engines', route => fulfillJson(route, [mockEngine]));

    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'General' })).toBeVisible();

    await page.getByRole('link', { name: 'TTS Engines' }).click();
    await expect(page.getByRole('heading', { name: 'TTS Engines' })).toBeVisible();
    await expect(page.getByText('XTTS Local')).toBeVisible();

    await page.getByRole('link', { name: 'API' }).click();
    await expect(page.getByRole('heading', { name: 'API' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Unified Orchestration' })).toBeVisible();

    await page.getByRole('link', { name: 'About' }).click();
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
    await expect(page.getByText('Production Tally')).toBeVisible();
    await expect(page.getByText('2h 5m')).toBeVisible();
    await expect(page.getByText('Audio', { exact: true })).toBeVisible();
    await expect(page.getByText('Tally since')).toBeVisible();
  });
});
