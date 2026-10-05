import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { api } from '@/api';
import { EnginesPage } from '@/pages/Engines/EnginesPage';
import { PARALLEL_CAP_COPY } from '@/utils/parallelCapCopy';
import { concurrencyFixture } from '../../../helpers/capSafetyFixtures';

vi.mock('@/api', () => ({
  api: {
    fetchEngineConcurrency: vi.fn().mockResolvedValue({ global_cap: 2, global_safe_max: 8, memory_measurable: true, engines: [] }),
    fetchEngines: vi.fn(),
    refreshPlugins: vi.fn(),
    previewEnginePlugin: vi.fn(),
    confirmEnginePlugin: vi.fn(),
    cancelEnginePluginStaging: vi.fn(),
    fetchEngineLogs: vi.fn(),
    fetchHome: vi.fn().mockResolvedValue({ version: '2.0.0', runtime_services: [] }),
    restartTtsServer: vi.fn(),
  },
}));

describe('EnginesPage', () => {
  it('renders the standalone engines heading and loads engine cards', async () => {
    vi.mocked(api.fetchEngines).mockResolvedValue([
      {
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
        settings_schema: { properties: {} },
        current_settings: {},
      },
    ] as any);

    render(<EnginesPage startupReady={true} onRefresh={vi.fn()} onShowNotification={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Engines' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('XTTS Local')).toBeInTheDocument();
    });
  });

  it('warns on an engine card whose inherited cap is above the comfortable limit', async () => {
    vi.mocked(api.fetchEngineConcurrency).mockResolvedValue(
      concurrencyFixture({
        engines: [
          { engine_id: 'xtts-local', engine_class: 'gpu', manifest_max: 8, requested_cap: 2, effective_cap: 2, active_count: 0, safe_max: 1, hard_max: 2 },
        ],
      }),
    );
    vi.mocked(api.fetchEngines).mockResolvedValue([
      {
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
        settings_schema: { properties: {} },
        current_settings: {},
      },
    ] as any);

    render(<EnginesPage startupReady={true} onRefresh={vi.fn()} onShowNotification={vi.fn()} />);

    const warning = await screen.findByText(PARALLEL_CAP_COPY.overComfortableWarning(1));
    expect(warning.closest('[role="status"]')).not.toBeNull();
    expect(
      await screen.findByText('Left empty, this engine uses the Parallel Segment Rendering setting, which is 2 right now.')
    ).toBeInTheDocument();
  });
});
