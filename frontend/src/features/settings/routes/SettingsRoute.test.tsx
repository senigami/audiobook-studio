import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SettingsRoute } from './SettingsRoute';

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

describe('SettingsRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })) as any;
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

  it('renders deep-linked engine settings foundation', () => {
    render(
      <MemoryRouter initialEntries={['/settings/engines']}>
        <SettingsRoute {...defaultProps} />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'TTS Engines' })).toBeTruthy();
    expect(screen.getByText('XTTS Local')).toBeTruthy();
    expect(screen.getByText('Voxtral Cloud Voices')).toBeTruthy();
    expect(screen.getByText(/cloud engines may send text/i)).toBeTruthy();
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
});
