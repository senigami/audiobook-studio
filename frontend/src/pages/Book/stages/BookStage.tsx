import { BookInfoCard } from '@/pages/Book/components/BookInfoCard';
import { useBookDataContext } from '@/pages/Book/BookDataContext';

export function BookStage() {
  const { actions, project, chapters, totalRuntime, totalPredicted, hasRendered, hasUnrendered, availableAudiobooks } =
    useBookDataContext();

  if (!project) {
    return (
      <section className="book-stage" aria-label="Book">
        <div className="chapter-text-panel__empty">Book information is loading.</div>
      </section>
    );
  }

  return (
    <section className="book-stage" aria-label="Book">
      <BookInfoCard
        project={project}
        chapters={chapters}
        totalRuntime={totalRuntime}
        totalPredicted={totalPredicted}
        hasRendered={hasRendered}
        hasUnrendered={hasUnrendered}
        audiobooks={availableAudiobooks}
        onUpdateProject={actions.handleUpdateProject}
      />
    </section>
  );
}
