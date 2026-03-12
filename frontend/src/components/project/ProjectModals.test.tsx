import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AddChapterModal, EditProjectModal, CoverImageModal } from './ProjectModals';
import type { Project } from '../../types';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

describe('ProjectModals', () => {
  const mockProject: Project = {
    id: 'proj1',
    name: 'Test Project',
    series: 'Test Series',
    author: 'Test Author',
    created_at: 123456789,
    updated_at: 123456789,
  };

  describe('AddChapterModal', () => {
    it('renders when open', () => {
      render(
        <AddChapterModal 
          isOpen={true} 
          onClose={vi.fn()} 
          onSubmit={vi.fn()} 
          submitting={false} 
        />
      );
      expect(screen.getByText('Add New Chapter')).toBeInTheDocument();
    });

    it('calls onSubmit with title and text', () => {
      const onSubmit = vi.fn();
      render(
        <AddChapterModal 
          isOpen={true} 
          onClose={vi.fn()} 
          onSubmit={onSubmit} 
          submitting={false} 
        />
      );

      fireEvent.change(screen.getByPlaceholderText('e.g. Chapter 1'), { target: { value: 'New Chapter' } });
      fireEvent.change(screen.getByPlaceholderText('Paste your chapter text here...'), { target: { value: 'Some text' } });
      fireEvent.click(screen.getByText('Add Chapter'));

      expect(onSubmit).toHaveBeenCalledWith('New Chapter', 'Some text', null);
    });

    it('handles file upload and clearing', () => {
      const onSubmit = vi.fn();
      const { container } = render(
        <AddChapterModal 
          isOpen={true} 
          onClose={vi.fn()} 
          onSubmit={onSubmit} 
          submitting={false} 
        />
      );

      const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      
      fireEvent.change(input, { target: { files: [file] } });
      expect(screen.getByText('hello.txt')).toBeInTheDocument();
      
      // Clearing file
      fireEvent.click(screen.getByRole('button', { name: '' })); // The Trash2 button
      expect(screen.queryByText('hello.txt')).not.toBeInTheDocument();
    });
  });

  describe('EditProjectModal', () => {
    it('renders with project data', () => {
      render(
        <EditProjectModal 
          isOpen={true} 
          onClose={vi.fn()} 
          project={mockProject} 
          onSubmit={vi.fn()} 
          submitting={false} 
        />
      );
      expect(screen.getByDisplayValue('Test Project')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Test Series')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Test Author')).toBeInTheDocument();
    });

    it('handles cover image selection and preview', async () => {
      const { container } = render(
        <EditProjectModal 
          isOpen={true} 
          onClose={vi.fn()} 
          project={mockProject} 
          onSubmit={vi.fn()} 
          submitting={false} 
        />
      );

      const file = new File(['(⌐□_□)'], 'chucknorris.png', { type: 'image/png' });
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      
      // Mock FileReader
      const readAsDataURLSpy = vi.spyOn(FileReader.prototype, 'readAsDataURL');
      
      fireEvent.change(input, { target: { files: [file] } });
      
      expect(readAsDataURLSpy).toHaveBeenCalledWith(file);
      
      // Wait for preview image to appear
      await waitFor(() => {
        expect(screen.getByAltText('Preview')).toBeInTheDocument();
      });

      // Clear cover
      fireEvent.click(screen.getByRole('button', { name: '' })); // The Trash2 button
      expect(screen.queryByAltText('Preview')).not.toBeInTheDocument();
    });

    it('handles drag and drop for cover image', () => {
      render(
        <EditProjectModal 
          isOpen={true} 
          onClose={vi.fn()} 
          project={mockProject} 
          onSubmit={vi.fn()} 
          submitting={false} 
        />
      );

      const dropzone = screen.getByText('New Cover').closest('div') as HTMLElement;
      const file = new File(['(⌐□_□)'], 'cover.png', { type: 'image/png' });
      
      fireEvent.dragOver(dropzone);
      expect(screen.getByText('Drop')).toBeInTheDocument();
      
      fireEvent.drop(dropzone, {
        dataTransfer: {
          files: [file]
        }
      });
      
      expect(screen.queryByText('Drop')).not.toBeInTheDocument();
    });
  });

  describe('CoverImageModal', () => {
    it('renders image and handles close', () => {
      const onClose = vi.fn();
      render(
        <CoverImageModal 
          isOpen={true} 
          onClose={onClose} 
          imagePath="/path/to/cover.jpg" 
        />
      );

      const img = screen.getByAltText('Cover');
      expect(img).toHaveAttribute('src', '/path/to/cover.jpg');
      
      // Clicking the overlay closes
      fireEvent.click(screen.getByAltText('Cover').parentElement as HTMLElement);
      expect(onClose).toHaveBeenCalled();
      
      // Clicking the image itself does NOT close (stopPropagation)
      onClose.mockClear();
      fireEvent.click(img);
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
