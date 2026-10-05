import { fireEvent, render, screen } from '@testing-library/react';
import { Headphones, BookOpen } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { MobileModeSwitcher } from '@/pages/ChapterEditor/components/DirectorsConsole/MobileModeSwitcher';

const tools = [
  { id: 'booth', label: 'Booth', icon: Headphones },
  { id: 'book-view', label: 'Book view', icon: BookOpen },
];

describe('MobileModeSwitcher', () => {
  it('renders one button per tool', () => {
    render(<MobileModeSwitcher tools={tools} activeToolId="booth" onSelect={vi.fn()} />);

    expect(screen.getByRole('tab', { name: 'Booth' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Book view' })).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('reflects the active tool via aria-current and aria-selected', () => {
    render(<MobileModeSwitcher tools={tools} activeToolId="book-view" onSelect={vi.fn()} />);

    const booth = screen.getByRole('tab', { name: 'Booth' });
    const bookView = screen.getByRole('tab', { name: 'Book view' });

    expect(booth).not.toHaveAttribute('aria-current');
    expect(booth).toHaveAttribute('aria-selected', 'false');
    expect(bookView).toHaveAttribute('aria-current', 'true');
    expect(bookView).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onSelect with the clicked tool id', () => {
    const onSelect = vi.fn();
    render(<MobileModeSwitcher tools={tools} activeToolId="booth" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Book view' }));

    expect(onSelect).toHaveBeenCalledWith('book-view');
  });

  it('exposes tablist semantics matching the desktop rail', () => {
    render(<MobileModeSwitcher tools={tools} activeToolId="booth" onSelect={vi.fn()} />);

    expect(screen.getByRole('tablist', { name: 'Chapter editor modes' })).toBeTruthy();
  });
});
