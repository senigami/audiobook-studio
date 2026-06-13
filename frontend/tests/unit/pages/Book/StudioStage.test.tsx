import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { StudioStage } from '@/pages/Book/stages/StudioStage';
import { useBookDataContext } from '@/pages/Book/BookDataContext';

vi.mock('@/pages/Book/BookDataContext', () => ({
  useBookDataContext: vi.fn(),
}));

vi.mock('@/pages/ChapterEditor/ChapterEditorPage', () => ({
  ChapterEditor: ({ chapterId, job, chapterJobs }: { chapterId: string; job?: { id: string }; chapterJobs: Array<{ id: string }> }) => (
    <div
      data-testid="chapter-editor"
      data-chapter-id={chapterId}
      data-job-id={job?.id || ''}
      data-chapter-jobs={chapterJobs.length}
    />
  ),
}));

const mockUseBookDataContext = vi.mocked(useBookDataContext);

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function buildChapter(id: string, audio_status = 'ready') {
  return {
    id,
    project_id: 'book-1',
    title: id,
    audio_status,
    has_wav: false,
    has_mp3: false,
    has_m4a: false,
    char_count: 100,
  };
}

describe('StudioStage', () => {
  it('mounts the chapter editor for the selected chapter and keeps chapter navigation on the book route', async () => {
    mockUseBookDataContext.mockReturnValue({
      bookId: 'book-1',
      chapters: [buildChapter('c1'), buildChapter('c2')],
      jobs: {
        active: {
          id: 'job-c2',
          engine: 'xtts',
          chapter_file: 'chapter-c2.txt',
          status: 'running',
          created_at: 200,
          safe_mode: false,
          make_mp3: false,
          progress: 0.5,
          warning_count: 0,
          project_id: 'book-1',
          chapter_id: 'c2',
          classification: 'chapter',
        } as never,
      },
      segmentProgress: {},
      project: null,
      characters: [],
      availableAudiobooks: [],
      loading: false,
      selectedVoice: 'voice-1',
      setSelectedVoice: vi.fn(),
      speakerProfiles: [],
      speakers: [],
      engines: [],
      mergedVoices: [],
      effectiveProjectVoice: 'voice-1',
      projectVoiceStatus: { enabled: true, message: '' },
      projectDefaultVoiceLabel: 'Default Speaker',
      totalRuntime: 0,
      totalPredicted: null,
      hasUnrendered: true,
      actions: {
        submitting: false,
        handleCreateChapter: vi.fn(),
        handleUpdateProject: vi.fn(),
        handleDeleteChapter: vi.fn(),
        handleReorderChapters: vi.fn(),
        handleQueueChapter: vi.fn(),
        handleResetChapterAudio: vi.fn(),
        handleQueueAllUnprocessed: vi.fn(),
        handleAssembleProject: vi.fn(),
        handleDeleteAudiobook: vi.fn(),
        handleSaveBackup: vi.fn(),
        handleDeleteBackup: vi.fn(),
        handleUpdateBackupMetadata: vi.fn(),
        handleUpdateAudiobookMetadata: vi.fn(),
        handleProjectVoiceChange: vi.fn(),
      },
      segmentUpdate: undefined,
      chapterUpdate: undefined,
      reload: vi.fn(),
    } as never);

    render(
      <MemoryRouter initialEntries={['/book/book-1/studio?chapter=c2']}>
        <Routes>
          <Route path="/book/:bookId/studio" element={<StudioStage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('chapter-editor')).toHaveAttribute('data-chapter-id', 'c2');
    });

    expect(screen.getByTestId('chapter-editor')).toHaveAttribute('data-job-id', 'job-c2');
    expect(screen.getByTestId('chapter-editor')).toHaveAttribute('data-chapter-jobs', '1');
    expect(screen.getByTestId('location')).toHaveTextContent('/book/book-1/studio?chapter=c2');
  });

  it('defaults to the first chapter when the query is empty', async () => {
    mockUseBookDataContext.mockReturnValue({
      bookId: 'book-1',
      chapters: [buildChapter('c1'), buildChapter('c2')],
      jobs: {},
      segmentProgress: {},
      project: null,
      characters: [],
      availableAudiobooks: [],
      loading: false,
      selectedVoice: 'voice-1',
      setSelectedVoice: vi.fn(),
      speakerProfiles: [],
      speakers: [],
      engines: [],
      mergedVoices: [],
      effectiveProjectVoice: 'voice-1',
      projectVoiceStatus: { enabled: true, message: '' },
      projectDefaultVoiceLabel: 'Default Speaker',
      totalRuntime: 0,
      totalPredicted: null,
      hasUnrendered: true,
      actions: {
        submitting: false,
        handleCreateChapter: vi.fn(),
        handleUpdateProject: vi.fn(),
        handleDeleteChapter: vi.fn(),
        handleReorderChapters: vi.fn(),
        handleQueueChapter: vi.fn(),
        handleResetChapterAudio: vi.fn(),
        handleQueueAllUnprocessed: vi.fn(),
        handleAssembleProject: vi.fn(),
        handleDeleteAudiobook: vi.fn(),
        handleSaveBackup: vi.fn(),
        handleDeleteBackup: vi.fn(),
        handleUpdateBackupMetadata: vi.fn(),
        handleUpdateAudiobookMetadata: vi.fn(),
        handleProjectVoiceChange: vi.fn(),
      },
      segmentUpdate: undefined,
      chapterUpdate: undefined,
      reload: vi.fn(),
    } as never);

    render(
      <MemoryRouter initialEntries={['/book/book-1/studio']}>
        <Routes>
          <Route path="/book/:bookId/studio" element={<StudioStage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('chapter-editor')).toHaveAttribute('data-chapter-id', 'c1');
    });
  });
});
