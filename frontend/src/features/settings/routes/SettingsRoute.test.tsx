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
  },
}));

const defaultProps = {
  settings: {
    safe_mode: true,
    make_mp3: true,
    mistral_api_key: 'test-key',
    voxtral_enabled: true,
  } as any,
  onRefresh: vi.fn(),
  onShowNotification: vi.fn(),
};

const mockedEngines = [
  {
    engine_id: 'xtts-local',
    display_name: 'XTTS Local',
    status: 'ready',
    verified: true,
    version: '1.2.3',
    local: true,
    cloud: false,
    network: false,
    languages: ['en'],
    capabilities: ['preview'],
    resource: { gpu: false, vram_mb: 0, cpu_heavy: true },
    author: 'Studio',
    homepage: 'https://example.com/xtts',
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
    version: '0.4.0',
    local: false,
    cloud: true,
    network: true,
    languages: ['en'],
    capabilities: ['preview'],
    resource: { gpu: false, vram_mb: 0, cpu_heavy: false },
    author: 'Mistral',
    homepage: '',
    settings_schema: {
      properties: {
        voxtral_enabled: {
          type: 'boolean',
          title: 'Enable Voxtral',
          default: false,
          description: 'Visible in Voices',
          'x-ui': {
            requires_verification: true,
            locked_message: 'Verify this engine before turning Voxtral on.',
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
      voxtral_enabled: false,
      mistral_api_key: '',
      voxtral_model: 'voxtral-mini-tts-2603',
    },
  },
];

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
    expect(screen.getByText('Safe Mode')).toBeTruthy();
    expect(screen.getByText('Produce MP3')).toBeTruthy();
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

    expect(await screen.findByText('Temperature')).toBeTruthy();
    expect(screen.getByText('Speaker Name')).toBeTruthy();

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
        '/settings',
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
    expect(screen.getByText('TTS Server')).toBeTruthy();
    expect(screen.getByText(/2 engine\(s\) discovered/i)).toBeTruthy();
    expect(screen.getByText('Backend Mode')).toBeTruthy();
    expect(screen.getByText('Direct-In-Process')).toBeTruthy();
    expect(screen.getByText('Orchestrator')).toBeTruthy();
    expect(screen.getByText('Studio 2.0')).toBeTruthy();
  });

  it('renders the api tab as integration guidance', async () => {
    render(
      <MemoryRouter initialEntries={['/settings/api']}>
        <SettingsRoute {...defaultProps} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: 'API' })).toBeTruthy();
    expect(screen.getByText('Studio API')).toBeTruthy();
    expect(screen.getByText('/api/home')).toBeTruthy();
    expect(screen.getByText('/api/engines')).toBeTruthy();
    expect(screen.getByText('Read only')).toBeTruthy();
  });
});
