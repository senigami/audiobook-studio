import { Image as ImageIcon } from 'lucide-react';
import type { Project } from '@/types';

interface BookIdentityStripProps {
  project: Project;
}

export function BookIdentityStrip({ project }: BookIdentityStripProps) {
  return (
    <section className="book-identity-strip" aria-label="Book identity">
      <div className="book-identity-strip__cover">
        {project.cover_image_path ? (
          <img
            className="book-identity-strip__cover-image"
            src={project.cover_image_path}
            alt="Book cover"
          />
        ) : (
          <div className="book-identity-strip__cover-placeholder" aria-hidden="true">
            <ImageIcon size={16} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="book-identity-strip__text">
        <p className="book-identity-strip__title">{project.name}</p>
        {project.author && <p className="book-identity-strip__author">by {project.author}</p>}
      </div>
    </section>
  );
}
