import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChapterEditor } from '@/pages/ChapterEditor/ChapterEditorPage';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import { selectChapterEditorJobs } from '@/pages/Book/lib/chapterJobs';

export function StudioStage() {
  const {
    bookId,
    chapters,
    jobs,
    speakerProfiles,
    speakers,
    engines,
    segmentProgress,
    selectedVoice,
    segmentUpdate,
    chapterUpdate,
  } = useBookDataContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const resolvedChapterId = searchParams.get('chapter') || chapters[0]?.id || null;
  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === resolvedChapterId) || null,
    [chapters, resolvedChapterId],
  );

  useEffect(() => {
    if (searchParams.get('chapter') || !chapters[0]?.id) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('chapter', chapters[0].id);
    setSearchParams(nextSearchParams, { replace: true });
  }, [chapters, searchParams, setSearchParams]);

  const activeChapterId = resolvedChapterId || chapters[0]?.id || null;
  const chapterIndex = activeChapterId ? chapters.findIndex((chapter) => chapter.id === activeChapterId) : -1;
  const { job, chapterJobs } = selectChapterEditorJobs({
    jobs,
    projectId: bookId,
    chapterId: activeChapterId,
    chapterAudioStatus: selectedChapter?.audio_status,
    chapterHasRenderedOutput: Boolean(selectedChapter?.has_wav || selectedChapter?.has_mp3 || selectedChapter?.has_m4a),
  });

  if (!activeChapterId) {
    return (
      <section className="book-stage-placeholder" data-testid="stage-studio" aria-labelledby="book-stage-studio">
        <h1 id="book-stage-studio">Studio</h1>
        <p>Loading chapter...</p>
      </section>
    );
  }

  return (
    <section className="book-stage-studio" data-testid="stage-studio" aria-label="Studio">
      <ChapterEditor
        chapterId={activeChapterId}
        projectId={bookId}
        speakerProfiles={speakerProfiles}
        speakers={speakers}
        engines={engines}
        job={job}
        chapterJobs={chapterJobs}
        segmentProgress={segmentProgress}
        selectedVoice={selectedVoice}
        onPrev={chapterIndex > 0 ? () => {
          const nextSearchParams = new URLSearchParams(searchParams);
          nextSearchParams.set('chapter', chapters[chapterIndex - 1].id);
          setSearchParams(nextSearchParams);
        } : undefined}
        onNext={chapterIndex >= 0 && chapterIndex < chapters.length - 1 ? () => {
          const nextSearchParams = new URLSearchParams(searchParams);
          nextSearchParams.set('chapter', chapters[chapterIndex + 1].id);
          setSearchParams(nextSearchParams);
        } : undefined}
        segmentUpdate={segmentUpdate}
        chapterUpdate={chapterUpdate}
      />
    </section>
  );
}
