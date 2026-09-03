import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChapterTable } from '@/pages/Book/components/ChapterTable';
import * as playerBus from '@/store/playerBus';
import type { Chapter, Job } from '@/types';

// ConfirmModal uses AnimatePresence — mock just that so exit animations are synchronous.
vi.mock('@/components/overlays/ConfirmModal', async () => {
  const actual = await vi.importActual<typeof import('@/components/overlays/ConfirmModal')>('@/components/overlays/ConfirmModal');
  // Re-export but with a synchronous AnimatePresence substitute applied at the module boundary.
  // Easier: just provide a simplified ConfirmModal that renders directly (no animation).
  const { ConfirmModal: _orig, ...rest } = actual;
  const SyncConfirmModal = ({ isOpen, title, message, onConfirm, onCancel, confirmText, cancelText = 'Cancel' }: any) => {
    if (!isOpen) return null;
    return (
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <h3 id="confirm-modal-title">{title}</h3>
        <p>{message}</p>
        <button type="button" onClick={onCancel}>{cancelText}</button>
        <button type="button" onClick={onConfirm}>{confirmText}</button>
      </div>
    );
  };
  return { ...rest, ConfirmModal: SyncConfirmModal };
});

// PredictiveProgressBar relies on internal timers — stub it so tests stay fast.
vi.mock('@/components/progress/PredictiveProgressBar/PredictiveProgressBar', () => ({
  PredictiveProgressBar: ({ dataTestId }: { dataTestId?: string }) => (
    <div data-testid={dataTestId ?? 'predictive-progress-bar'} />
  ),
}));

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

beforeEach(() => {
  playerBus.resetPlayerBusForTests();
  vi.restoreAllMocks();
});

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

    // Queue Chapter — Beta has no audio and char_count < threshold, so fires directly.
    fireEvent.click(within(betaRow).getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Queue Chapter' }));
    expect(onQueueChapter).toHaveBeenCalledWith(chapters[0]);

    // Reset Audio — must open a confirm modal first.
    fireEvent.click(within(betaRow).getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reset Audio' }));
    // Confirm modal appears; confirm to fire the prop.
    const resetDialog = await screen.findByRole('dialog');
    expect(within(resetDialog).getByText('Reset Chapter Audio?')).toBeInTheDocument();
    fireEvent.click(within(resetDialog).getByRole('button', { name: 'Reset Audio' }));
    expect(onResetAudio).toHaveBeenCalledWith('chapter-b');

    // Delete Chapter — must open a confirm modal first.
    fireEvent.click(within(betaRow).getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Chapter' }));
    const deleteDialog = await screen.findByRole('dialog');
    expect(within(deleteDialog).getByText('Delete Chapter?')).toBeInTheDocument();
    fireEvent.click(within(deleteDialog).getByRole('button', { name: 'Delete' }));
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

  // ---------------------------------------------------------------------------
  // RST-1: per-row live progress bar
  // ---------------------------------------------------------------------------
  it('RST-1: shows PredictiveProgressBar in the row while a job is active', () => {
    const activeJob: Job = {
      id: 'job-1',
      project_id: 'book-1',
      chapter_id: 'chapter-b',
      status: 'running',
      progress: 0.45,
      created_at: 1000,
      started_at: 1001,
    } as unknown as Job;

    render(
      <ChapterTable
        chapters={chapters}
        jobs={{ 'job-1': activeJob }}
        selectedChapterId={null}
        onSelectChapter={vi.fn()}
        onReorder={vi.fn()}
        onRenameChapter={vi.fn()}
        onQueueChapter={vi.fn()}
        onResetAudio={vi.fn()}
        onDeleteChapter={vi.fn()}
        onExportSample={vi.fn()}
      />,
    );

    // The progress bar appears in the row for chapter-b (which has the active job).
    // The component passes dataTestId={`chapter-list-progress-bar-${chapter.id}`}.
    expect(
      screen.getByTestId('chapter-list-progress-bar-chapter-b'),
    ).toBeInTheDocument();

    // The chapter-a row has no active job — no progress bar there.
    expect(
      screen.queryByTestId('chapter-list-progress-bar-chapter-a'),
    ).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // RST-2: play button drives global player
  // ---------------------------------------------------------------------------
  it('RST-2: play button calls playerBus.loadAndPlay for a rendered chapter', () => {
    const loadAndPlaySpy = vi.spyOn(playerBus, 'loadAndPlay');

    render(
      <ChapterTable
        chapters={chapters}
        jobs={{}}
        selectedChapterId={null}
        onSelectChapter={vi.fn()}
        onReorder={vi.fn()}
        onRenameChapter={vi.fn()}
        onQueueChapter={vi.fn()}
        onResetAudio={vi.fn()}
        onDeleteChapter={vi.fn()}
        onExportSample={vi.fn()}
      />,
    );

    // Alpha has audio — its play button should be present.
    const alphaRow = screen.getByTestId('chapter-table-row-chapter-a');
    const playBtn = within(alphaRow).getByRole('button', { name: 'Play Chapter Audio' });
    fireEvent.click(playBtn);

    expect(loadAndPlaySpy).toHaveBeenCalledWith({
      scope: 'chapter',
      title: 'Alpha',
      subtitle: 'Chapter 2',
      audioUrl: `/api/projects/book-1/chapters/chapter-a/assets/audio?filename=${encodeURIComponent('alpha.wav')}`,
    });
  });

  it('RST-2: no play button shown for a chapter without audio', () => {
    render(
      <ChapterTable
        chapters={chapters}
        jobs={{}}
        selectedChapterId={null}
        onSelectChapter={vi.fn()}
        onReorder={vi.fn()}
        onRenameChapter={vi.fn()}
        onQueueChapter={vi.fn()}
        onResetAudio={vi.fn()}
        onDeleteChapter={vi.fn()}
        onExportSample={vi.fn()}
      />,
    );

    const betaRow = screen.getByTestId('chapter-table-row-chapter-b');
    expect(
      within(betaRow).queryByRole('button', { name: /Play Chapter Audio|Pause Chapter Audio/i }),
    ).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // RST-3: download audio menu item
  // ---------------------------------------------------------------------------
  it('RST-3: Download Audio menu item is present for a rendered chapter and uses the correct URL', async () => {
    // Spy on document.createElement to intercept the anchor click.
    const mockClick = vi.fn();
    // Capture the original BEFORE spying to avoid infinite recursion.
    const originalCreateElement = document.createElement.bind(document);
    const mockCreateElement = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return {
          href: '',
          download: '',
          click: mockClick,
        } as unknown as HTMLAnchorElement;
      }
      return originalCreateElement(tag) as HTMLElement;
    });

    render(
      <ChapterTable
        chapters={chapters}
        jobs={{}}
        selectedChapterId={null}
        onSelectChapter={vi.fn()}
        onReorder={vi.fn()}
        onRenameChapter={vi.fn()}
        onQueueChapter={vi.fn()}
        onResetAudio={vi.fn()}
        onDeleteChapter={vi.fn()}
        onExportSample={vi.fn()}
      />,
    );

    const alphaRow = screen.getByTestId('chapter-table-row-chapter-a');
    fireEvent.click(within(alphaRow).getByRole('button', { name: 'More actions' }));
    const downloadBtn = await screen.findByRole('button', { name: 'Download Audio' });
    expect(downloadBtn).toBeInTheDocument();
    fireEvent.click(downloadBtn);

    expect(mockClick).toHaveBeenCalled();
    const createdAnchor = mockCreateElement.mock.results.find(r => r.type === 'return' && (r.value as any)?.click === mockClick)?.value as any;
    expect(createdAnchor.href).toContain('/api/projects/book-1/chapters/chapter-a/assets/audio?filename=alpha.wav');
    expect(createdAnchor.download).toBe('Alpha.wav');

    mockCreateElement.mockRestore();
  });

  it('RST-3: Download Audio menu item is absent for a chapter without audio', async () => {
    render(
      <ChapterTable
        chapters={chapters}
        jobs={{}}
        selectedChapterId={null}
        onSelectChapter={vi.fn()}
        onReorder={vi.fn()}
        onRenameChapter={vi.fn()}
        onQueueChapter={vi.fn()}
        onResetAudio={vi.fn()}
        onDeleteChapter={vi.fn()}
        onExportSample={vi.fn()}
      />,
    );

    const betaRow = screen.getByTestId('chapter-table-row-chapter-b');
    fireEvent.click(within(betaRow).getByRole('button', { name: 'More actions' }));
    // If the menu opened, "Download Audio" must not be present.
    expect(screen.queryByRole('button', { name: 'Download Audio' })).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // RST-4: destructive-action confirm guards
  // ---------------------------------------------------------------------------
  it('RST-4: queuing a fully-rendered chapter opens a Rebuild confirm before firing', async () => {
    const onQueueChapter = vi.fn();

    render(
      <ChapterTable
        chapters={chapters}
        jobs={{}}
        selectedChapterId={null}
        onSelectChapter={vi.fn()}
        onReorder={vi.fn()}
        onRenameChapter={vi.fn()}
        onQueueChapter={onQueueChapter}
        onResetAudio={vi.fn()}
        onDeleteChapter={vi.fn()}
        onExportSample={vi.fn()}
      />,
    );

    // Alpha is fully rendered (has_wav: true).
    const alphaRow = screen.getByTestId('chapter-table-row-chapter-a');
    fireEvent.click(within(alphaRow).getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Queue Chapter' }));

    // Prop must NOT fire yet — modal must appear first.
    expect(onQueueChapter).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Rebuild Chapter Audio?')).toBeInTheDocument();

    // Confirm → prop fires.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rebuild' }));
    expect(onQueueChapter).toHaveBeenCalledWith(chapters[1]);
  });

  it('RST-4: queuing a large chapter opens a size-warning confirm before firing', async () => {
    const largeChapter: Chapter = {
      ...chapters[0],
      id: 'chapter-large',
      char_count: 60_000,
    };
    const onQueueChapter = vi.fn();

    render(
      <ChapterTable
        chapters={[largeChapter]}
        jobs={{}}
        selectedChapterId={null}
        onSelectChapter={vi.fn()}
        onReorder={vi.fn()}
        onRenameChapter={vi.fn()}
        onQueueChapter={onQueueChapter}
        onResetAudio={vi.fn()}
        onDeleteChapter={vi.fn()}
        onExportSample={vi.fn()}
      />,
    );

    const row = screen.getByTestId('chapter-table-row-chapter-large');
    fireEvent.click(within(row).getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Queue Chapter' }));

    expect(onQueueChapter).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Large Chapter')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Queue Anyway' }));
    expect(onQueueChapter).toHaveBeenCalledWith(largeChapter);
  });

  it('RST-4: cancelling the rebuild confirm does not fire onQueueChapter', async () => {
    const onQueueChapter = vi.fn();

    render(
      <ChapterTable
        chapters={chapters}
        jobs={{}}
        selectedChapterId={null}
        onSelectChapter={vi.fn()}
        onReorder={vi.fn()}
        onRenameChapter={vi.fn()}
        onQueueChapter={onQueueChapter}
        onResetAudio={vi.fn()}
        onDeleteChapter={vi.fn()}
        onExportSample={vi.fn()}
      />,
    );

    const alphaRow = screen.getByTestId('chapter-table-row-chapter-a');
    fireEvent.click(within(alphaRow).getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Queue Chapter' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onQueueChapter).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('RST-4: Reset Audio opens confirm modal; cancel does not fire onResetAudio', async () => {
    const onResetAudio = vi.fn();

    render(
      <ChapterTable
        chapters={chapters}
        jobs={{}}
        selectedChapterId={null}
        onSelectChapter={vi.fn()}
        onReorder={vi.fn()}
        onRenameChapter={vi.fn()}
        onQueueChapter={vi.fn()}
        onResetAudio={onResetAudio}
        onDeleteChapter={vi.fn()}
        onExportSample={vi.fn()}
      />,
    );

    const betaRow = screen.getByTestId('chapter-table-row-chapter-b');
    fireEvent.click(within(betaRow).getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reset Audio' }));

    expect(onResetAudio).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Reset Chapter Audio?')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onResetAudio).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('RST-4: Delete Chapter opens confirm modal; cancel does not fire onDeleteChapter', async () => {
    const onDeleteChapter = vi.fn();

    render(
      <ChapterTable
        chapters={chapters}
        jobs={{}}
        selectedChapterId={null}
        onSelectChapter={vi.fn()}
        onReorder={vi.fn()}
        onRenameChapter={vi.fn()}
        onQueueChapter={vi.fn()}
        onResetAudio={vi.fn()}
        onDeleteChapter={onDeleteChapter}
        onExportSample={vi.fn()}
      />,
    );

    const betaRow = screen.getByTestId('chapter-table-row-chapter-b');
    fireEvent.click(within(betaRow).getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Chapter' }));

    expect(onDeleteChapter).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete Chapter?')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onDeleteChapter).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
