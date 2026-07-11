/**
 * GeneralSettingsPanelParallelCap.test.tsx
 *
 * Parallel segment rendering (tts_parallel_cap) must be reachable as an
 * in-app Settings toggle, not only via the raw /api/settings JSON body or
 * the TTS_PARALLEL_CAP env var (2026-07-05: parallel rendering ships as the
 * default; this toggle is the escape hatch back to strictly sequential).
 *
 * Mocks: fetch (external network) only. Does NOT mock GeneralSettingsPanel.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeneralSettingsPanel } from '@/pages/Settings/components/GeneralSettingsPanel';

const baseProps = {
  speakerProfiles: [] as any,
  speakers: [] as any,
  engines: [] as any,
  onRefresh: vi.fn(),
  onShowNotification: vi.fn(),
};

describe('GeneralSettingsPanel parallel rendering toggle', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ status: 'ok', settings: {} }) }) as any;
  });

  /** Walk up from the "Parallel Segment Rendering" h3 to find the enclosing card's toggle button. */
  const getParallelToggleBtn = (): HTMLButtonElement => {
    const h3 = screen.getByText('Parallel Segment Rendering');
    const textDiv = h3.parentElement as HTMLElement;
    const leftFlex = textDiv.parentElement as HTMLElement;
    const card = leftFlex.parentElement as HTMLElement;
    return card.querySelector('button') as HTMLButtonElement;
  };

  it('shows ON when tts_parallel_cap is greater than 1', () => {
    render(<GeneralSettingsPanel {...baseProps} settings={{ safe_mode: false, tts_parallel_cap: 2 } as any} />);
    expect(getParallelToggleBtn().textContent).toBe('ON');
  });

  it('shows OFF when tts_parallel_cap is 1 (sequential)', () => {
    render(<GeneralSettingsPanel {...baseProps} settings={{ safe_mode: false, tts_parallel_cap: 1 } as any} />);
    expect(getParallelToggleBtn().textContent).toBe('OFF');
  });

  it('clicking the toggle when ON posts tts_parallel_cap=1 as JSON to /api/settings', async () => {
    render(<GeneralSettingsPanel {...baseProps} settings={{ safe_mode: false, tts_parallel_cap: 2 } as any} />);

    fireEvent.click(getParallelToggleBtn());

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('/api/settings');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ tts_parallel_cap: 1 });
  });

  it('clicking the toggle when OFF posts tts_parallel_cap=2 as JSON to /api/settings', async () => {
    render(<GeneralSettingsPanel {...baseProps} settings={{ safe_mode: false, tts_parallel_cap: 1 } as any} />);

    fireEvent.click(getParallelToggleBtn());

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('/api/settings');
    expect(JSON.parse(init.body)).toEqual({ tts_parallel_cap: 2 });
  });
});
