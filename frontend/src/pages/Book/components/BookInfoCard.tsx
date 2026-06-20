import { useRef, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { InlineEdit } from '@/components/forms/InlineEdit';
import { CoverImageModal } from '@/pages/ProjectDetail/components/ProjectModals';
import { formatLength } from '@/utils/format';
import type { Project } from '@/types';

interface BookInfoCardProps {
  project: Project;
  totalRuntime: number;
  totalPredicted: number | null;
  onUpdateProject: (data: { name: string; series: string; author: string; cover?: File | null }) => Promise<boolean>;
}

export function BookInfoCard({ project, totalRuntime, totalPredicted, onUpdateProject }: BookInfoCardProps) {
  const [showCover, setShowCover] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const updateField = (field: 'name' | 'series' | 'author', value: string) => {
    void onUpdateProject({
      name: field === 'name' ? value : project.name,
      series: field === 'series' ? value : project.series || '',
      author: field === 'author' ? value : project.author || '',
    });
  };

  const handleCoverChange = (file: File | undefined) => {
    if (!file) return;
    void onUpdateProject({
      name: project.name,
      series: project.series || '',
      author: project.author || '',
      cover: file,
    });
    if (coverInputRef.current) {
      coverInputRef.current.value = '';
    }
  };

  return (
    <section className="book-info-card" aria-label="Book info">
      <div className="book-info-card__cover">
        <button
          type="button"
          className="book-info-card__cover-button"
          onClick={() => project.cover_image_path && setShowCover(true)}
          aria-label="View cover"
          disabled={!project.cover_image_path}
        >
          {project.cover_image_path ? (
            <img src={project.cover_image_path} alt="Book cover" />
          ) : (
            <ImageIcon size={32} aria-hidden="true" />
          )}
        </button>
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label="Change cover file"
          onChange={(event) => handleCoverChange(event.target.files?.[0])}
        />
        <button type="button" className="btn-ghost" onClick={() => coverInputRef.current?.click()}>
          Change cover
        </button>
      </div>

      <div className="book-info-card__fields">
        <div className="book-info-card__field">
          <span>Title</span>
          <InlineEdit value={project.name} onSave={(value) => updateField('name', value)} />
        </div>
        <div className="book-info-card__field">
          <span>Author</span>
          <InlineEdit value={project.author || ''} placeholder="Add author" onSave={(value) => updateField('author', value)} />
        </div>
        <div className="book-info-card__field">
          <span>Series</span>
          <InlineEdit value={project.series || ''} placeholder="Standalone" onSave={(value) => updateField('series', value)} />
        </div>

        <div className="book-info-card__chips">
          <span>Runtime {formatLength(totalRuntime)}</span>
          {totalPredicted !== null && <span>Predicted {formatLength(totalPredicted)}</span>}
          <span>Created {new Date(project.created_at * 1000).toLocaleDateString()}</span>
        </div>
      </div>

      <CoverImageModal
        isOpen={showCover}
        onClose={() => setShowCover(false)}
        imagePath={project.cover_image_path || ''}
      />
    </section>
  );
}
