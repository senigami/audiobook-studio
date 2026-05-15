import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { api } from '@/api';
import { EngineCard } from '@/pages/Settings/components/EngineCard';
import { formatEngineTestGeneratedAt } from '@/pages/Settings/components/engineFormatters';

vi.mock('@/api', () => ({
  api: {
    fetchEngineScenarios: vi.fn(),
    updateEngineSettings: vi.fn(),
    clearEngineSetting: vi.fn(),
    testEngine: vi.fn(),
    verifyEngine: vi.fn(),
    installEngineDependencies: vi.fn(),
    removeEnginePlugin: vi.fn(),
  },
}));

const voxtralEngine = {
  engine_id: 'voxtral',
  display_name: 'Voxtral (Mistral AI)',
  status: 'ready',
  verified: true,
  enabled: true,
  version: '1.0.0',
  local: false,
  cloud: true,
  network: true,
  languages: ['en'],
  capabilities: ['tts'],
  resource: {},
  author: 'Mistral AI',
  homepage: '',
  can_enable: true,
  settings_schema: {
    properties: {
      mistral_api_key: {
        type: 'string',
        title: 'Mistral API Key',
        default: '',
      },
      output_format: {
        type: 'string',
        title: 'Output Format',
        enum: ['wav', 'mp3'],
        default: 'wav',
        'x-ui': {
          hide_when_unverified: true,
        },
      },
      computer_speed_multiplier: {
        type: 'number',
        title: 'Computer Speed',
        default: 1,
        readOnly: true,
        'x-ui': {
          display: 'computer_speed_cps',
          baseline_cps: 16.7,
          hide_when_unverified: true,
        },
      },
    },
    'x-ui': {
      panel_title: 'Voxtral Cloud Voices',
      summary: 'Create a Mistral API key in your workspace settings.',
      hide_metadata_when_verified: true,
      hide_verification_guidance: true,
    },
  },
  current_settings: {
    mistral_api_key: 'sk-live',
    output_format: 'wav',
    computer_speed_multiplier: 2,
  },
  dev: {
    enabled: true,
    scenarios: 'dev/scenarios.json',
  },
} as any;

describe('formatEngineTestGeneratedAt', () => {
  it('formats unix seconds as a locale string', () => {
    const output = formatEngineTestGeneratedAt(1710000000);
    expect(output).not.toBe('Unknown');
    expect(output).not.toContain('Invalid Date');
  });

  it('formats ISO timestamps as a locale string', () => {
    const output = formatEngineTestGeneratedAt('2024-03-09T12:34:56Z');
    expect(output).not.toBe('Unknown');
    expect(output).not.toContain('Invalid Date');
  });
});

describe('EngineCard developer scenarios', () => {
  it('keeps engine identity stable and deep-merges schema when a scenario is selected', async () => {
    vi.mocked(api.fetchEngineScenarios).mockResolvedValue({
      scenarios: [
        {
          id: 'api_error',
          label: 'API Error (401)',
          engine_detail: {
            display_name: 'Voxtral Cloud',
            status: 'unverified',
            verified: false,
            enabled: false,
            settings_schema: {
              'x-ui': {
                hide_verification_guidance: true,
              },
            },
          },
        },
      ],
    } as any);

    render(<EngineCard engine={voxtralEngine} onUpdate={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'API Error (401)' }));

    expect(screen.getByRole('heading', { name: 'Voxtral (Mistral AI)' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Voxtral Cloud' })).not.toBeInTheDocument();
    expect(screen.getByText('Voxtral Cloud Voices')).toBeInTheDocument();
    expect(screen.getByText('Mistral API Key')).toBeInTheDocument();
    expect(screen.queryByText('Output Format')).not.toBeInTheDocument();
    expect(screen.queryByText('Computer Speed')).not.toBeInTheDocument();
  });

  it('restores schema-hidden fields in a ready scenario', async () => {
    vi.mocked(api.fetchEngineScenarios).mockResolvedValue({
      scenarios: [
        {
          id: 'ready',
          label: 'Ready',
          engine_detail: {
            status: 'ready',
            verified: true,
            enabled: true,
          },
        },
      ],
    } as any);

    render(<EngineCard engine={{ ...voxtralEngine, status: 'needs_setup', verified: false, enabled: false }} onUpdate={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Ready' }));

    await waitFor(() => {
      expect(screen.getByText('Output Format')).toBeInTheDocument();
    });
    expect(screen.getByText('Computer Speed')).toBeInTheDocument();
  });

  it('hides DEV badge and panel when dev mode is disabled', () => {
    const disabledDevEngine = {
      ...voxtralEngine,
      dev: { enabled: false }
    };

    render(<EngineCard engine={disabledDevEngine} onUpdate={vi.fn()} />);

    expect(screen.queryByText('DEV')).not.toBeInTheDocument();
    expect(screen.queryByText('Engine Developer Panel')).not.toBeInTheDocument();
  });
});
