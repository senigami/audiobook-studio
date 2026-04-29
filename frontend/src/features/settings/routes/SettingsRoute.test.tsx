import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../api';
import { SettingsRoute } from './SettingsRoute';

vi.mock('../../../api', () => ({
  api: {
    fetchHome: vi.fn(),
    fetchEngines: vi.fn(),
    refreshPlugins: vi.fn(),
    updateEngineSettings: vi.fn(),
    verifyEngine: vi.fn(),
    installEngineDependencies: vi.fn(),
    removeEnginePlugin: vi.fn(),
    fetchEngineLogs: vi.fn(),
    installPlugin: vi.fn(),
    resetRenderStats: vi.fn(),
    restartTtsServer: vi.fn(),
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
      },
    },
    current_settings: {
      temperature: 0.55,
      speaker_name: 'Narrator',
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
        summary: 'Create a Mistral API key in your workspace settings, paste it here, then turn Voxtral on when you want cloud voices available. Voxtral requests are processed by Mistral instead of staying fully local.',
        privacy_notice: 'Privacy note: turning on Voxtral sends the text you synthesize, and any selected reference audio, to Mistral\'s servers. Keep voices on XTTS (Local) if you want your workflow to stay fully local.',
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
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/settings') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) as any;
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }) as any;
    }) as any;
    vi.mocked(api.fetchHome).mockResolvedValue({
      version: '1.8.4',
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

  it('triggers engine verification via API', async () => {
    const mockVerify = vi.spyOn(api, 'verifyEngine').mockResolvedValue({ ok: true });
    render(
      <MemoryRouter initialEntries={['/settings/engines']}>
        <SettingsRoute {...defaultProps} />
      </MemoryRouter>
    );
    
    const verifyBtn = (await screen.findAllByText(/Verify/i))[0];
    fireEvent.click(verifyBtn);

    await waitFor(() => expect(mockVerify).toHaveBeenCalledWith('xtts-local'));
  });

  it('shows installation instructions when Install Plugin is clicked', async () => {
    const mockInstall = vi.spyOn(api, 'installPlugin').mockResolvedValue({ 
      ok: false, 
      message: 'Place your plugin folder in the plugins/ directory.' 
    });
    
    render(
      <MemoryRouter initialEntries={['/settings/engines']}>
        <SettingsRoute {...defaultProps} />
      </MemoryRouter>
    );
    
    const installBtn = await screen.findByText(/Install Plugin/i);
    fireEvent.click(installBtn);
    
    expect(mockInstall).toHaveBeenCalled();
    expect(await screen.findByText(/Place your plugin folder in the plugins\/ directory./i)).toBeTruthy();
  });

  it('renders deep-linked engine settings cards and schema-driven controls', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/engines']}>
        <SettingsRoute {...defaultProps} />
      </MemoryRouter>
    );

    expect(await screen.findByText('XTTS Local')).toBeTruthy();
    expect(screen.getByText('Voxtral Cloud Voices', { selector: 'h4' })).toBeTruthy();
    expect(screen.getByText('READY')).toBeTruthy();
    expect(screen.getByText('VERIFIED')).toBeTruthy();
    fireEvent.click(screen.getByText('XTTS Local'));
    
    expect(screen.getAllByText(/Run Test/i)[0]).toBeTruthy();
    expect(screen.getAllByText(/Verify/i)[0]).toBeTruthy();
    expect(screen.getAllByText(/Logs/i)[0]).toBeTruthy();
    expect(screen.getByText(/Temperature/i)).toBeTruthy();
    expect(screen.getByText(/Speaker Name/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('heading', { name: 'Voxtral Cloud Voices', level: 3 }));
    expect(await screen.findByRole('heading', { name: 'Voxtral Cloud Voices', level: 4 })).toBeTruthy();
    expect(screen.getByText(/Create a Mistral API key in your workspace settings/i)).toBeTruthy();
    expect(screen.getByText('Open Mistral API key instructions')).toBeTruthy();
    expect(screen.getByText('Mistral API Key')).toBeTruthy();
    expect(screen.getByText('Voxtral Model')).toBeTruthy();
    expect(screen.getByText(/Privacy note: turning on Voxtral sends the text you synthesize/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'OFF' })).toBeDisabled();
  });

  it('normalizes trailing slashes on settings deep links', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/engines/']}>
        <SettingsRoute {...defaultProps} />
      </MemoryRouter>
    );

    expect(await screen.findByText('XTTS Local')).toBeTruthy();
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

  it('persists engine settings and refreshes the registry', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/engines']}>
        <SettingsRoute {...defaultProps} />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByText('XTTS Local'));
    const speakerNameInput = screen.getByDisplayValue('Narrator');
    fireEvent.change(speakerNameInput, { target: { value: 'Narrator Plus' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    await waitFor(() => {
      expect(api.updateEngineSettings).toHaveBeenCalledWith('xtts-local', expect.objectContaining({
        temperature: 0.55,
        speaker_name: 'Narrator Plus',
      }));
      expect(defaultProps.onShowNotification).toHaveBeenCalledWith('XTTS Local settings saved.');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh Plugins' }));

    await waitFor(() => {
      expect(api.refreshPlugins).toHaveBeenCalled();
      expect(api.fetchEngines).toHaveBeenCalledTimes(2);
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
    expect(screen.getByText('1.8.4')).toBeTruthy();
    expect(screen.getByText('Engine Plugins')).toBeTruthy();
    expect(screen.getByText(/2 loaded/i)).toBeTruthy();
    expect(screen.getByText(/XTTS Local .* Voxtral Cloud Voices/i)).toBeTruthy();
    expect(screen.getByText('Production Tally')).toBeTruthy();
    expect(screen.getByText(/1,234 words/i)).toBeTruthy();
    expect(screen.getByText(/5,678 characters rendered/i)).toBeTruthy();
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

  it('renders the api tab as integration guidance', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/api']}>
        <SettingsRoute {...defaultProps} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'API' })).toBeTruthy();
    expect(screen.getByText('Developer Integration Guide')).toBeTruthy();
    expect(screen.getByText('Unified Orchestration')).toBeTruthy();
    expect(screen.getByText('GET /api/engines')).toBeTruthy();
    expect(screen.getByText('GET /api/speaker-profiles')).toBeTruthy();
    expect(screen.getByText('POST /api/processing_queue')).toBeTruthy();
    expect(screen.getByText(/POST http:\/\/localhost:8001\/synthesize/i)).toBeTruthy();
    expect(screen.getByText(/"output_path": "\/path\/to\/output\.wav"/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'View Swagger Docs' })).toHaveAttribute('href', '/api/v1/tts/docs');
  });

  it('shows setup guidance for engines that need setup', async () => {
    vi.mocked(api.fetchEngines).mockResolvedValue([
      {
        ...mockedEngines[0],
        status: 'needs_setup',
        verified: false,
        enabled: false,
        dependencies_satisfied: false,
        missing_dependencies: ['torch', 'TTS'],
        health_message: 'XTTS environment is not configured yet.',
        enablement_message: 'Resolve XTTS setup before enabling this plugin.',
      },
      mockedEngines[1],
    ] as any);

    render(
      <MemoryRouter initialEntries={['/settings/engines']}>
        <SettingsRoute {...defaultProps} />
      </MemoryRouter>
    );

    expect(await screen.findByText('XTTS Local')).toBeTruthy();
    expect(screen.getByText(/XTTS environment is not configured yet\./i)).toBeTruthy();
    expect(screen.getByText(/Missing dependencies: torch, TTS\./i)).toBeTruthy();
    expect(screen.getAllByText(/Install Deps installs the Python packages listed for this engine/i)[0]).toBeTruthy();
    expect(screen.getByText(/XTTS verification uses your Default Voice from General settings/i)).toBeTruthy();
  });

  it('shows a truthful log summary when engine logs are requested', async () => {
    vi.mocked(api.fetchEngineLogs).mockResolvedValue({
      ok: false,
      message: 'Log streaming is not available yet. Check the logs/ directory in your Studio root.',
      logs: 'Log streaming is not available yet. Check the logs/ directory in your Studio root.',
    } as any);

    render(
      <MemoryRouter initialEntries={['/settings/engines']}>
        <SettingsRoute {...defaultProps} />
      </MemoryRouter>
    );

    expect(await screen.findByText('XTTS Local')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /Logs/i })[0]);

    await waitFor(() => {
      expect(defaultProps.onShowNotification).toHaveBeenCalledWith(
        'Log streaming is not available yet. Check the logs/ directory in your Studio root.'
      );
    });
  });
});
