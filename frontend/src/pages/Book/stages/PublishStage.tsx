import { Download } from 'lucide-react';
import { BookInfoCard } from '@/pages/Book/components/BookInfoCard';
import { useBookDataContext } from '@/pages/Book/BookDataContext';

export function PublishStage() {
  const {
    actions,
    availableAudiobooks,
    project,
    totalPredicted,
    totalRuntime,
  } = useBookDataContext();

  if (!project) {
    return (
      <section className="publish-stage" aria-label="Publish">
        <div className="chapter-text-panel__empty">Book information is loading.</div>
      </section>
    );
  }

  return (
    <section className="publish-stage" aria-label="Publish">
      <BookInfoCard
        project={project}
        totalRuntime={totalRuntime}
        totalPredicted={totalPredicted}
        onUpdateProject={actions.handleUpdateProject}
      />

      <section className="publish-stage__exports" aria-label="Export actions">
        <div>
          <h2>Exports</h2>
          <p>Assemblies and backups move into this stage in the next R2 task.</p>
        </div>

        {availableAudiobooks.length > 0 ? (
          <div className="publish-stage__export-list">
            {availableAudiobooks.map((audiobook) => (
              <a
                key={audiobook.filename}
                href={audiobook.url || '#'}
                download={audiobook.download_filename || audiobook.filename}
                className={audiobook.url ? 'btn-ghost' : 'btn-ghost is-disabled'}
                aria-disabled={!audiobook.url}
              >
                <Download size={16} aria-hidden="true" />
                {audiobook.title || audiobook.filename}
              </a>
            ))}
          </div>
        ) : (
          <span className="publish-stage__empty-export">No assembled audiobooks yet.</span>
        )}
      </section>
    </section>
  );
}
