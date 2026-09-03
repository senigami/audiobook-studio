import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EngineCalibrationCard } from '@/pages/Activity/components/EngineCalibrationCard';
import { ProductionTallyCard } from '@/pages/Activity/components/ProductionTallyCard';

vi.mock('@/api', () => ({
  api: {
    fetchHome: vi.fn(),
  },
}));

describe('Activity stats cards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders production tally values and tally date from the home payload', async () => {
    const { api } = await import('@/api');
    vi.mocked(api.fetchHome).mockResolvedValue({
      render_stats: {
        sample_count: 4,
        word_count: 1234,
        chars: 5678,
        audio_duration_seconds: 3660,
        render_duration_seconds: 3720,
        audio_hours_rendered: 1.02,
        render_hours_spent: 1.03,
        since_timestamp: 1710000000,
        by_engine: [],
      },
    } as any);

    render(<ProductionTallyCard />);

    await waitFor(() => {
      expect(api.fetchHome).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText('1h 1m')).toBeTruthy();
    expect(screen.getByText(/1,234\s+words/)).toBeTruthy();
    expect(screen.getByText(/5,678\s+characters/)).toBeTruthy();
    expect(screen.getByText(/Tally since/i)).toBeTruthy();
  });

  it('renders calibration speeds, confidence states, and not calibrated rows', () => {
    render(
      <EngineCalibrationCard
        engines={[
          {
            engine_id: 'xtts',
            display_name: 'XTTS',
            calibrated_cps: 33.4,
            calibration_confidence_percent: 85,
          },
          {
            engine_id: 'voxtral',
            display_name: 'Voxtral',
            calibrated_cps: 12.1,
            calibration_confidence_percent: 45,
          },
          {
            engine_id: 'uncalibrated',
            display_name: 'Legacy Engine',
            calibrated_cps: null,
            calibration_confidence_percent: null,
          },
        ] as any}
      />
    );

    expect(screen.getByText('XTTS')).toBeTruthy();
    expect(screen.getByText('33.4 c/s')).toBeTruthy();
    expect(screen.getByTestId('engine-calibration-confidence-xtts')).toHaveAttribute('data-confidence-state', 'success');

    expect(screen.getByText('Voxtral')).toBeTruthy();
    expect(screen.getByText('12.1 c/s')).toBeTruthy();
    expect(screen.getByTestId('engine-calibration-confidence-voxtral')).toHaveAttribute('data-confidence-state', 'warning');

    expect(screen.getByText('Legacy Engine')).toBeTruthy();
    expect(screen.getByText(/^not calibrated$/)).toBeTruthy();
    expect(screen.getByTestId('engine-calibration-confidence-uncalibrated')).toHaveAttribute('data-confidence-state', 'muted');
  });
});
