import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManuscriptStage } from '@/pages/Book/stages/ManuscriptStage';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import type { Chapter } from '@/types';

vi.mock('@/pages/Book/BookDataContext', () => ({
  useBookDataContext: vi.fn(),
}));

vi.mock('@/pages/Book/components/ChapterTable', () => ({
  ChapterTable: () => <section aria-label="Manuscript chapters" />,
}));

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return {
    ...actual,
    motion: {
      ...actual.motion,
      div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
  };
});

const chapter: Chapter = {
  id: 'chapter-1',
  project_id: 'book-1',
  title: 'Chapter 1',
  text_content: 'Text',
  speaker_profile_name: null,
  sort_order: 0,
  audio_status: 'unprocessed',
  audio_file_path: null,
  text_last_modified: null,
  audio_generated_at: null,
  char_count: 20,
  word_count: 4,
  sent_count: 1,
  predicted_audio_length: 3,
  audio_length_seconds: 0,
  total_segments_count: 1,
  done_segments_count: 0,
};

describe('ManuscriptStage', () => {
  const handleCreateChapter = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useBookDataContext).mockReturnValue({
      actions: {
        submitting: false,
        handleCreateChapter,
        handleReorderChapters: vi.fn(),
        handleQueueChapter: vi.fn(),
        handleResetChapterAudio: vi.fn(),
        handleDeleteChapter: vi.fn(),
      },
      chapters: [chapter],
      jobs: {},
      projectVoiceStatus: { enabled: true },
      reload: vi.fn(),
    } as any);
  });

  it('submits new chapters through the existing project action and closes the modal', async () => {
    handleCreateChapter.mockResolvedValue(true);

    render(<ManuscriptStage />);

    fireEvent.click(screen.getByRole('button', { name: '+ New chapter' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Chapter 1'), { target: { value: 'New Chapter' } });
    fireEvent.change(screen.getByPlaceholderText('Paste your chapter text here...'), { target: { value: 'New text' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add Chapter' }));

    await waitFor(() => {
      expect(handleCreateChapter).toHaveBeenCalledWith('New Chapter', 'New text', null, 1);
    });
    expect(screen.queryByText('Add New Chapter')).not.toBeInTheDocument();
  });

  it('imports a file-only chapter with a filename-derived title', async () => {
    handleCreateChapter.mockResolvedValue(true);

    render(<ManuscriptStage />);

    const file = new File(['chapter text'], 'Imported Chapter.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fireEvent.change(screen.getByLabelText('Import manuscript file'), { target: { files: [file] } });

    await waitFor(() => {
      expect(handleCreateChapter).toHaveBeenCalledWith('Imported Chapter', '', file, 1);
    });
  });
});
