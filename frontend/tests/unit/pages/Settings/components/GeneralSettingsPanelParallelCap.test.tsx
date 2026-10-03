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
import { failureResponse, refusalFixture, refusalResponse } from '../../../../helpers/capSafetyFixtures';

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

describe('GeneralSettingsPanel parallel cap safety', () => {
  const stored = { safe_mode: false, tts_parallel_cap: 1 } as any;
  const getInput = (): HTMLInputElement => screen.getByLabelText('Max concurrent segment renders') as HTMLInputElement;

  beforeEach(() => {
    baseProps.onRefresh.mockClear();
    baseProps.onShowNotification.mockClear();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ status: 'ok', settings: {} }) }) as any;
  });

  it('disables the increase button at the safe maximum', () => {
    render(<GeneralSettingsPanel {...baseProps} settings={stored} globalSafeMax={1} />);
    expect(screen.getByLabelText('Increase Max concurrent segment renders')).toBeDisabled();
  });

  it('clamps a typed value to the safe maximum before saving', async () => {
    render(<GeneralSettingsPanel {...baseProps} settings={stored} globalSafeMax={2} />);
    fireEvent.change(getInput(), { target: { value: '5' } });

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse((global.fetch as any).mock.calls[0][1].body)).toEqual({ tts_parallel_cap: 2 });
  });

  it('shows the one-at-a-time hint and links it to the stepper', () => {
    render(<GeneralSettingsPanel {...baseProps} settings={stored} globalSafeMax={1} />);
    expect(getInput()).toHaveAttribute('aria-describedby', 'parallel-cap-hint');
    expect(document.getElementById('parallel-cap-hint')).toHaveTextContent(
      'Studio estimates this computer can render one at a time right now. Closing other apps may allow more.'
    );
  });

  it('shows no hint before the first answer or when nothing is limited', () => {
    const { rerender } = render(<GeneralSettingsPanel {...baseProps} settings={stored} globalSafeMax={null} />);
    expect(document.getElementById('parallel-cap-hint')).toBeNull();
    expect(getInput()).not.toHaveAttribute('aria-describedby');

    rerender(<GeneralSettingsPanel {...baseProps} settings={stored} globalSafeMax={8} />);
    expect(document.getElementById('parallel-cap-hint')).toBeNull();
  });

  it('shows the unmeasurable hint when memory cannot be read', () => {
    render(<GeneralSettingsPanel {...baseProps} settings={stored} globalSafeMax={1} memoryMeasurable={false} />);
    expect(document.getElementById('parallel-cap-hint')).toHaveTextContent(
      'Studio could not check how much memory is free, so it will render one at a time for now.'
    );
  });

  it('shows a refusal inline, verbatim, without a saved toast, and re-reads settings', async () => {
    (global.fetch as any).mockResolvedValue(refusalResponse(refusalFixture()));
    const onLimitsRefresh = vi.fn();
    render(<GeneralSettingsPanel {...baseProps} settings={stored} globalSafeMax={8} onLimitsRefresh={onLimitsRefresh} />);

    fireEvent.change(getInput(), { target: { value: '3' } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Server sentence for tests, safe maximum 1.');
    expect(alert.id).toBe('parallel-cap-error');
    expect(getInput().value).toBe('1');
    expect(getInput()).toHaveAttribute('aria-describedby', 'parallel-cap-error');
    expect(baseProps.onRefresh).toHaveBeenCalled();
    expect(onLimitsRefresh).toHaveBeenCalled();
    expect(baseProps.onShowNotification).not.toHaveBeenCalled();
  });

  it('shows an invalid_cap refusal inline too', async () => {
    (global.fetch as any).mockResolvedValue(
      refusalResponse(refusalFixture({ code: 'invalid_cap', message: 'Not a whole number sentence.', violations: undefined }))
    );
    render(<GeneralSettingsPanel {...baseProps} settings={stored} />);
    fireEvent.change(getInput(), { target: { value: '3' } });

    expect(await screen.findByRole('alert')).toHaveTextContent('Not a whole number sentence.');
  });

  it('clears the refusal when the next save succeeds', async () => {
    (global.fetch as any).mockResolvedValueOnce(refusalResponse(refusalFixture()));
    render(<GeneralSettingsPanel {...baseProps} settings={stored} />);
    fireEvent.change(getInput(), { target: { value: '3' } });
    await screen.findByRole('alert');

    fireEvent.change(getInput(), { target: { value: '2' } });

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('treats a plain server error as a generic failure toast, not a refusal', async () => {
    (global.fetch as any).mockResolvedValue(failureResponse(500, 'boom'));
    render(<GeneralSettingsPanel {...baseProps} settings={stored} />);
    fireEvent.change(getInput(), { target: { value: '3' } });

    await waitFor(() =>
      expect(baseProps.onShowNotification).toHaveBeenCalledWith('Settings update failed. Please try again.')
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not treat a FastAPI validation 422 (detail is a list) as a cap refusal', async () => {
    (global.fetch as any).mockResolvedValue(failureResponse(422, [{ loc: ['body'], msg: 'bad' }]));
    render(<GeneralSettingsPanel {...baseProps} settings={stored} />);
    fireEvent.change(getInput(), { target: { value: '3' } });

    await waitFor(() =>
      expect(baseProps.onShowNotification).toHaveBeenCalledWith('Settings update failed. Please try again.')
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not treat the 503 plain-string detail as a cap refusal', async () => {
    (global.fetch as any).mockResolvedValue(failureResponse(503, 'No engine is known right now.'));
    render(<GeneralSettingsPanel {...baseProps} settings={stored} />);
    fireEvent.change(getInput(), { target: { value: '3' } });

    await waitFor(() => expect(baseProps.onShowNotification).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
