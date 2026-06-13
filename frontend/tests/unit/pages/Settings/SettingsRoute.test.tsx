import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api';
import { SettingsRoute } from '@/pages/Settings/SettingsRoute';
import {
  publishStudioSocketMessage,
  resetStudioSocketBusForTests,
} from '@/store/studioSocketBus';
import {
  getLiveEventAuditSnapshot,
  resetLiveEventAuditForTests,
} from '@/store/liveEventAuditStore';

vi.mock('@/api', () => ({
  api: {
    fetchHome: vi.fn(),
    fetchEngines: vi.fn(),
    refreshPlugins: vi.fn(),
    updateEngineSettings: vi.fn(),
    clearEngineSetting: vi.fn(),
    resetEngineCalibration: vi.fn(),
    verifyEngine: vi.fn(),
    installEngineDependencies: vi.fn(),
    fetchEngineRequirements: vi.fn().mockResolvedValue({ ok: true, requirements: [] }),
    removeEnginePlugin: vi.fn(),
    fetchEngineLogs: vi.fn(),
    installPlugin: vi.fn(),
    resetRenderStats: vi.fn(),
    restartTtsServer: vi.fn(),
    importEnginePlugin: vi.fn(),
    previewEnginePlugin: vi.fn(),
    confirmEnginePlugin: vi.fn(),
    cancelEnginePluginStaging: vi.fn(),
  },
}));

const mockedEngines = [
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
    settings_schema: {
      properties: {
        temperature: { type: 'number', title: 'Temperature', default: 0.7, minimum: 0, maximum: 1 },
        speaker_name: { type: 'string', title: 'Speaker Name', default: 'Narrator' },
        computer_speed_multiplier: {
          type: 'number',
          title: 'Computer Speed',
          default: 1,
          readOnly: true,
          'x-ui': {
            display: 'computer_speed_cps',
            baseline_cps: 16.7,
          },
        },
      },
    },
    current_settings: {
      temperature: 0.55,
      speaker_name: 'Narrator',
      computer_speed_multiplier: 1.75,
    },
  },
  {
    engine_id: 'voxtral-cloud',
    display_name: 'Voxtral Cloud Voices',
    status: 'needs_setup',
    verified: false,
    enabled: false,
    version: '0.4.0',
    local: false,
    cloud: true,
    network: true,
    languages: ['en'],
    capabilities: ['preview'],
    resource: { gpu: false, vram_mb: 0, cpu_heavy: false },
    author: 'Mistral',
    homepage: '',
    can_enable: false,
    enablement_message: 'Add a Mistral API key before enabling Voxtral.',
    settings_schema: {
      properties: {
        enabled: {
          type: 'boolean',
          title: 'Enable Plugin',
          default: false,
          description: 'When active, Voxtral cloud voices will be available for selection in the project and global settings. Disable this to stay fully local.',
          'x-ui': {
            requires_verification: true,
            locked_message: 'Verify this engine before activating the plugin.',
          },
        },
        mistral_api_key: {
          type: 'string',
          title: 'Mistral API Key',
          default: '',
        },
        voxtral_model: {
          type: 'string',
          title: 'Voxtral Model',
          default: 'voxtral-mini-tts-2603',
        },
      },
      'x-ui': {
        panel_title: 'Voxtral Cloud Voices',
        summary: 'Create a Mistral API key in your workspace settings. Get started by following the instructions in the link below.',
        privacy_tone: 'warning',
        help_label: 'Open Mistral API key instructions',
        help_url: 'https://help.mistral.ai/en/articles/347464-how-do-i-create-api-keys-within-a-workspace',
      },
    },
    current_settings: {
      enabled: false,
      mistral_api_key: '',
      voxtral_model: 'voxtral-mini-tts-2603',
    },
  },
];

const defaultProps = {
  settings: {
    safe_mode: true,
    mistral_api_key: 'test-key',
    voxtral_enabled: true,
    default_speaker_profile: 'V1',
  } as any,
  speakerProfiles: [
    { name: 'V1', speed: 1.0, wav_count: 1, is_default: true, preview_url: null },
    { name: 'V2', speed: 1.0, wav_count: 2, is_default: false, preview_url: null }
  ] as any,
  onRefresh: vi.fn(),
  onShowNotification: vi.fn(),
  engines: mockedEngines as any,
};

describe('SettingsRoute', () => {
  const emitEvent = (topic: string, eventKind: string, payload: any, ids: any = {}) => {
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic,
        eventKind,
        source: 'backend',
        emittedAt: Date.now() / 1000,
        pluginId: null,
        ids,
        payload,
      });
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetStudioSocketBusForTests();
    resetLiveEventAuditForTests();
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/settings') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) as any;
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) as any;
    }) as any;
    vi.mocked(api.fetchHome).mockResolvedValue({
      version: '2.0.0',
      engines: mockedEngines as any,
      render_stats: {
        sample_count: 4,
        word_count: 1234,
        chars: 5678,
        audio_duration_seconds: 7200,
        render_duration_seconds: 8100,
        audio_hours_rendered: 2,
        render_hours_spent: 2.25,
        since_timestamp: 1710000000,
        since_date: '2024-03-09T00:00:00.000Z',
        by_engine: [
          { engine: 'xtts', sample_count: 3, audio_duration_seconds: 5400, render_duration_seconds: 6000 },
          { engine: 'voxtral', sample_count: 1, audio_duration_seconds: 1800, render_duration_seconds: 2100 },
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
        {
          id: 'tts_server',
          label: 'TTS Server',
          kind: 'tts_server',
          url: 'http://127.0.0.1:7862',
          port: 7862,
          healthy: true,
          pingable: true,
          status: 'healthy',
          message: 'Loaded plugins responded successfully.',
          can_restart: true,
          circuit_open: false,
        },
      ],
      system_info: {
        backend_mode: 'Direct-In-Process',
        orchestrator: 'Studio 2.0',
      },
    } as any);
    vi.mocked(api.fetchEngines).mockResolvedValue(mockedEngines as any);
    vi.mocked(api.refreshPlugins).mockResolvedValue({ ok: true });
    vi.mocked(api.updateEngineSettings).mockResolvedValue({ ok: true });
  });

  it('renders the general settings tab at /settings', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsRoute {...defaultProps} />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'General' })).toBeTruthy();
    expect(screen.getByText('Stability Mode')).toBeTruthy();
    expect(screen.getByText('Default Voice')).toBeTruthy();
    expect(screen.getByDisplayValue('V1')).toBeTruthy();
  });


  it('redirects the engines tab to the standalone engines page', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/engines/']}>
        <Routes>
          <Route path="/settings/*" element={<SettingsRoute {...defaultProps} />} />
          <Route path="/engines" element={<div>Engines route target</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Engines route target')).toBeInTheDocument();
    });
  });

  it('saves general settings through the existing settings endpoint', async () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsRoute {...defaultProps} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'ON' })[0]);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/settings',
        expect.objectContaining({ method: 'POST' })
      );
      expect(defaultProps.onRefresh).toHaveBeenCalled();
    });
  });

  it('renders the about tab as a read-only diagnostics surface', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/about']}>
        <SettingsRoute {...defaultProps} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'About' })).toBeTruthy();
    expect(screen.getByText('Studio Version')).toBeTruthy();
    expect(screen.getByText('2.0.0')).toBeTruthy();
    expect(screen.getByText('Engine Plugins')).toBeTruthy();
    expect(screen.getByText(/2 loaded/i)).toBeTruthy();
    expect(screen.getByText(/XTTS Local .* Voxtral Cloud Voices/i)).toBeTruthy();
    expect(screen.getByText('Production Tally')).toBeTruthy();
    expect(screen.getByText(/1,234 words/i)).toBeTruthy();
    expect(screen.getByText(/5,678 characters/i)).toBeTruthy();
    expect(screen.getByText(/Tally since/i)).toBeTruthy();
    expect(screen.getAllByText('Backend API').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/127.0.0.1:8000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('online').length).toBeGreaterThan(0);
    expect(screen.getByText('Orchestrator')).toBeTruthy();
    expect(screen.getByText('Studio 2.0')).toBeTruthy();
    expect(screen.getByText('Reset')).toBeTruthy();
    expect(screen.getByText('TTS Server')).toBeTruthy();
    expect(screen.getByText(/healthy/i)).toBeTruthy();
  });

  it('redirects the api tab to the standalone integrations page', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/api']}>
        <Routes>
          <Route path="/settings/*" element={<SettingsRoute {...defaultProps} />} />
          <Route path="/integrations" element={<div>Integrations route target</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Integrations route target')).toBeInTheDocument();
    });
  });

});
