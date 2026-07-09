import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ContentsStage } from '@/pages/Book/stages/ContentsStage';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import { api } from '@/api';
import * as toast from '@/utils/toast';
import type { Chapter } from '@/types';

vi.mock('@/pages/Book/BookDataContext', () => ({
  useBookDataContext: vi.fn(),
}));

vi.mock('@/api', () => ({
  api: {
    updateChapter: vi.fn(),
    exportSample: vi.fn(),
  },
}));

vi.mock('@/pages/Book/components/ChapterTable', () => ({
  ChapterTable: (props: any) => (
    <section aria-label="Chapter table">
      <button type="button" onClick={() => props.onExportSample(props.chapters[0])}>
        Export sample
      </button>
    </section>
  ),
}));

vi.mock('@/pages/Book/components/ChapterTextPanel', () => ({
  ChapterTextPanel: () => <section aria-label="Chapter text panel" />,
}));

vi.mock('@/pages/Book/components/AddChapterModal', () => ({
  AddChapterModal: (props: any) =>
    props.isOpen ? (
      <button type="button" onClick={() => props.onSubmit('Title', 'Text', null)}>
        Submit chapter
      </button>
    ) : null,
}));

function makeChapter(id: string, audioStatus: Chapter['audio_status']): Chapter {
  return {
    id,
    project_id: 'book-1',
    title: `Chapter ${id}`,
    text_content: 'text',
    speaker_profile_name: null,
    sort_order: 0,
    audio_status: audioStatus,
    audio_file_path: audioStatus === 'done' ? `${id}.wav` : null,
    text_last_modified: null,
    audio_generated_at: null,
    char_count: 20,
    word_count: 4,
    sent_count: 1,
    predicted_audio_length: 3,
    audio_length_seconds: audioStatus === 'done' ? 3 : 0,
    total_segments_count: 1,
    done_segments_count: audioStatus === 'done' ? 1 : 0,
  };
}

function renderInRouter(ui: React.ReactElement, { bookId = 'book-1' } = {}) {
  return render(
    <MemoryRouter initialEntries={[`/book/${bookId}/contents`]}>
      <Routes>
        <Route path="/book/:bookId/contents" element={ui} />
        <Route path="/book/:bookId/publish" element={<div>Publish tab</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ContentsStage publish-readiness control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useBookDataContext).mockReturnValue({
      actions: {
        submitting: false,
        handleCreateChapter: vi.fn(),
        handleReorderChapters: vi.fn(),
        handleQueueChapter: vi.fn(),
        handleResetChapterAudio: vi.fn(),
        handleDeleteChapter: vi.fn(),
        handleQueueAllUnprocessed: vi.fn(),
      },
      chapters: [],
      jobs: {},
      projectVoiceStatus: { enabled: true },
      effectiveProjectVoice: 'Studio Voice',
      reload: vi.fn(),
    } as any);
  });

  it('shows the Publish CTA when all chapters are rendered', () => {
    vi.mocked(useBookDataContext).mockReturnValue({
      ...vi.mocked(useBookDataContext)(),
      chapters: [
        makeChapter('ch-1', 'done'),
        makeChapter('ch-2', 'done'),
        makeChapter('ch-3', 'done'),
      ],
    } as any);

    renderInRouter(<ContentsStage />);

    const cta = screen.getByRole('button', { name: /Book ready.*Publish/i });
    expect(cta).toBeInTheDocument();
    expect(screen.queryByText(/of \d+ chapters? rendered/)).not.toBeInTheDocument();
  });

  it('renders the import bar inline with the action buttons', () => {
    vi.mocked(useBookDataContext).mockReturnValue({
      ...vi.mocked(useBookDataContext)(),
      chapters: [
        makeChapter('ch-1', 'done'),
      ],
    } as any);

    renderInRouter(<ContentsStage />);

    const importBar = screen.getByRole('button', { name: 'Import manuscript, browse or drop files' });
    const focusButton = screen.getByRole('button', { name: 'Focus' });
    const cta = screen.getByRole('button', { name: /Book ready.*Publish/i });

    expect(importBar.compareDocumentPosition(focusButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(importBar.compareDocumentPosition(cta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('Publish CTA navigates to the book publish route', () => {
    vi.mocked(useBookDataContext).mockReturnValue({
      ...vi.mocked(useBookDataContext)(),
      chapters: [makeChapter('ch-1', 'done')],
    } as any);

    renderInRouter(<ContentsStage />, { bookId: 'book-42' });

    const cta = screen.getByRole('button', { name: /Book ready.*Publish/i });
    // Verify the link destination by clicking and checking the destination page renders
    act(() => { cta.click(); });
    expect(screen.getByText('Publish tab')).toBeInTheDocument();
  });

  it('shows partial progress text when some chapters are not rendered', () => {
    vi.mocked(useBookDataContext).mockReturnValue({
      ...vi.mocked(useBookDataContext)(),
      chapters: [
        makeChapter('ch-1', 'done'),
        makeChapter('ch-2', 'done'),
        makeChapter('ch-3', 'unprocessed'),
        makeChapter('ch-4', 'unprocessed'),
      ],
    } as any);

    renderInRouter(<ContentsStage />);

    expect(screen.getByText('2 of 4 chapters rendered')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Book ready.*Publish/i })).not.toBeInTheDocument();
  });

  it('shows nothing when there are no chapters', () => {
    // chapters: [] is the default from beforeEach
    renderInRouter(<ContentsStage />);

    expect(screen.queryByRole('button', { name: /Book ready.*Publish/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/of \d+ chapters? rendered/)).not.toBeInTheDocument();
  });

  it('uses singular "chapter" when only one chapter exists partially rendered', () => {
    vi.mocked(useBookDataContext).mockReturnValue({
      ...vi.mocked(useBookDataContext)(),
      chapters: [
        makeChapter('ch-1', 'unprocessed'),
      ],
    } as any);

    renderInRouter(<ContentsStage />);

    expect(screen.getByText('0 of 1 chapter rendered')).toBeInTheDocument();
  });

  it('imports multiple files in order with filename-derived titles', async () => {
    const handleCreateChapter = vi.fn().mockResolvedValue(true);
    vi.mocked(useBookDataContext).mockReturnValue({
      ...vi.mocked(useBookDataContext)(),
      actions: {
        ...vi.mocked(useBookDataContext)().actions,
        handleCreateChapter,
      },
      chapters: [makeChapter('ch-1', 'unprocessed')],
    } as any);

    const { container } = renderInRouter(<ContentsStage />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const first = new File(['chapter text'], 'First.txt', { type: 'text/plain' });
    const second = new File(['chapter text'], 'Second.txt', { type: 'text/plain' });

    fireEvent.change(input, { target: { files: [first, second] } });

    await waitFor(() => {
      expect(handleCreateChapter).toHaveBeenNthCalledWith(1, 'First', '', first, 1);
      expect(handleCreateChapter).toHaveBeenNthCalledWith(2, 'Second', '', second, 2);
    });
  });

  it('highlights the import dropzone while files are dragged over it', () => {
    renderInRouter(<ContentsStage />);

    const dropzone = screen.getByRole('button', { name: 'Import manuscript, browse or drop files' });
    const dataTransfer = { types: ['Files'], files: [new File(['chapter text'], 'chapter.txt', { type: 'text/plain' })] };

    fireEvent.dragEnter(dropzone, { dataTransfer });
    fireEvent.dragOver(dropzone, { dataTransfer });

    expect(dropzone.getAttribute('style')).toContain('border: 1px dashed var(--accent)');
    expect(dropzone.getAttribute('style')).toContain('background: var(--accent-glow)');
    expect(screen.getByText('Release to import')).toBeInTheDocument();

    fireEvent.dragLeave(dropzone, { dataTransfer });

    expect(dropzone.getAttribute('style')).toContain('border: 1px dashed var(--border)');
    expect(screen.getByText('Import manuscript')).toBeInTheDocument();
  });

  it('shows a toast when importing a file fails', async () => {
    const toastSpy = vi.spyOn(toast, 'emitToast').mockImplementation(() => undefined);
    const handleCreateChapter = vi.fn().mockResolvedValue(false);
    vi.mocked(useBookDataContext).mockReturnValue({
      ...vi.mocked(useBookDataContext)(),
      actions: {
        ...vi.mocked(useBookDataContext)().actions,
        handleCreateChapter,
      },
      chapters: [makeChapter('ch-1', 'unprocessed')],
    } as any);

    const { container } = renderInRouter(<ContentsStage />);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['chapter text'], 'Failing.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(handleCreateChapter).toHaveBeenCalled();
      expect(toastSpy).toHaveBeenCalledWith('Couldn\'t import "Failing.txt". Please try again.');
    });
  });

  it('shows a toast when exporting a sample fails', async () => {
    const toastSpy = vi.spyOn(toast, 'emitToast').mockImplementation(() => undefined);
    (api.exportSample as any).mockRejectedValue(new Error('network error'));
    vi.mocked(useBookDataContext).mockReturnValue({
      ...vi.mocked(useBookDataContext)(),
      chapters: [makeChapter('ch-1', 'done')],
    } as any);

    renderInRouter(<ContentsStage />);

    fireEvent.click(screen.getByRole('button', { name: 'Export sample' }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Couldn't export sample. Please try again.");
    });
  });

  it('shows a toast when exporting a sample returns no url', async () => {
    const toastSpy = vi.spyOn(toast, 'emitToast').mockImplementation(() => undefined);
    (api.exportSample as any).mockResolvedValue({ url: '' });
    vi.mocked(useBookDataContext).mockReturnValue({
      ...vi.mocked(useBookDataContext)(),
      chapters: [makeChapter('ch-1', 'done')],
    } as any);

    renderInRouter(<ContentsStage />);

    fireEvent.click(screen.getByRole('button', { name: 'Export sample' }));

    await waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith("Couldn't export sample. Please try again.");
    });
  });
});
