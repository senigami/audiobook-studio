
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EngineCard } from '@/pages/Settings/components/EngineCard';
import { api } from '@/api';
import type { TtsEngine } from '@/types';

vi.mock('@/api', () => ({
  api: {
    installEngineDependencies: vi.fn(),
    fetchEngineRequirements: vi.fn().mockResolvedValue({ ok: true, requirements: ['TTS>=0.22'] }),
  },
}));

const mockEngine: TtsEngine = {
  engine_id: 'xtts',
  display_name: 'XTTS',
  status: 'needs_setup',
  enabled: false,
  verified: false,
  dependencies_satisfied: false,
  missing_dependencies: ['TTS'],
  can_enable: false,
  settings_schema: { type: 'object', properties: {} },
};

const voxtralMissingApiKey: TtsEngine = {
  engine_id: 'voxtral',
  display_name: 'Voxtral',
  status: 'needs_setup',
  enabled: false,
  verified: false,
  dependencies_satisfied: true,
  missing_dependencies: [],
  can_enable: false,
  setup_message: 'Voxtral requires MISTRAL_API_KEY environment variable.',
  settings_schema: { type: 'object', properties: {} },
  cloud: true,
  network: true,
} as TtsEngine;

const voxtralReadyForVerification: TtsEngine = {
  ...voxtralMissingApiKey,
  status: 'unverified',
  setup_message: '',
  health_message: '',
  current_settings: {
    mistral_api_key: 'saved-key',
  },
};

describe('EngineCard Install Deps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Install Deps button when status is needs_setup', async () => {
    render(<EngineCard engine={mockEngine} onUpdate={vi.fn()} />);
    
    // Open the details first to see the button
    const summary = screen.getByText('XTTS');
    fireEvent.click(summary);

    expect(await screen.findByRole('button', { name: /Install Deps/i })).toBeInTheDocument();
  });

  it('handles installation flow with loading state and refresh', async () => {
    const onUpdate = vi.fn();
    const onShowNotification = vi.fn();

    vi.mocked(api.installEngineDependencies).mockResolvedValue({
      ok: true,
      message: 'Installed'
    });

    render(
      <EngineCard
        engine={mockEngine}
        onUpdate={onUpdate}
        onShowNotification={onShowNotification}
      />
    );

    // Open details
    fireEvent.click(screen.getByText('XTTS'));

    // Click "Install Deps" — this fetches requirements then shows the trust modal
    const installBtn = await screen.findByRole('button', { name: /Install Deps/i });
    fireEvent.click(installBtn);

    // Confirm through the trust modal
    const confirmBtn = await screen.findByRole('button', { name: /Install Dependencies/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(onShowNotification).toHaveBeenCalledWith('Installed');
  });

  it('prevents multiple clicks while installing', async () => {
    let resolveInstall: (val: any) => void = () => {};
    const installPromise = new Promise((resolve) => {
      resolveInstall = resolve;
    });
    vi.mocked(api.installEngineDependencies).mockReturnValue(installPromise as any);

    render(<EngineCard engine={mockEngine} onUpdate={vi.fn()} />);
    fireEvent.click(screen.getByText('XTTS'));

    const installBtn = await screen.findByRole('button', { name: /Install Deps/i });
    fireEvent.click(installBtn); // opens modal

    const confirmBtn = await screen.findByRole('button', { name: /Install Dependencies/i });
    fireEvent.click(confirmBtn); // first confirm — button disabled now
    fireEvent.click(installBtn); // original button is disabled while installing

    expect(api.installEngineDependencies).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInstall({ ok: true, message: 'Done' });
      await installPromise;
    });
  });

  it('shows a useful notification when installation fails', async () => {
    const onShowNotification = vi.fn();
    vi.mocked(api.installEngineDependencies).mockRejectedValue(
      new Error('Dependency installation failed: pip exited 1')
    );

    render(
      <EngineCard
        engine={mockEngine}
        onUpdate={vi.fn()}
        onShowNotification={onShowNotification}
      />
    );
    fireEvent.click(screen.getByText('XTTS'));

    const installBtn = await screen.findByRole('button', { name: /Install Deps/i });
    fireEvent.click(installBtn);

    // Confirm through the trust modal
    const confirmBtn = await screen.findByRole('button', { name: /Install Dependencies/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onShowNotification).toHaveBeenCalledWith(
        'Installation failed: Dependency installation failed: pip exited 1'
      );
    });
  });

  it('does not show Install Deps for setup issues that are not dependency failures', async () => {
    render(<EngineCard engine={voxtralMissingApiKey} onUpdate={vi.fn()} />);
    fireEvent.click(screen.getByText('Voxtral'));

    expect(screen.queryByRole('button', { name: /Install Deps/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Voxtral requires MISTRAL_API_KEY/i)).toBeInTheDocument();
    expect(screen.queryByText(/Install Deps installs/i)).not.toBeInTheDocument();
  });

  it('does not show setup warning after setup is resolved but verification is still pending', async () => {
    render(<EngineCard engine={voxtralReadyForVerification} onUpdate={vi.fn()} />);
    fireEvent.click(screen.getByText('Voxtral'));

    expect(screen.queryByText('Setup required')).not.toBeInTheDocument();
    expect(screen.queryByText(/Voxtral requires/i)).not.toBeInTheDocument();
    expect(screen.getByText('UNVERIFIED')).toBeInTheDocument();
    expect(screen.getByText('NOT READY')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Verify/i })).toBeInTheDocument();
  });
});
