/**
 * GeneralSettingsPanelParallelCap.test.tsx
 *
 * Parallel segment rendering (tts_parallel_cap) must be reachable as an
 * in-app Settings numeric stepper, not only via the raw /api/settings JSON
 * body or the TTS_PARALLEL_CAP env var (2026-07-05: parallel rendering ships
 * as the default; this control is the escape hatch back to strictly
 * sequential rendering, and also the way to raise the cap above 2 — task 012
 * upgraded this from a binary 1/2 toggle to a real numeric stepper).
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

describe('GeneralSettingsPanel parallel rendering stepper', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ status: 'ok', settings: {} }) }) as any;
  });

  const getParallelCapInput = (): HTMLInputElement =>
    screen.getByLabelText('Max concurrent segment renders') as HTMLInputElement;

  it('shows the current tts_parallel_cap value', () => {
    render(<GeneralSettingsPanel {...baseProps} settings={{ safe_mode: false, tts_parallel_cap: 4 } as any} />);
    expect(getParallelCapInput().value).toBe('4');
  });

  it('defaults to 1 when tts_parallel_cap is unset', () => {
    render(<GeneralSettingsPanel {...baseProps} settings={{ safe_mode: false } as any} />);
    expect(getParallelCapInput().value).toBe('1');
  });

  it('changing the value posts the raw number as JSON to /api/settings', async () => {
    render(<GeneralSettingsPanel {...baseProps} settings={{ safe_mode: false, tts_parallel_cap: 1 } as any} />);

    fireEvent.change(getParallelCapInput(), { target: { value: '5' } });

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('/api/settings');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ tts_parallel_cap: 5 });
  });

  it('clamps a value above the global ceiling (8) client-side before saving', async () => {
    render(<GeneralSettingsPanel {...baseProps} settings={{ safe_mode: false, tts_parallel_cap: 1 } as any} />);

    fireEvent.change(getParallelCapInput(), { target: { value: '99' } });

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, init] = (global.fetch as any).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ tts_parallel_cap: 8 });
  });

  it('clamps a value below 1 client-side before saving', async () => {
    render(<GeneralSettingsPanel {...baseProps} settings={{ safe_mode: false, tts_parallel_cap: 3 } as any} />);

    fireEvent.change(getParallelCapInput(), { target: { value: '0' } });

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, init] = (global.fetch as any).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ tts_parallel_cap: 1 });
  });
});
