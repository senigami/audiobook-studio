import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BookmarkList } from '@/components/BookmarkList';

describe('BookmarkList', () => {
  it('renders the empty message when there are no entries', () => {
    render(<BookmarkList entries={[]} onNavigate={vi.fn()} onRemove={vi.fn()} emptyMessage="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders one row per entry with label and optional secondary text', () => {
    render(
      <BookmarkList
        entries={[
          { id: 'bm-1', label: 'The reveal', secondary: 'The Whispering Vale' },
          { id: 'bm-2', label: 'Opening line' },
        ]}
        onNavigate={vi.fn()}
        onRemove={vi.fn()}
      />,
    );

    expect(screen.getByText('The reveal')).toBeInTheDocument();
    expect(screen.getByText('The Whispering Vale')).toBeInTheDocument();
    expect(screen.getByText('Opening line')).toBeInTheDocument();
  });

  it('calls onNavigate with the entry id when a row is clicked', () => {
    const onNavigate = vi.fn();
    render(
      <BookmarkList
        entries={[{ id: 'bm-1', label: 'The reveal' }]}
        onNavigate={onNavigate}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('listitem').querySelector('.bookmark-list__nav-btn')!);
    expect(onNavigate).toHaveBeenCalledWith('bm-1');
  });

  it('calls onRemove with the entry id when the remove control is clicked, without triggering navigate', () => {
    const onNavigate = vi.fn();
    const onRemove = vi.fn();
    render(
      <BookmarkList
        entries={[{ id: 'bm-1', label: 'The reveal' }]}
        onNavigate={onNavigate}
        onRemove={onRemove}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove bookmark: The reveal' }));
    expect(onRemove).toHaveBeenCalledWith('bm-1');
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
