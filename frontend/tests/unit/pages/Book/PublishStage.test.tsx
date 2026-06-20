import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api';
import { PublishStage } from '@/pages/Book/stages/PublishStage';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import type { Audiobook, Chapter, Job, Project } from '@/types';

vi.mock('@/api', () => ({
  api: {
    fetchProjectBackups: vi.fn(),
  },
}));

vi.mock('@/pages/Book/BookDataContext', () => ({
  useBookDataContext: vi.fn(),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const project: Project = {
  id: 'book-1',
  name: 'Book One',
  series: 'Series One',
  author: 'Author One',
  speaker_profile_name: null,
  cover_image_path: null,
  created_at: 1_700_000_000,
  updated_at: 1_700_000_000,
};

function makeChapter(overrides: Partial<Chapter>): Chapter {
  return {
    id: 'chapter-1',
    project_id: 'book-1',
    title: 'Chapter One',
    text_content: '',
    speaker_profile_name: null,
    sort_order: 1,
    audio_status: 'unprocessed',
    audio_file_path: null,
    text_last_modified: null,
    audio_generated_at: null,
    char_count: 0,
    word_count: 0,
    sent_count: 0,
    predicted_audio_length: 0,
    audio_length_seconds: 0,
    ...overrides,
  };
}

const audiobook: Audiobook = {
  filename: 'book-one.mp3',
  title: 'Book One Assembly',
  cover_url: null,
  url: '/downloads/book-one.mp3',
  created_at: 1_700_000_000,
  duration_seconds: 120,
  size_bytes: 2048,
  description: 'Final pass',
};

const assemblyJob: Job = {
  id: 'assembly-job',
  engine: 'audiobook',
  chapter_file: '',
  status: 'running',
  created_at: 1,
  project_id: 'book-1',
  safe_mode: false,
  make_mp3: true,
  progress: 0.4,
  warning_count: 0,
};

describe('PublishStage', () => {
  const handleAssembleProject = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchProjectBackups).mockResolvedValue([]);
    vi.mocked(useBookDataContext).mockReturnValue({
      actions: {
        handleAssembleProject,
        handleDeleteAudiobook: vi.fn(),
        handleUpdateAudiobookMetadata: vi.fn().mockResolvedValue(true),
        handleSaveBackup: vi.fn().mockResolvedValue(true),
        handleDeleteBackup: vi.fn().mockResolvedValue(true),
        handleUpdateBackupMetadata: vi.fn().mockResolvedValue(true),
        handleUpdateProject: vi.fn().mockResolvedValue(true),
        submitting: false,
      },
      availableAudiobooks: [audiobook],
      chapters: [
        makeChapter({ id: 'rendered', title: 'Rendered Chapter', audio_status: 'done' }),
        makeChapter({ id: 'draft', title: 'Draft Chapter', audio_status: 'unprocessed' }),
      ],
      jobs: { [assemblyJob.id]: assemblyJob },
      project,
      totalPredicted: 180,
      totalRuntime: 120,
    } as any);
  });

  it('mounts assemblies, progress, backups, and book info in Publish', async () => {
    render(<PublishStage />);

    expect(screen.getByRole('region', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('Assembling Book One'))).toBeInTheDocument();
    expect(screen.getByText('Project Assemblies')).toBeInTheDocument();
    expect(screen.getByText('Book One Assembly')).toBeInTheDocument();
    expect(screen.getByText('Project Backups')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Book info' })).toBeInTheDocument();
  });

  it('switches AssemblyPanel into rendered-only selection mode and confirms selected chapters', () => {
    render(<PublishStage />);

    fireEvent.click(screen.getByRole('button', { name: /Assemble Project/i }));

    const picker = screen.getByRole('region', { name: 'Assembly chapter selection' });
    const checkboxes = within(picker).getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeDisabled();

    fireEvent.click(within(picker).getByRole('button', { name: 'Confirm Assembly (1)' }));

    expect(handleAssembleProject).toHaveBeenCalledWith(['rendered']);
  });
});
