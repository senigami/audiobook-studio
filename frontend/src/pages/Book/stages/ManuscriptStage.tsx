import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/api';
import { ChapterImportBar } from '@/pages/Book/components/ChapterImportBar';
import { AddChapterModal } from '@/pages/Book/components/AddChapterModal';
import { ChapterTable } from '@/pages/Book/components/ChapterTable';
import { ChapterTextPanel } from '@/pages/Book/components/ChapterTextPanel';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import { emitToast } from '@/utils/toast';
import { downloadBlob } from '@/utils/chapterEditorHelpers';
import { requestRailAutoCollapse } from '@/utils/railState';
import { getChapterImportError, getChapterImportFileTitle, isSupportedChapterImportFile } from '@/pages/Book/lib/chapterImport';
import type { Chapter } from '@/types';

export function ManuscriptStage() {
  const {
    actions,
    chapters,
    jobs,
    projectVoiceStatus,
    effectiveProjectVoice,
    reload,
  } = useBookDataContext();
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(chapters[0]?.id ?? null);
  const [showAddChapterModal, setShowAddChapterModal] = useState(false);
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    if (!focusMode) return;
    return requestRailAutoCollapse();
  }, [focusMode]);

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
    const blob = await api.exportChapterVideo(chapter.id, { projectId: chapter.project_id });
    downloadBlob(blob, `${chapter.title || 'chapter'}-sample.mp4`);
  };

  const handleCreateChapter = async (title: string, text: string, file: File | null) => {
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
      await actions.handleCreateChapter(getChapterImportFileTitle(file), '', file, chapters.length + index);
    }
  };

  const selectedChapter = chapters.find((chapter) => chapter.id === effectiveSelectedChapterId) ?? chapters[0] ?? null;

  return (
    <section className="manuscript-stage" aria-label="Manuscript">
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
        <button
          type="button"
          className={focusMode ? 'btn-primary' : 'btn-ghost'}
          onClick={() => setFocusMode((current) => !current)}
        >
          {focusMode ? 'Exit focus' : 'Focus'}
        </button>
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

      <div className={focusMode ? 'manuscript-stage__workspace manuscript-stage__workspace--focus' : 'manuscript-stage__workspace'}>
        {!focusMode && (
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
          />

          <ChapterImportBar onImportFiles={handleImportFiles} submitting={actions.submitting} compact />
        </div>
        )}

        <ChapterTextPanel chapter={selectedChapter} onSaved={reload} />
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
