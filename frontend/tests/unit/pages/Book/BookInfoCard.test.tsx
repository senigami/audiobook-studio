import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BookInfoCard } from '@/pages/Book/components/BookInfoCard';
import type { Project } from '@/types';

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const project: Project = {
  id: 'book-1',
  name: 'Book One',
  series: 'Series One',
  series_position: null,
  author: 'Author One',
  speaker_profile_name: null,
  cover_image_path: '/cover.png',
  created_at: 1_700_000_000,
  updated_at: 1_700_000_000,
};

describe('BookInfoCard', () => {
  it('renders project fields and commits inline metadata edits', () => {
    const onUpdateProject = vi.fn().mockResolvedValue(true);

    render(
      <BookInfoCard
        project={project}
        totalRuntime={120}
        totalPredicted={240}
        onUpdateProject={onUpdateProject}
      />,
    );

    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Author One')).toBeInTheDocument();
    expect(screen.getByText('Runtime 2m 0s')).toBeInTheDocument();
    expect(screen.getByText('Predicted 4m 0s')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Book One'));
    const titleInput = screen.getByDisplayValue('Book One');
    fireEvent.change(titleInput, { target: { value: 'Updated Book' } });
    fireEvent.keyDown(titleInput, { key: 'Enter' });

    expect(onUpdateProject).toHaveBeenCalledWith({
      name: 'Updated Book',
      series: 'Series One',
      author: 'Author One',
    });
  });

  it('sends cover changes through the same update handler', () => {
    const onUpdateProject = vi.fn().mockResolvedValue(true);

    render(
      <BookInfoCard
        project={project}
        totalRuntime={0}
        totalPredicted={null}
        onUpdateProject={onUpdateProject}
      />,
    );

    const file = new File(['cover'], 'cover.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Change cover file'), { target: { files: [file] } });

    expect(onUpdateProject).toHaveBeenCalledWith({
      name: 'Book One',
      series: 'Series One',
      author: 'Author One',
      cover: file,
    });
  });

  it('highlights the cover tile while dragging an image file over it', () => {
    const onUpdateProject = vi.fn().mockResolvedValue(true);

    render(
      <BookInfoCard
        project={project}
        totalRuntime={0}
        totalPredicted={null}
        onUpdateProject={onUpdateProject}
      />,
    );

    const coverTile = screen.getByRole('button', { name: 'View cover' });
    const file = new File(['cover'], 'cover.png', { type: 'image/png' });
    const dataTransfer = { types: ['Files'], files: [file] };

    fireEvent.dragEnter(coverTile, { dataTransfer });
    fireEvent.dragOver(coverTile, { dataTransfer });

    expect(screen.getByAltText('Book cover')).toHaveStyle({ opacity: '0.35' });
    expect(coverTile).toHaveClass('book-info-card__cover-button--dragging');

    fireEvent.drop(coverTile, { dataTransfer });

    expect(onUpdateProject).toHaveBeenCalledWith({
      name: 'Book One',
      series: 'Series One',
      author: 'Author One',
      cover: file,
    });
  });
});
