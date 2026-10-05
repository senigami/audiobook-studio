import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api';
import { OfficialRegistryPanel } from '@/pages/Engines/components/OfficialRegistryPanel';

vi.mock('@/api', () => ({
  api: {
    fetchOfficialPluginRegistry: vi.fn(),
  },
}));

describe('OfficialRegistryPanel', () => {
  const onInstallGithubUrl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads and renders official registry entries with install actions', async () => {
    vi.mocked(api.fetchOfficialPluginRegistry).mockResolvedValue([
      {
        id: 'tts_test',
        name: 'Test Plugin',
        summary: 'A plugin for testing',
        trust_level: 'official',
        repo_url: 'https://github.com/test/plugin.git',
        tags: ['local'],
        compatibility: ['macOS'],
        requirements: ['ffmpeg'],
      },
    ]);

    render(<OfficialRegistryPanel onInstallGithubUrl={onInstallGithubUrl} importing={false} />);

    expect(screen.getByRole('heading', { name: 'Plugin Registry' })).toBeInTheDocument();
    expect(await screen.findByText('Test Plugin')).toBeInTheDocument();
    expect(screen.getByText('A plugin for testing')).toBeInTheDocument();
    expect(screen.getByText('local')).toBeInTheDocument();
    expect(screen.getByText('macOS')).toBeInTheDocument();
    expect(screen.getByText((_content, element) => element?.textContent === 'Requires: ffmpeg')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Install Test Plugin' }));

    expect(onInstallGithubUrl).toHaveBeenCalledWith('https://github.com/test/plugin.git');
  });

  it('submits a pasted GitHub repository URL through the install callback', async () => {
    vi.mocked(api.fetchOfficialPluginRegistry).mockResolvedValue([]);

    render(<OfficialRegistryPanel onInstallGithubUrl={onInstallGithubUrl} importing={false} />);

    const input = await screen.findByPlaceholderText('https://github.com/owner/repo.git');
    fireEvent.change(input, { target: { value: 'https://github.com/custom/repo.git' } });
    fireEvent.click(screen.getByRole('button', { name: 'Install plugin from GitHub URL' }));

    expect(onInstallGithubUrl).toHaveBeenCalledWith('https://github.com/custom/repo.git');
  });

  it('shows a useful error when the registry request fails', async () => {
    vi.mocked(api.fetchOfficialPluginRegistry).mockRejectedValue(new Error('network down'));

    render(<OfficialRegistryPanel onInstallGithubUrl={onInstallGithubUrl} importing={false} />);

    expect(await screen.findByText('Failed to load official plugin registry.')).toBeInTheDocument();
  });

  it('disables install controls while an import is active', async () => {
    vi.mocked(api.fetchOfficialPluginRegistry).mockResolvedValue([
      {
        id: 'tts_test',
        name: 'Test Plugin',
        summary: 'A plugin for testing',
        trust_level: 'official',
        repo_url: 'https://github.com/test/plugin.git',
      },
    ]);

    render(<OfficialRegistryPanel onInstallGithubUrl={onInstallGithubUrl} importing />);

    await screen.findByText('Test Plugin');

    expect(screen.getByRole('button', { name: 'Install Test Plugin' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Install plugin from GitHub URL' })).toBeDisabled();
  });
});
