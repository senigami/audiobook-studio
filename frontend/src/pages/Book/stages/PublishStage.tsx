import { useMemo, useState } from 'react';
import { AssemblyChapterPicker } from '@/pages/Book/components/AssemblyChapterPicker';
import { BookIdentityStrip } from '@/pages/Book/components/BookIdentityStrip';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import { AssemblyPanel } from '@/pages/ProjectDetail/components/AssemblyPanel';
import { AssemblyProgress } from '@/pages/ProjectDetail/components/AssemblyProgress';
import { deriveChapterLifecycle } from '@/pages/Book/lib/chapterLifecycle';
import { formatFileSize, formatLength, formatRelativeTime } from '@/utils/format';
import { pickRelevantJob } from '@/utils/jobSelection';

export function PublishStage() {
  const {
    actions,
    availableAudiobooks,
    chapters,
    jobs,
    project,
  } = useBookDataContext();
  const [isAssemblyMode, setIsAssemblyMode] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());

  const assemblyJobs = useMemo(
    () => Object.values(jobs).filter((job) => job.engine === 'audiobook' && job.project_id === project?.id),
    [jobs, project?.id],
  );
  const activeAssemblyJob = useMemo(
    () => pickRelevantJob(assemblyJobs, false),
    [assemblyJobs],
  );
  const finishedAssemblyJob = useMemo(
    () => pickRelevantJob(assemblyJobs, true),
    [assemblyJobs],
  );

  const renderedChapterIds = useMemo(
    () => chapters
      .filter((chapter) => deriveChapterLifecycle(chapter) === 'Rendered')
      .map((chapter) => chapter.id),
    [chapters],
  );

  const startAssemblySelection = () => {
    setSelectedChapterIds(new Set(renderedChapterIds));
    setIsAssemblyMode(true);
  };

  const toggleChapter = (chapterId: string) => {
    if (!renderedChapterIds.includes(chapterId)) return;
    setSelectedChapterIds((current) => {
      const next = new Set(current);
      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }
      return next;
    });
  };

  const toggleAllRendered = () => {
    setSelectedChapterIds((current) => (
      current.size === renderedChapterIds.length ? new Set() : new Set(renderedChapterIds)
    ));
  };

  const confirmAssembly = () => {
    void actions.handleAssembleProject(Array.from(selectedChapterIds));
    setIsAssemblyMode(false);
  };

  if (!project) {
    return (
      <section className="publish-stage" aria-label="Publish">
        <div className="chapter-text-panel__empty">Book information is loading.</div>
      </section>
    );
  }

  return (
    <section className="publish-stage" aria-label="Publish">
      <div className="publish-stage__primary">
        <AssemblyProgress
          project={project}
          activeAssemblyJob={activeAssemblyJob}
          finishedAssemblyJob={finishedAssemblyJob}
        />

        {isAssemblyMode ? (
          <AssemblyChapterPicker
            chapters={chapters}
            selectedChapterIds={selectedChapterIds}
            submitting={actions.submitting}
            onToggleChapter={toggleChapter}
            onSelectAllRendered={toggleAllRendered}
            onCancel={() => setIsAssemblyMode(false)}
            onConfirm={confirmAssembly}
          />
        ) : (
          <AssemblyPanel
            availableAudiobooks={availableAudiobooks}
            onStartAssembly={startAssemblySelection}
            onDeleteAudiobook={actions.handleDeleteAudiobook}
            onUpdateMetadata={actions.handleUpdateAudiobookMetadata}
            formatLength={formatLength}
            formatFileSize={formatFileSize}
            formatRelativeTime={formatRelativeTime}
          />
        )}
      </div>

      <aside className="publish-stage__sidebar">
        <BookIdentityStrip project={project} />
      </aside>
    </section>
  );
}
