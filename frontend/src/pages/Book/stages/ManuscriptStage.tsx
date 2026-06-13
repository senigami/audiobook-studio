import { useMemo, useState } from 'react';
import { api } from '@/api';
import { ChapterTable } from '@/pages/Book/components/ChapterTable';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import type { Chapter } from '@/types';

export function ManuscriptStage() {
  const {
    actions,
    chapters,
    jobs,
    projectVoiceStatus,
    reload,
  } = useBookDataContext();
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(chapters[0]?.id ?? null);

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

  return (
    <section className="manuscript-stage" aria-label="Manuscript">
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
    </section>
  );
}
