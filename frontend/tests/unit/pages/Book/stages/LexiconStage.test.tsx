/**
 * LexiconStage tests — R2: mock only the API boundary (fetchLexicon etc.)
 * and the BookDataContext hook. No sleeps; waitFor for async state.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api';
import { LexiconStage } from '@/pages/Book/stages/LexiconStage';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import type { LexiconEntry } from '@/types';

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock('@/pages/Book/BookDataContext', () => ({
  useBookDataContext: vi.fn(),
}));

vi.mock('@/api', () => ({
  api: {
    fetchLexicon: vi.fn(),
    addLexiconEntry: vi.fn(),
    updateLexiconEntry: vi.fn(),
    deleteLexiconEntry: vi.fn(),
  },
}));

// ConfirmModal: render a simple dialog so we can click Confirm/Cancel
vi.mock('@/components/overlays/ConfirmModal', () => ({
  ConfirmModal: ({ isOpen, title, message, onConfirm, onCancel }: any) =>
    isOpen ? (
      <div role="dialog" aria-label={title}>
        <p>{message}</p>
        <button type="button" onClick={onConfirm}>Confirm</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

// ── Fixtures ───────────────────────────────────────────────────────────────────

const ENTRIES: LexiconEntry[] = [
  { id: 'e1', project_id: 'book-1', word: 'Rowan', replacement: 'ROH-an', created_at: 1 },
  { id: 'e2', project_id: 'book-1', word: 'vale', replacement: 'VAYL', created_at: 2 },
];

function setup() {
  vi.mocked(useBookDataContext).mockReturnValue({ bookId: 'book-1' } as any);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('LexiconStage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setup();
  });

  // ---------- lists entries from fetchLexicon ---------------------------------

  it('lists entries returned by fetchLexicon', async () => {
    vi.mocked(api.fetchLexicon).mockResolvedValue(ENTRIES);

    render(<LexiconStage />);

    expect(api.fetchLexicon).toHaveBeenCalledWith('book-1');

    const list = await screen.findByRole('list');
    expect(within(list).getByText('Rowan')).toBeInTheDocument();
    expect(within(list).getByText('ROH-an')).toBeInTheDocument();
    expect(within(list).getByText('vale')).toBeInTheDocument();
    expect(within(list).getByText('VAYL')).toBeInTheDocument();
  });

  it('shows an empty-state message when there are no entries', async () => {
    vi.mocked(api.fetchLexicon).mockResolvedValue([]);

    render(<LexiconStage />);

    await waitFor(() => {
      expect(screen.getByText(/No entries yet/)).toBeInTheDocument();
    });
  });

  // ---------- add calls addLexiconEntry and shows new entry ------------------

  it('add calls addLexiconEntry and the new entry appears in the list', async () => {
    vi.mocked(api.fetchLexicon).mockResolvedValue([]);
    const created: LexiconEntry = { id: 'e99', project_id: 'book-1', word: 'loam', replacement: 'lohm' };
    vi.mocked(api.addLexiconEntry).mockResolvedValue(created);

    render(<LexiconStage />);
    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Add entry/i }));

    const form = screen.getByLabelText('Add pronunciation entry');
    fireEvent.change(within(form).getByLabelText('New word'), { target: { value: 'loam' } });
    fireEvent.change(within(form).getByLabelText('New respelling'), { target: { value: 'lohm' } });
    fireEvent.click(within(form).getByRole('button', { name: /Add/i }));

    await waitFor(() => {
      expect(api.addLexiconEntry).toHaveBeenCalledWith('book-1', 'loam', 'lohm');
    });

    await waitFor(() => {
      expect(screen.getByText('loam')).toBeInTheDocument();
      expect(screen.getByText('lohm')).toBeInTheDocument();
    });

    // Form should close
    expect(screen.queryByLabelText('Add pronunciation entry')).not.toBeInTheDocument();
  });

  // ---------- edit calls updateLexiconEntry ----------------------------------

  it('edit calls updateLexiconEntry with updated values', async () => {
    vi.mocked(api.fetchLexicon).mockResolvedValue(ENTRIES);
    const updated: LexiconEntry = { ...ENTRIES[0], replacement: 'ROE-an' };
    vi.mocked(api.updateLexiconEntry).mockResolvedValue(updated);

    render(<LexiconStage />);
    await waitFor(() => expect(screen.getByText('Rowan')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Edit pronunciation for Rowan/i }));

    const editRegion = screen.getByLabelText(/Edit entry for Rowan/);
    const replacementInput = within(editRegion).getByLabelText('Respelling');
    fireEvent.change(replacementInput, { target: { value: 'ROE-an' } });
    fireEvent.click(within(editRegion).getByRole('button', { name: /Save entry/i }));

    await waitFor(() => {
      expect(api.updateLexiconEntry).toHaveBeenCalledWith('book-1', 'e1', 'Rowan', 'ROE-an');
    });

    await waitFor(() => {
      expect(screen.getByText('ROE-an')).toBeInTheDocument();
    });
  });

  // ---------- delete calls deleteLexiconEntry --------------------------------

  it('delete opens confirm modal and calls deleteLexiconEntry on confirm', async () => {
    vi.mocked(api.fetchLexicon).mockResolvedValue(ENTRIES);
    vi.mocked(api.deleteLexiconEntry).mockResolvedValue({ status: 'ok' });

    render(<LexiconStage />);
    await waitFor(() => expect(screen.getByText('vale')).toBeInTheDocument());

    // Click the delete button for "vale"
    fireEvent.click(screen.getByRole('button', { name: /Delete pronunciation for vale/i }));

    // Confirm modal should be open
    const dialog = screen.getByRole('dialog', { name: /Remove lexicon entry/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent('vale');

    // Confirm the deletion
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(api.deleteLexiconEntry).toHaveBeenCalledWith('book-1', 'e2');
    });

    await waitFor(() => {
      expect(screen.queryByText('vale')).not.toBeInTheDocument();
    });
  });

  it('cancel in confirm modal does not call deleteLexiconEntry', async () => {
    vi.mocked(api.fetchLexicon).mockResolvedValue(ENTRIES);

    render(<LexiconStage />);
    await waitFor(() => expect(screen.getByText('vale')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Delete pronunciation for vale/i }));
    const dialog = screen.getByRole('dialog', { name: /Remove lexicon entry/i });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(api.deleteLexiconEntry).not.toHaveBeenCalled();
    // Entry is still present
    expect(screen.getByText('vale')).toBeInTheDocument();
  });
});
