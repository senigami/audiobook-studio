import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { api } from '@/api';
import { EnginesPage } from '@/pages/Engines/EnginesPage';

vi.mock('@/api', () => ({
  api: {
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
});
