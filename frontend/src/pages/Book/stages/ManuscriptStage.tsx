import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/api';
import { AddChapterModal } from '@/pages/Book/components/AddChapterModal';
import { ChapterTable } from '@/pages/Book/components/ChapterTable';
import { ChapterTextPanel } from '@/pages/Book/components/ChapterTextPanel';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import { emitToast } from '@/utils/toast';
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
  const importInputRef = useRef<HTMLInputElement>(null);

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
    const result = await api.exportSample(chapter.id, chapter.project_id);
    if (result.url) {
      window.open(result.url, '_blank');
    }
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
    if (importInputRef.current) {
      importInputRef.current.value = '';
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

          <div className="manuscript-stage__import-row">
            <div>
              <strong>Import manuscript file</strong>
              <span>.txt only</span>
            </div>
            <input
              ref={importInputRef}
              type="file"
              multiple
              accept=".txt"
              className="sr-only"
              aria-label="Import manuscript file"
              onChange={(event) => void handleImportFiles(event.target.files)}
            />
            <button
              type="button"
              className="btn-ghost"
              onClick={() => importInputRef.current?.click()}
              disabled={actions.submitting}
            >
              Choose file
            </button>
            <div
              role="button"
              tabIndex={0}
              aria-label="Drop manuscript files"
              onDragOver={(event) => { event.preventDefault(); }}
              onDrop={(event) => { event.preventDefault(); void handleImportFiles(event.dataTransfer.files); }}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') importInputRef.current?.click(); }}
              style={{ cursor: 'pointer' }}
            >
              Drop files here
            </div>
          </div>
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
