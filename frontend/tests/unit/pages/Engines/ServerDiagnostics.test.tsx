import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { api } from '@/api';
import { ServerDiagnostics } from '@/pages/Engines/components/ServerDiagnostics';

vi.mock('@/api', () => ({
  api: {
    fetchHome: vi.fn(),
    restartTtsServer: vi.fn(),
  },
}));

const makeTtsService = (overrides: Record<string, any> = {}) => ({
  id: 'tts_server',
  label: 'TTS Server',
  kind: 'tts_server',
  healthy: true,
  status: 'running',
  port: 7862,
  message: 'uptime 3h 12m',
  can_restart: true,
  ...overrides,
});

const makeHomeResponse = (ttsService = makeTtsService()) => ({
  version: '2.0.0',
  runtime_services: [ttsService],
});

describe('ServerDiagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders server status and port from the TTS server runtime service', async () => {
    vi.mocked(api.fetchHome).mockResolvedValue(makeHomeResponse());

    render(<ServerDiagnostics />);

    await waitFor(() => {
      expect(screen.getByTestId('server-status-label')).toHaveTextContent('running');
    });

    expect(screen.getByText(/port 7862/)).toBeInTheDocument();
    expect(screen.getByText('Last health check')).toBeInTheDocument();
  });

  it('shows "unknown" status when no TTS server service is present', async () => {
    vi.mocked(api.fetchHome).mockResolvedValue({ version: '2.0.0', runtime_services: [] });

    render(<ServerDiagnostics />);

    await waitFor(() => {
      expect(screen.getByTestId('server-status-label')).toHaveTextContent('unknown');
    });
  });

  it('fires api.restartTtsServer and re-fetches home when Restart server is clicked', async () => {
    vi.mocked(api.fetchHome).mockResolvedValue(makeHomeResponse());
    vi.mocked(api.restartTtsServer).mockResolvedValue({ ok: true });
    const onRefresh = vi.fn();

    render(<ServerDiagnostics onRefresh={onRefresh} />);

    await waitFor(() => {
      expect(screen.getByTestId('restart-server-btn')).not.toBeDisabled();
    });

    fireEvent.click(screen.getByTestId('restart-server-btn'));

    await waitFor(() => {
      expect(api.restartTtsServer).toHaveBeenCalledTimes(1);
    });

    // re-fetch happens after restart
    await waitFor(() => {
      expect(api.fetchHome).toHaveBeenCalledTimes(2);
    });

    expect(onRefresh).toHaveBeenCalled();
  });

  it('shows unhealthy color when the TTS server is not healthy', async () => {
    vi.mocked(api.fetchHome).mockResolvedValue(
      makeHomeResponse(makeTtsService({ healthy: false, status: 'stopped' }))
    );

    render(<ServerDiagnostics />);

    await waitFor(() => {
      expect(screen.getByTestId('server-status-label')).toHaveTextContent('stopped');
    });

    // The status label should use warning color
    const statusLabel = screen.getByTestId('server-status-label');
    expect(statusLabel).toHaveStyle({ color: 'var(--warning-text-strong)' });
  });

  it('disables Restart button while restart is in progress', async () => {
    let resolveRestart!: () => void;
    const restartPromise = new Promise<void>((res) => { resolveRestart = res; });
    vi.mocked(api.fetchHome).mockResolvedValue(makeHomeResponse());
    vi.mocked(api.restartTtsServer).mockReturnValue(restartPromise as any);

    render(<ServerDiagnostics />);

    await waitFor(() => {
      expect(screen.getByTestId('restart-server-btn')).not.toBeDisabled();
    });

    fireEvent.click(screen.getByTestId('restart-server-btn'));

    expect(screen.getByTestId('restart-server-btn')).toBeDisabled();

    resolveRestart();
    await waitFor(() => {
      expect(screen.getByTestId('restart-server-btn')).not.toBeDisabled();
    });
  });
});
