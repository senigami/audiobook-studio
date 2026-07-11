import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/api';
import { ChapterImportBar } from '@/pages/Book/components/ChapterImportBar';
import { AddChapterModal } from '@/pages/Book/components/AddChapterModal';
import { ChapterTable } from '@/pages/Book/components/ChapterTable';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import { setLastChapter } from '@/pages/Book/lib/stages';
import { emitToast } from '@/utils/toast';
import { getChapterImportError, getChapterImportFileTitle, isSupportedChapterImportFile } from '@/pages/Book/lib/chapterImport';
import type { Chapter } from '@/types';

function usePublishReadiness(chapters: Chapter[]) {
  return useMemo(() => {
    const total = chapters.length;
    const rendered = chapters.filter((ch) => ch.audio_status === 'done').length;
    const allReady = total > 0 && rendered === total;
    return { total, rendered, allReady };
  }, [chapters]);
}

export function ContentsStage() {
  const {
    actions,
    chapters,
    jobs,
    projectVoiceStatus,
    effectiveProjectVoice,
    reload,
  } = useBookDataContext();
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { total, rendered, allReady } = usePublishReadiness(chapters);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(chapters[0]?.id ?? null);
  const [showAddChapterModal, setShowAddChapterModal] = useState(false);

  const effectiveSelectedChapterId = useMemo(() => {
    if (selectedChapterId && chapters.some((chapter) => chapter.id === selectedChapterId)) {
      return selectedChapterId;
    }
    return chapters[0]?.id ?? null;
  }, [chapters, selectedChapterId]);

  const handleRenameChapter = async (chapterId: string, title: string) => {
    await api.updateChapter(chapterId, { title });
    await reload();
  };

  const handleExportSample = async (chapter: Chapter) => {
    try {
      const result = await api.exportSample(chapter.id, chapter.project_id);
      if (result.url) {
        window.open(result.url, '_blank');
      } else {
        emitToast("Couldn't export sample. Please try again.");
      }
    } catch (e) {
      console.error("Failed to export sample", e);
      emitToast("Couldn't export sample. Please try again.");
    }
  };

  const handleCreateChapter = async (title: string, text: string, file: File | null) => {
    // Failure already surfaces a toast from useProjectActions.handleCreateChapter itself.
    const created = await actions.handleCreateChapter(title, text, file, chapters.length);
    if (created) {
      setShowAddChapterModal(false);
    }
  };

  const handleImportFiles = async (files: FileList | File[] | null | undefined) => {
    const fileList = files ? Array.from(files) : [];
    if (fileList.length === 0) return;
    const validFiles = fileList.filter(isSupportedChapterImportFile);
    const invalidFiles = fileList.filter((file) => !isSupportedChapterImportFile(file));
    invalidFiles.forEach((file) => emitToast(getChapterImportError(file)));
    for (const [index, file] of validFiles.entries()) {
      const created = await actions.handleCreateChapter(getChapterImportFileTitle(file), '', file, chapters.length + index);
      if (!created) {
        emitToast(`Couldn't import "${file.name}". Please try again.`);
      }
    }
  };

  /** Open the Chapter Workspace for the given chapter. */
  const handleOpenChapter = (chapterId: string) => {
    if (!bookId) return;
    setLastChapter(bookId, chapterId);
    navigate(`/book/${bookId}/chapter/${chapterId}`);
  };

  return (
    <section className="manuscript-stage" aria-label="Contents">
      {!projectVoiceStatus.enabled && projectVoiceStatus.message && (
        <div className="manuscript-stage__engine-warning" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>Project Default Voice Engine Unavailable</strong>
            <span>{projectVoiceStatus.message}</span>
          </div>
        </div>
      )}

      <div className="manuscript-stage__actions">
        <ChapterImportBar onImportFiles={handleImportFiles} submitting={actions.submitting} compact />
        <button
          type="button"
          className="btn-ghost"
          onClick={() => void actions.handleQueueAllUnprocessed(chapters, jobs, effectiveProjectVoice)}
          disabled={actions.submitting || !projectVoiceStatus.enabled}
          title={!projectVoiceStatus.enabled ? 'All TTS engines are disabled in Settings' : 'Queue all unprocessed chapters'}
        >
          Queue Remaining
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={() => setShowAddChapterModal(true)}
          disabled={actions.submitting}
        >
          + New chapter
        </button>
      </div>

      {allReady ? (
        <button
          type="button"
          className="btn-primary manuscript-stage__publish-cta"
          onClick={() => navigate(`/book/${bookId}/publish`)}
          aria-label="Book ready — navigate to Publish tab"
        >
          Book ready &#8594; Publish
        </button>
      ) : total > 0 && (
        <p className="manuscript-stage__render-progress">
          {rendered} of {total} chapter{total !== 1 ? 's' : ''} rendered
        </p>
      )}

      <div className="manuscript-stage__table-column">
        <ChapterTable
          chapters={chapters}
          jobs={jobs}
          selectedChapterId={effectiveSelectedChapterId}
          onSelectChapter={setSelectedChapterId}
          onReorder={actions.handleReorderChapters}
          onRenameChapter={handleRenameChapter}
          onQueueChapter={(chapter) => void actions.handleQueueChapter(chapter.id)}
          onResetAudio={(chapterId) => void actions.handleResetChapterAudio(chapterId)}
          onDeleteChapter={(chapterId) => void actions.handleDeleteChapter(chapterId)}
          onExportSample={handleExportSample}
          anyEnginesEnabled={projectVoiceStatus.enabled}
          onOpenChapter={handleOpenChapter}
        />
      </div>

      <AddChapterModal
        isOpen={showAddChapterModal}
        onClose={() => setShowAddChapterModal(false)}
        onSubmit={(title, text, file) => void handleCreateChapter(title, text, file)}
        submitting={actions.submitting}
      />
    </section>
  );
}
