import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChapterTable } from '@/pages/Book/components/ChapterTable';
import type { Chapter } from '@/types';

const chapters: Chapter[] = [
  {
    id: 'chapter-b',
    project_id: 'book-1',
    title: 'Beta',
    text_content: 'Beta text',
    speaker_profile_name: null,
    sort_order: 1,
    audio_status: 'unprocessed',
    audio_file_path: null,
    text_last_modified: null,
    audio_generated_at: null,
    char_count: 100,
    word_count: 20,
    sent_count: 2,
    predicted_audio_length: 10,
    audio_length_seconds: 0,
    total_segments_count: 2,
    done_segments_count: 0,
  },
  {
    id: 'chapter-a',
    project_id: 'book-1',
    title: 'Alpha',
    text_content: 'Alpha text',
    speaker_profile_name: null,
    sort_order: 2,
    audio_status: 'done',
    audio_file_path: 'alpha.wav',
    text_last_modified: null,
    audio_generated_at: null,
    char_count: 50,
    word_count: 10,
    sent_count: 1,
    predicted_audio_length: 5,
    audio_length_seconds: 5,
    has_wav: true,
  },
];

describe('ChapterTable', () => {
  it('renders lifecycle pills, supports rename, sort, selection, and menu actions', async () => {
    const onRenameChapter = vi.fn();
    const onReorder = vi.fn();
    const onSelectChapter = vi.fn();
    const onQueueChapter = vi.fn();
    const onResetAudio = vi.fn();
    const onDeleteChapter = vi.fn();
    const onExportSample = vi.fn();

    render(
      <ChapterTable
        chapters={chapters}
        jobs={{}}
        selectedChapterId="chapter-b"
        onSelectChapter={onSelectChapter}
        onReorder={onReorder}
        onRenameChapter={onRenameChapter}
        onQueueChapter={onQueueChapter}
        onResetAudio={onResetAudio}
        onDeleteChapter={onDeleteChapter}
        onExportSample={onExportSample}
      />,
    );

    expect(screen.getByRole('columnheader', { name: '#' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Title' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Words' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Stage' })).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Rendered')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sort A-Z' }));
    expect(onReorder).toHaveBeenCalledWith([chapters[1], chapters[0]]);

    fireEvent.click(screen.getByRole('button', { name: /Select Beta/i }));
    expect(onSelectChapter).toHaveBeenCalledWith('chapter-b');

    fireEvent.click(screen.getByText('Beta'));
    const input = screen.getByDisplayValue('Beta');
    fireEvent.change(input, { target: { value: 'Beta Updated' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRenameChapter).toHaveBeenCalledWith('chapter-b', 'Beta Updated');

    const betaRow = screen.getByTestId('chapter-table-row-chapter-b');
    const statusOrb = within(betaRow).getByLabelText(/No audio yet|segments rendered/i);
    expect(statusOrb.closest('.chapter-table__number-cell')).not.toBeNull();
    fireEvent.click(within(betaRow).getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Queue Chapter' }));
    expect(onQueueChapter).toHaveBeenCalledWith(chapters[0]);

    fireEvent.click(within(betaRow).getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reset Audio' }));
    expect(onResetAudio).toHaveBeenCalledWith('chapter-b');

    fireEvent.click(within(betaRow).getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Chapter' }));
    expect(onDeleteChapter).toHaveBeenCalledWith('chapter-b');

    const alphaRow = screen.getByTestId('chapter-table-row-chapter-a');
    fireEvent.click(within(alphaRow).getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Export Video Sample' }));
    expect(onExportSample).toHaveBeenCalledWith(chapters[1]);
  });

  it('drills into the chapter workspace on row click, but not on rename or menu', async () => {
    const onOpenChapter = vi.fn();
    const noop = vi.fn();

    render(
      <ChapterTable
        chapters={chapters}
        jobs={{}}
        selectedChapterId="chapter-b"
        onSelectChapter={noop}
        onReorder={noop}
        onRenameChapter={noop}
        onQueueChapter={noop}
        onResetAudio={noop}
        onDeleteChapter={noop}
        onExportSample={noop}
        onOpenChapter={onOpenChapter}
      />,
    );

    const betaRow = screen.getByTestId('chapter-table-row-chapter-b');

    // Clicking a non-interactive part of the row opens the workspace.
    fireEvent.click(within(betaRow).getByText('20'));
    expect(onOpenChapter).toHaveBeenCalledWith('chapter-b');

    // Renaming via the title must NOT open the workspace (stopPropagation).
    onOpenChapter.mockClear();
    fireEvent.click(within(betaRow).getByText('Beta'));
    expect(onOpenChapter).not.toHaveBeenCalled();

    // Opening the action menu must NOT open the workspace (stopPropagation).
    onOpenChapter.mockClear();
    fireEvent.click(within(betaRow).getByRole('button', { name: 'More actions' }));
    expect(onOpenChapter).not.toHaveBeenCalled();

    // The number cell is the keyboard-accessible open handle (no separate "Open" button).
    onOpenChapter.mockClear();
    fireEvent.click(within(betaRow).getByRole('button', { name: 'Open Beta' }));
    expect(onOpenChapter).toHaveBeenCalledWith('chapter-b');
  });
});
