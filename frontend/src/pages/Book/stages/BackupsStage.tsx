import { useBookDataContext } from '@/pages/Book/BookDataContext';
import { ProjectBackupsPanel } from '@/components/ProjectBackupsPanel';

export function BackupsStage() {
  const { actions, project } = useBookDataContext();

  if (!project) {
    return (
      <section className="backups-stage" aria-label="Backups">
        <div className="chapter-text-panel__empty">Book information is loading.</div>
      </section>
    );
  }

  return (
    <section className="backups-stage" aria-label="Backups">
      <ProjectBackupsPanel
        projectId={project.id}
        onSaveBackup={actions.handleSaveBackup}
        onDeleteBackup={actions.handleDeleteBackup}
        onUpdateMetadata={actions.handleUpdateBackupMetadata}
        submitting={actions.submitting}
      />
    </section>
  );
}
