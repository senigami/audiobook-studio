import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnnotationsPanel } from '@/pages/Book/stages/ReviewStage/AnnotationsPanel';
import { saveAnnotation, deleteAnnotation, getAnnotations } from '@/store/annotations';

describe('AnnotationsPanel', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders instructions if no active segment is selected', () => {
    render(
      <AnnotationsPanel
        chapterId="chapter-1"
        activeSegmentId={null}
        onSeekToSegment={vi.fn()}
      />
    );
    expect(screen.getByText(/Select a segment to add a note/i)).toBeInTheDocument();
  });

  it('renders a textarea to add/edit a note when activeSegmentId is provided', () => {
    render(
      <AnnotationsPanel
        chapterId="chapter-1"
        activeSegmentId="seg-1"
        onSeekToSegment={vi.fn()}
      />
    );
    expect(screen.getByPlaceholderText(/Add a note for the active segment/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Note/i })).toBeInTheDocument();
  });

  it('can save a note and display it in the list', () => {
    const { rerender } = render(
      <AnnotationsPanel
        chapterId="chapter-1"
        activeSegmentId="seg-1"
        onSeekToSegment={vi.fn()}
      />
    );

    const textarea = screen.getByPlaceholderText(/Add a note for the active segment/i);
    fireEvent.change(textarea, { target: { value: 'This is my segment note' } });

    const saveButton = screen.getByRole('button', { name: /Save Note/i });
    fireEvent.click(saveButton);

    // The note should show up in the list
    expect(screen.getByText('This is my segment note', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(/Segment: seg-1/i)).toBeInTheDocument();
  });

  it('calls onSeekToSegment when clicking on an annotation in the list', () => {
    saveAnnotation('chapter-1', 'seg-2', 'Playback target note');

    const seekMock = vi.fn();
    render(
      <AnnotationsPanel
        chapterId="chapter-1"
        activeSegmentId="seg-1"
        onSeekToSegment={seekMock}
      />
    );

    const annotationItem = screen.getByText('Playback target note');
    fireEvent.click(annotationItem);

    expect(seekMock).toHaveBeenCalledWith('seg-2');
  });

  it('deletes an annotation when clicking the delete button', () => {
    saveAnnotation('chapter-1', 'seg-3', 'Delete this note');

    render(
      <AnnotationsPanel
        chapterId="chapter-1"
        activeSegmentId="seg-1"
        onSeekToSegment={vi.fn()}
      />
    );

    expect(screen.getByText('Delete this note')).toBeInTheDocument();

    const deleteBtn = screen.getByRole('button', { name: /Delete/i });
    fireEvent.click(deleteBtn);

    expect(screen.queryByText('Delete this note')).not.toBeInTheDocument();
  });
});
