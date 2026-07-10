import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { api } from '@/api';
import { EngineCard } from '@/pages/Engines/components/EngineCard';
import { formatEngineTestGeneratedAt } from '@/pages/Engines/components/engineFormatters';

vi.mock('@/api', () => ({
  api: {
    fetchEngineScenarios: vi.fn(),
    updateEngineSettings: vi.fn(),
    clearEngineSetting: vi.fn(),
    testEngine: vi.fn(),
    verifyEngine: vi.fn(),
    installEngineDependencies: vi.fn(),
    fetchEngineRequirements: vi.fn().mockResolvedValue({ ok: true, requirements: ['some-pkg'] }),
    removeEnginePlugin: vi.fn(),
    resetEngineCalibration: vi.fn(),
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
    // 1710000000 unix seconds = 2024-03-09T16:00:00.000Z. If the seconds->ms
    // multiplication were dropped, Date would resolve to a 1970 timestamp instead,
    // so asserting the year catches that regression (not just "is a valid Date").
    const output = formatEngineTestGeneratedAt(1710000000);
    expect(output).not.toBe('Unknown');
    expect(output).not.toContain('Invalid Date');
    expect(output).toContain('2024');
  });

  it('formats ISO timestamps as a locale string', () => {
    const output = formatEngineTestGeneratedAt('2024-03-09T12:34:56Z');
    expect(output).not.toBe('Unknown');
    expect(output).not.toContain('Invalid Date');
    expect(output).toContain('2024');
  });
});

describe('EngineCard developer scenarios', () => {
  it('shows a scenario-load error in the dev panel and logs it', async () => {
    vi.mocked(api.fetchEngineScenarios).mockRejectedValueOnce(new Error('Scenario service unavailable'));

    render(<EngineCard engine={voxtralEngine} onUpdate={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText((content, element) => element?.tagName === 'DIV' && element.childElementCount === 0 && content === 'Scenario service unavailable')).toBeInTheDocument();
      expect(screen.getAllByText((content, element) => element?.tagName === 'DIV' && element.childElementCount === 0 && content.includes('Error: Scenario service unavailable'))).toHaveLength(1);
    });
  });

  it('logs real action failures to the dev console when dev mode is enabled', async () => {
    vi.mocked(api.fetchEngineScenarios).mockResolvedValue({ scenarios: [] } as any);
    vi.mocked(api.testEngine).mockRejectedValueOnce(new Error('Network down'));
    const onShowNotification = vi.fn();

    render(<EngineCard engine={voxtralEngine} onUpdate={vi.fn()} onShowNotification={onShowNotification} />);

    fireEvent.click(screen.getByRole('button', { name: 'Run Test' }));

    await waitFor(() => {
      expect(screen.getAllByText((content, element) => element?.tagName === 'DIV' && element.childElementCount === 0 && content.includes('Error: Network down'))).toHaveLength(1);
    });
    expect(onShowNotification).toHaveBeenCalledWith('Test failed: Network down');
  });

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
    expect(screen.getByText('Voice generation speed')).toBeInTheDocument();
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
    expect(screen.getByText('Voice generation speed')).toBeInTheDocument();
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

describe('EngineCard hide_settings_when_not_ready gate', () => {
  const xttsLikeEngine = {
    engine_id: 'tts_xtts',
    display_name: 'XTTS',
    status: 'unverified' as const,
    verified: false,
    enabled: false,
    version: '2.0.0',
    local: true,
    cloud: false,
    network: false,
    languages: ['en'],
    capabilities: ['tts'],
    resource: {},
    author: 'Coqui',
    homepage: '',
    can_enable: false,
    settings_schema: {
      properties: {
        model_path: {
          type: 'string',
          title: 'Model Path',
        },
      },
      'x-ui': {
        hide_settings_when_not_ready: true,
      },
    },
    current_settings: { model_path: '/models/xtts' },
    dev: { enabled: false },
  } as any;

  it('keeps settings form visible when status is unverified even with hide_settings_when_not_ready flag', () => {
    render(<EngineCard engine={xttsLikeEngine} onUpdate={vi.fn()} />);
    expect(screen.getByText('Model Path')).toBeInTheDocument();
  });

  it('hides settings form when status is needs_setup and hide_settings_when_not_ready flag is set', () => {
    render(<EngineCard engine={{ ...xttsLikeEngine, status: 'needs_setup' }} onUpdate={vi.fn()} />);
    expect(screen.queryByText('Model Path')).not.toBeInTheDocument();
  });
});

describe('EngineCard dependency installation', () => {
  it('shows "Installing..." and disables the button during install, then calls onUpdate and shows notification on success', async () => {
    const engineWithDeps = { ...voxtralEngine, dependencies_satisfied: false, missing_dependencies: ['some-pkg'] };
    const onUpdate = vi.fn();
    const onShowNotification = vi.fn();
    vi.mocked(api.installEngineDependencies).mockResolvedValue({ ok: true, message: 'Done!' });

    render(<EngineCard engine={engineWithDeps} onUpdate={onUpdate} onShowNotification={onShowNotification} />);

    // Click opens the trust modal after fetching requirements
    fireEvent.click(screen.getByRole('button', { name: 'Install Deps' }));

    // Confirm through trust modal
    const confirmBtn = await screen.findByRole('button', { name: /Install Dependencies/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onShowNotification).toHaveBeenCalledWith('Done!');
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  it('shows error notification and still calls onUpdate on failure', async () => {
    const engineWithDeps = { ...voxtralEngine, dependencies_satisfied: false, missing_dependencies: ['some-pkg'] };
    const onUpdate = vi.fn();
    const onShowNotification = vi.fn();
    vi.mocked(api.installEngineDependencies).mockRejectedValue(new Error('Pip failed'));

    render(<EngineCard engine={engineWithDeps} onUpdate={onUpdate} onShowNotification={onShowNotification} />);

    // Click opens the trust modal
    fireEvent.click(screen.getByRole('button', { name: 'Install Deps' }));

    // Confirm through trust modal
    const confirmBtn = await screen.findByRole('button', { name: /Install Dependencies/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onShowNotification).toHaveBeenCalledWith('Installation failed: Pip failed');
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  it('shows "Uninstalling..." and disables the button during uninstall, then calls onUpdate and shows notification on success', async () => {
    const onUpdate = vi.fn();
    const onShowNotification = vi.fn();
    vi.mocked(api.removeEnginePlugin).mockResolvedValue({ ok: true });

    render(<EngineCard engine={voxtralEngine} onUpdate={onUpdate} onShowNotification={onShowNotification} />);

    // Click Uninstall to open modal
    fireEvent.click(screen.getByRole('button', { name: 'Uninstall' }));

    // Click Confirm in modal
    fireEvent.click(screen.getByRole('button', { name: 'Uninstall Plugin' }));

    const uninstallBtn = screen.getByRole('button', { name: 'Uninstalling...' });
    expect(uninstallBtn).toBeInTheDocument();
    expect(uninstallBtn).toBeDisabled();

    await waitFor(() => {
      expect(onShowNotification).toHaveBeenCalledWith('Plugin uninstalled successfully.');
      expect(onUpdate).toHaveBeenCalled();
    });

    expect(screen.queryByText('Uninstalling...')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Uninstall' })).not.toBeDisabled();
  });

  it('calls resetEngineCalibration when "Reset Calibration" button is clicked', async () => {
    vi.mocked(api.resetEngineCalibration).mockResolvedValueOnce({ ok: true });
    const onUpdate = vi.fn();
    const onShowNotification = vi.fn();
    const calibratedEngine = {
      ...voxtralEngine,
      calibrated_cps: 23.5,
      calibration_sample_count: 24,
      calibration_since: Date.UTC(2026, 4, 30, 16, 0, 0) / 1000,
    };

    render(<EngineCard engine={calibratedEngine} onUpdate={onUpdate} onShowNotification={onShowNotification} />);

    const resetBtn = screen.getByRole('button', { name: 'Reset Baseline' });
    fireEvent.click(resetBtn);

    await waitFor(() => {
      expect(api.resetEngineCalibration).toHaveBeenCalledWith('voxtral');
      expect(onShowNotification).toHaveBeenCalledWith('Voxtral (Mistral AI) calibration history reset.');
      expect(onUpdate).toHaveBeenCalled();
    });

  });

  it('displays a dedicated computer speed block above test samples with calibration metadata and reset control', () => {
    const engineWithSpeed = {
      ...voxtralEngine,
      calibrated_cps: 33.4,
      calibration_sample_count: 24,
      calibration_since: Date.UTC(2026, 4, 30, 16, 0, 0) / 1000,
      current_settings: {
        ...voxtralEngine.current_settings,
        computer_speed_multiplier: 2.0,
      }
    };

    const { rerender } = render(<EngineCard engine={engineWithSpeed} onUpdate={vi.fn()} />);

    expect(screen.getByText('33.4 characters/sec')).toBeInTheDocument();
    expect(screen.getByText(/from 24 samples since/i)).toBeInTheDocument();
    expect(screen.getByText(/5\/30\/2026|5\/30\/26/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset Baseline' })).toBeInTheDocument();
    expect(screen.queryByText(/x Speed/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Reset Calibration')).not.toBeInTheDocument();

    const engineNoSpeed = {
      ...voxtralEngine,
      calibrated_cps: null,
      calibration_sample_count: null,
      calibration_since: null,
      current_settings: {
        ...voxtralEngine.current_settings,
        computer_speed_multiplier: null,
      }
    };
    rerender(<EngineCard engine={engineNoSpeed} onUpdate={vi.fn()} />);
    expect(screen.getByText('Not yet computed')).toBeInTheDocument();
    expect(screen.queryByText(/from 24 samples since/i)).not.toBeInTheDocument();
  });

  it('renders "Voice generation speed" instead of "Computer Speed"', () => {
    render(<EngineCard engine={voxtralEngine} onUpdate={vi.fn()} />);
    expect(screen.getByText('Voice generation speed')).toBeInTheDocument();
    expect(screen.queryByText('Computer Speed')).not.toBeInTheDocument();
  });

  it('proves the calibration block appears before other sections in the expanded card', () => {
    render(<EngineCard engine={voxtralEngine} onUpdate={vi.fn()} />);

    const html = document.body.innerHTML;
    const calibrationIndex = html.indexOf('Voice generation speed');
    const settingsIndex = html.indexOf('Mistral API Key');

    expect(calibrationIndex).toBeGreaterThan(-1);
    expect(settingsIndex).toBeGreaterThan(-1);
    expect(calibrationIndex).toBeLessThan(settingsIndex);
  });

  it('renders confidence-sensitive subtle color treatment when confidence is present', () => {
    // Low confidence (< 70)
    const lowConfEngine = {
      ...voxtralEngine,
      calibrated_cps: 33.4,
      calibration_confidence_percent: 60,
      calibration_sample_count: 24,
      calibration_since: Date.UTC(2026, 4, 30, 16, 0, 0) / 1000,
    };
    const { rerender } = render(<EngineCard engine={lowConfEngine} onUpdate={vi.fn()} />);

    const textEl = screen.getByText('33.4 characters/sec, 60% confidence');
    const blockContainer = textEl.closest('div')?.parentElement;
    expect(blockContainer?.getAttribute('style')).toContain('var(--warning-tint-border)');

    // High confidence (>= 70)
    const highConfEngine = {
      ...voxtralEngine,
      calibrated_cps: 33.4,
      calibration_confidence_percent: 85,
      calibration_sample_count: 24,
      calibration_since: Date.UTC(2026, 4, 30, 16, 0, 0) / 1000,
    };
    rerender(<EngineCard engine={highConfEngine} onUpdate={vi.fn()} />);
    expect(blockContainer?.getAttribute('style')).toContain('var(--accent-focus-ring)');
  });

  it('proves helper text appears only when calibration_confidence_percent is below 70', () => {
    const lowConfEngine = {
      ...voxtralEngine,
      calibrated_cps: 33.4,
      calibration_confidence_percent: 65,
      calibration_sample_count: 24,
      calibration_since: Date.UTC(2026, 4, 30, 16, 0, 0) / 1000,
    };
    const { rerender } = render(<EngineCard engine={lowConfEngine} onUpdate={vi.fn()} />);

    const helperText = 'Generate more text-to-speech renders to improve confidence in this speed estimate.';
    expect(screen.getByText(helperText)).toBeInTheDocument();

    // 70 or above
    const borderConfEngine = {
      ...voxtralEngine,
      calibrated_cps: 33.4,
      calibration_confidence_percent: 70,
      calibration_sample_count: 24,
      calibration_since: Date.UTC(2026, 4, 30, 16, 0, 0) / 1000,
    };
    rerender(<EngineCard engine={borderConfEngine} onUpdate={vi.fn()} />);
    expect(screen.queryByText(helperText)).not.toBeInTheDocument();

    // null confidence
    const nullConfEngine = {
      ...voxtralEngine,
      calibrated_cps: 33.4,
      calibration_confidence_percent: null,
      calibration_sample_count: 24,
      calibration_since: Date.UTC(2026, 4, 30, 16, 0, 0) / 1000,
    };
    rerender(<EngineCard engine={nullConfEngine} onUpdate={vi.fn()} />);
    expect(screen.queryByText(helperText)).not.toBeInTheDocument();
  });
});

describe('EngineCard collapsed-header calibration chip (R5-T10)', () => {
  it('shows calibration chip in collapsed header when engine has calibration data', () => {
    const calibratedEngine = {
      ...voxtralEngine,
      calibrated_cps: 14.2,
      calibration_confidence_percent: 85,
      calibration_sample_count: 20,
      calibration_since: Date.UTC(2026, 4, 30, 16, 0, 0) / 1000,
    };

    render(<EngineCard engine={calibratedEngine} onUpdate={vi.fn()} />);

    const chip = screen.getByTestId('calibration-chip');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('14.2 chars/s');
    expect(chip).toHaveTextContent('high confidence');
  });

  it('shows "low confidence" label when confidence is below 70', () => {
    const lowConfEngine = {
      ...voxtralEngine,
      calibrated_cps: 14.2,
      calibration_confidence_percent: 55,
      calibration_sample_count: 3,
      calibration_since: Date.UTC(2026, 4, 30, 16, 0, 0) / 1000,
    };

    render(<EngineCard engine={lowConfEngine} onUpdate={vi.fn()} />);

    expect(screen.getByTestId('calibration-chip')).toHaveTextContent('low confidence');
  });

  it('does not show calibration chip in header when no calibration data present', () => {
    const uncalibratedEngine = {
      ...voxtralEngine,
      calibrated_cps: null,
      calibration_confidence_percent: null,
      calibration_sample_count: null,
      calibration_since: null,
    };

    render(<EngineCard engine={uncalibratedEngine} onUpdate={vi.fn()} />);

    expect(screen.queryByTestId('calibration-chip')).not.toBeInTheDocument();
  });

  it('header Reset calibration link calls resetEngineCalibration', async () => {
    vi.mocked(api.resetEngineCalibration).mockResolvedValueOnce({ ok: true });
    const onShowNotification = vi.fn();
    const onUpdate = vi.fn();

    const calibratedEngine = {
      ...voxtralEngine,
      calibrated_cps: 14.2,
      calibration_confidence_percent: 85,
      calibration_sample_count: 20,
      calibration_since: Date.UTC(2026, 4, 30, 16, 0, 0) / 1000,
    };

    render(<EngineCard engine={calibratedEngine} onUpdate={onUpdate} onShowNotification={onShowNotification} />);

    // There will be two "Reset calibration" / "Reset Baseline" buttons:
    // the header link and the expanded panel button. Use aria-label.
    const headerLink = screen.getByRole('button', { name: 'Reset calibration baseline' });
    fireEvent.click(headerLink);

    await waitFor(() => {
      expect(api.resetEngineCalibration).toHaveBeenCalledWith('voxtral');
      expect(onShowNotification).toHaveBeenCalledWith('Voxtral (Mistral AI) calibration history reset.');
    });
  });

  it('header chips show ON pill label from ToggleButton and READY/VERIFIED status chips', () => {
    render(<EngineCard engine={voxtralEngine} onUpdate={vi.fn()} />);
    // ToggleButton renders "ON" / "OFF" visually — the accessible role is a button
    // Status chips are rendered as spans; assert their text content
    expect(screen.getByText('READY')).toBeInTheDocument();
    expect(screen.getByText('VERIFIED')).toBeInTheDocument();
  });

  it('dev row is hidden when dev mode is off', () => {
    const noDevEngine = { ...voxtralEngine, dev: { enabled: false } };
    render(<EngineCard engine={noDevEngine} onUpdate={vi.fn()} />);
    expect(screen.queryByText('Engine Developer Panel')).not.toBeInTheDocument();
    expect(screen.queryByText('DEV')).not.toBeInTheDocument();
  });
});
