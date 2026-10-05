import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api';
import { BackupsStage } from '@/pages/Book/stages/BackupsStage';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import type { Project } from '@/types';

vi.mock('@/api', () => ({
  api: {
    fetchProjectBackups: vi.fn(),
  },
}));

vi.mock('@/pages/Book/BookDataContext', () => ({
  useBookDataContext: vi.fn(),
}));

const project: Project = {
  id: 'book-1',
  name: 'Book One',
  series: 'Series One',
  series_position: null,
  author: 'Author One',
  speaker_profile_name: null,
  cover_image_path: null,
  created_at: 1_700_000_000,
  updated_at: 1_700_000_000,
};

describe('BackupsStage', () => {
  const handleSaveBackup = vi.fn().mockResolvedValue(true);
  const handleDeleteBackup = vi.fn().mockResolvedValue(true);
  const handleUpdateBackupMetadata = vi.fn().mockResolvedValue(true);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchProjectBackups).mockResolvedValue([]);
    vi.mocked(useBookDataContext).mockReturnValue({
      actions: {
        handleSaveBackup,
        handleDeleteBackup,
        handleUpdateBackupMetadata,
        submitting: false,
      },
      project,
    } as any);
  });

  it('mounts the real backups panel scoped to the current project, not the Phase-2 stub', async () => {
    render(<BackupsStage />);

    expect(screen.getByRole('region', { name: 'Backups' })).toBeInTheDocument();
    expect(screen.getByText('Project Backups')).toBeInTheDocument();
    expect(screen.queryByText(/coming in Phase 2/i)).not.toBeInTheDocument();
    expect(api.fetchProjectBackups).toHaveBeenCalledWith('book-1');
  });
});
