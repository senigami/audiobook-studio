import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssemblyChapterPicker } from '@/pages/Book/components/AssemblyChapterPicker';
import type { Chapter } from '@/types';

function makeChapter(overrides: Partial<Chapter>): Chapter {
  return {
    id: 'chapter-1',
    project_id: 'book-1',
    title: 'Chapter One',
    text_content: '',
    speaker_profile_name: null,
    sort_order: 1,
    audio_status: 'unprocessed',
    audio_file_path: null,
    text_last_modified: null,
    audio_generated_at: null,
    char_count: 0,
    word_count: 0,
    sent_count: 0,
    predicted_audio_length: 0,
    audio_length_seconds: 0,
    ...overrides,
  };
}

describe('AssemblyChapterPicker', () => {
  it('allows only rendered chapters and confirms the selected ids', () => {
    const onToggleChapter = vi.fn();
    const onSelectAllRendered = vi.fn();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const chapters = [
      makeChapter({ id: 'rendered', title: 'Rendered Chapter', audio_status: 'done', audio_length_seconds: 75 }),
      makeChapter({ id: 'draft', title: 'Draft Chapter', audio_status: 'unprocessed' }),
    ];

    render(
      <AssemblyChapterPicker
        chapters={chapters}
        selectedChapterIds={new Set(['rendered'])}
        onToggleChapter={onToggleChapter}
        onSelectAllRendered={onSelectAllRendered}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    const renderedCheckbox = screen.getAllByRole('checkbox')[0];
    const draftCheckbox = screen.getAllByRole('checkbox')[1];
    expect(renderedCheckbox).toBeChecked();
    expect(draftCheckbox).toBeDisabled();
    expect(screen.getByText('Rendered')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();

    fireEvent.click(renderedCheckbox);
    expect(onToggleChapter).toHaveBeenCalledWith('rendered');

    fireEvent.click(screen.getByRole('button', { name: /Select all rendered/i }));
    expect(onSelectAllRendered).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Assembly (1)' }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
