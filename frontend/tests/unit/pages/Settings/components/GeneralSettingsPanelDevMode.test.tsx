/**
 * GeneralSettingsPanelDevMode.test.tsx
 *
 * Tests that the Developer Mode toggle in General Settings correctly flips
 * localStorage and causes the Developer sidebar entry to appear/disappear.
 *
 * Mocks: localStorage (external storage), fetch (external network).
 * Does NOT mock devMode or GeneralSettingsPanel.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SettingsRoute } from '@/pages/Settings/SettingsRoute';
import { STORAGE_KEY } from '@/utils/devMode';

vi.mock('@/api', () => ({
  api: {
    fetchHome: vi.fn().mockResolvedValue({ version: '2.0.0', engines: [], render_stats: {}, runtime_services: [], system_info: {} }),
    fetchEngines: vi.fn().mockResolvedValue([]),
    refreshPlugins: vi.fn(),
    updateEngineSettings: vi.fn(),
    clearEngineSetting: vi.fn(),
    resetEngineCalibration: vi.fn(),
    verifyEngine: vi.fn(),
    installEngineDependencies: vi.fn(),
    fetchEngineRequirements: vi.fn().mockResolvedValue({ ok: true, requirements: [] }),
    removeEnginePlugin: vi.fn(),
    fetchEngineLogs: vi.fn(),
    installPlugin: vi.fn(),
    resetRenderStats: vi.fn(),
    restartTtsServer: vi.fn(),
    importEnginePlugin: vi.fn(),
    previewEnginePlugin: vi.fn(),
    confirmEnginePlugin: vi.fn(),
    cancelEnginePluginStaging: vi.fn(),
  },
}));

const defaultProps = {
  settings: { safe_mode: false } as any,
  speakerProfiles: [] as any,
  speakers: [] as any,
  engines: [] as any,
  onRefresh: vi.fn(),
  onShowNotification: vi.fn(),
};

describe('GeneralSettingsPanel Developer Mode toggle', () => {
  beforeEach(() => {
    localStorage.clear();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }) as any;
  });

  afterEach(() => {
    localStorage.clear();
  });

  /** Walk up from the "Developer Mode" h3 to find the enclosing card button. */
  const getDevModeToggleBtn = (): HTMLButtonElement => {
    // The h3 "Developer Mode" lives inside a SettingCard.
    // Structure: card-div > left-div > (icon-div + text-div > h3) + button
    const h3 = screen.getByText('Developer Mode');
    // Walk up to the card's outermost div (which holds the flex row)
    // The card uses border: 1px solid var(--border), we can rely on the
    // hierarchy: h3 < div(text) < div(left-flex) < div(card-flex) > button
    const textDiv = h3.parentElement as HTMLElement;          // div wrapping h3+p
    const leftFlex = textDiv.parentElement as HTMLElement;    // div with icon+text
    const card = leftFlex.parentElement as HTMLElement;       // outer card div
    const btn = card.querySelector('button') as HTMLButtonElement;
    return btn;
  };

  it('Developer toggle is OFF by default and Developer nav entry is absent', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsRoute {...defaultProps} />
      </MemoryRouter>
    );

    expect(getDevModeToggleBtn().textContent).toBe('OFF');

    // Developer nav link should not be visible
    expect(screen.queryByRole('link', { name: /Developer/i })).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('clicking the Developer Mode toggle writes true to localStorage and reveals the Developer nav entry', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsRoute {...defaultProps} />
      </MemoryRouter>
    );

    fireEvent.click(getDevModeToggleBtn());

    // localStorage should now hold 'true'
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');

    // Developer nav link should now appear in the sidebar
    expect(screen.getByRole('link', { name: /Developer/i })).toBeTruthy();
  });

  it('toggling Developer Mode off again removes the Developer nav entry', () => {
    // Start with dev mode already on
    localStorage.setItem(STORAGE_KEY, 'true');

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsRoute {...defaultProps} />
      </MemoryRouter>
    );

    // Dev nav link is visible
    expect(screen.getByRole('link', { name: /Developer/i })).toBeTruthy();

    // The toggle shows ON; click to turn off
    const toggleBtn = getDevModeToggleBtn();
    expect(toggleBtn.textContent).toBe('ON');
    fireEvent.click(toggleBtn);

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.queryByRole('link', { name: /Developer/i })).toBeNull();
  });
});
