import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnnotationsPanel } from '@/pages/ChapterEditor/components/DirectorsConsole/BoothTool/AnnotationsPanel';
import { saveAnnotation } from '@/store/annotations';

// Ported from frontend/tests/unit/pages/Book/stages/ReviewStage/AnnotationsPanel.test.tsx —
// AnnotationsPanel.tsx was relocated verbatim into BoothTool/ (see
// design-docs/plans/active/directors_console_activation/tasks/004-booth-tool.md);
// this file keeps its dedicated component-level coverage alive against the
// new location (task 007 deletes the old ReviewStage/ folder + its tests).
//
// Extended for the Booth-tab design-fixes pass:
// - the note-pinning fix (a note being typed must survive the playback-driven
//   activeSegmentId moving on, and must save against the segment the user
//   started noting, not whatever is active at save time)
// - ordinal display (no raw internal segment id ever renders)

const groupNumberBySegmentId = new Map<string, number>([
  ['seg-1', 1],
  ['seg-2', 2],
  ['seg-3', 3],
]);

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
        groupNumberBySegmentId={groupNumberBySegmentId}
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
        groupNumberBySegmentId={groupNumberBySegmentId}
      />
    );
    expect(screen.getByPlaceholderText(/Add a note for the active segment/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save Note/i })).toBeInTheDocument();
  });

  it('can save a note and display it in the list', () => {
    render(
      <AnnotationsPanel
        chapterId="chapter-1"
        activeSegmentId="seg-1"
        onSeekToSegment={vi.fn()}
        groupNumberBySegmentId={groupNumberBySegmentId}
      />
    );

    const textarea = screen.getByPlaceholderText(/Add a note for the active segment/i);
    fireEvent.change(textarea, { target: { value: 'This is my segment note' } });

    const saveButton = screen.getByRole('button', { name: /Save Note/i });
    fireEvent.click(saveButton);

    // The note should show up in the list, addressed by its human-readable
    // ordinal — never the raw engine segment id.
    expect(screen.getByText('This is my segment note', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(/Segment 1/i)).toBeInTheDocument();
  });

  it('calls onSeekToSegment when clicking on an annotation in the list', () => {
    saveAnnotation('chapter-1', 'seg-2', 'Playback target note');

    const seekMock = vi.fn();
    render(
      <AnnotationsPanel
        chapterId="chapter-1"
        activeSegmentId="seg-1"
        onSeekToSegment={seekMock}
        groupNumberBySegmentId={groupNumberBySegmentId}
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
        groupNumberBySegmentId={groupNumberBySegmentId}
      />
    );

    expect(screen.getByText('Delete this note')).toBeInTheDocument();

    const deleteBtn = screen.getByRole('button', { name: /Delete/i });
    fireEvent.click(deleteBtn);

    expect(screen.queryByText('Delete this note')).not.toBeInTheDocument();
  });

  it('never renders a raw internal segment id — only the human-readable ordinal', () => {
    saveAnnotation('chapter-1', 'seg-2', 'A note');

    const { container } = render(
      <AnnotationsPanel
        chapterId="chapter-1"
        activeSegmentId="seg-1"
        onSeekToSegment={vi.fn()}
        groupNumberBySegmentId={groupNumberBySegmentId}
      />
    );

    expect(screen.getByText(/Segment 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Active Segment/i)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/seg-1/);
    expect(container.textContent).not.toMatch(/seg-2/);
  });

  it('does NOT wipe the note being typed when activeSegmentId changes underneath it, and saves against the pinned segment', () => {
    const { rerender } = render(
      <AnnotationsPanel
        chapterId="chapter-1"
        activeSegmentId="seg-1"
        onSeekToSegment={vi.fn()}
        groupNumberBySegmentId={groupNumberBySegmentId}
      />
    );

    const textarea = screen.getByPlaceholderText(/Add a note for the active segment/i);

    // User focuses and starts typing on segment 1 (pins notingSegmentId).
    fireEvent.focus(textarea);
    fireEvent.change(textarea, { target: { value: 'Half-typed note about the villain' } });

    // Playback moves the karaoke playhead on to segment 2 mid-sentence.
    rerender(
      <AnnotationsPanel
        chapterId="chapter-1"
        activeSegmentId="seg-2"
        onSeekToSegment={vi.fn()}
        groupNumberBySegmentId={groupNumberBySegmentId}
      />
    );

    // The textarea must still hold what the user typed — not cleared, not
    // replaced by segment 2's (empty) note.
    expect(
      screen.getByPlaceholderText(/Add a note for the active segment/i)
    ).toHaveValue('Half-typed note about the villain');

    // The panel must show which segment is being noted — the pinned one
    // (segment 1), not the now-active segment 2.
    expect(screen.getByText(/Note for segment/i)).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();

    // Continue typing, then save — must persist against segment 1 (the
    // pinned target), not segment 2 (active at save time).
    fireEvent.change(screen.getByPlaceholderText(/Add a note for the active segment/i), {
      target: { value: 'Half-typed note about the villain, finished.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Note/i }));

    expect(screen.getByText('Half-typed note about the villain, finished.', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(/Segment 1/i)).toBeInTheDocument();
  });

  it('releases the pin on blur when the note is empty', () => {
    const { rerender } = render(
      <AnnotationsPanel
        chapterId="chapter-1"
        activeSegmentId="seg-1"
        onSeekToSegment={vi.fn()}
        groupNumberBySegmentId={groupNumberBySegmentId}
      />
    );

    const textarea = screen.getByPlaceholderText(/Add a note for the active segment/i);
    fireEvent.focus(textarea);
    expect(screen.getByText(/Note for segment/i)).toBeInTheDocument();

    // Blur with no text typed — pin releases.
    fireEvent.blur(textarea);

    rerender(
      <AnnotationsPanel
        chapterId="chapter-1"
        activeSegmentId="seg-2"
        onSeekToSegment={vi.fn()}
        groupNumberBySegmentId={groupNumberBySegmentId}
      />
    );

    // No longer pinned — label should reflect the (now active) segment 2 again.
    expect(screen.getByText(/Active Segment/i)).toBeInTheDocument();
  });
});
