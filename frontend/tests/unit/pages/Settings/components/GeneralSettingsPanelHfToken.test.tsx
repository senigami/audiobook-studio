/**
 * GeneralSettingsPanelHfToken.test.tsx
 *
 * The Hugging Face publish flow (Voice Lab "Publish to Hugging Face") reads
 * its token from settings.huggingface_token server-side; this is the only
 * place a user can configure it. The backend always redacts the real value
 * to '***' (app/api/routers/system.py's _redact_settings) -- the frontend
 * must never expect/display the real token, only a configured/not-configured
 * signal, and must let a user set or clear it by POSTing a new plain value.
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

describe('GeneralSettingsPanel Hugging Face token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ status: 'ok', settings: {} }) }) as any;
  });

  const getTokenInput = (): HTMLInputElement =>
    screen.getByLabelText('Hugging Face access token') as HTMLInputElement;

  it('shows "Configured" and a Clear action when the backend reports the redacted sentinel', () => {
    render(<GeneralSettingsPanel {...baseProps} settings={{ safe_mode: false, huggingface_token: '***' } as any} />);

    expect(screen.getByText('Configured')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument();
    expect(getTokenInput().value).toBe(''); // never pre-filled with any real/redacted value
  });

  it('shows no "Configured" badge and a disabled action when no token is set', () => {
    render(<GeneralSettingsPanel {...baseProps} settings={{ safe_mode: false, huggingface_token: '' } as any} />);

    expect(screen.queryByText('Configured')).toBeNull();
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('typing a new token flips the action button to Save and posts it as JSON on click', async () => {
    render(<GeneralSettingsPanel {...baseProps} settings={{ safe_mode: false, huggingface_token: '' } as any} />);

    fireEvent.change(getTokenInput(), { target: { value: 'hf_newtoken123' } });
    const saveButton = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(saveButton);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, init] = (global.fetch as any).mock.calls[0];
    expect(url).toBe('/api/settings');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ huggingface_token: 'hf_newtoken123' });
  });

  it('clicking Clear when a token is configured posts an empty string', async () => {
    render(<GeneralSettingsPanel {...baseProps} settings={{ safe_mode: false, huggingface_token: '***' } as any} />);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [, init] = (global.fetch as any).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ huggingface_token: '' });
  });

  it('calls onRefresh and clears the input after a successful save', async () => {
    const onRefresh = vi.fn();
    render(<GeneralSettingsPanel {...baseProps} onRefresh={onRefresh} settings={{ safe_mode: false, huggingface_token: '' } as any} />);

    fireEvent.change(getTokenInput(), { target: { value: 'hf_abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    expect(getTokenInput().value).toBe('');
  });
});
