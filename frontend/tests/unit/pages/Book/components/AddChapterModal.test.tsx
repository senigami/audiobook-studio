import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AddChapterModal } from '@/pages/Book/components/AddChapterModal';

describe('AddChapterModal', () => {
  it('rejects a whitespace-only title', () => {
    const onSubmit = vi.fn();
    render(
      <AddChapterModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        submitting={false}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('e.g. Chapter 1'), { target: { value: '   ' } });

    const submitButton = screen.getByText('Add Chapter');
    expect(submitButton).toBeDisabled();

    fireEvent.click(submitButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('trims leading/trailing whitespace from the title before submitting', () => {
    const onSubmit = vi.fn();
    render(
      <AddChapterModal
        isOpen={true}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        submitting={false}
      />
    );

    fireEvent.change(screen.getByPlaceholderText('e.g. Chapter 1'), { target: { value: '  New Chapter  ' } });
    fireEvent.change(screen.getByPlaceholderText('Paste your chapter text here...'), { target: { value: 'Some text' } });
    fireEvent.click(screen.getByText('Add Chapter'));

    expect(onSubmit).toHaveBeenCalledWith('New Chapter', 'Some text', null);
  });
});
