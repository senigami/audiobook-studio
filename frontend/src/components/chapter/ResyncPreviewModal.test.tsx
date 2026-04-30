import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ResyncPreviewModal } from './ResyncPreviewModal';

describe('ResyncPreviewModal', () => {
  const mockData = {
    total_segments_before: 10,
    total_segments_after: 12,
    preserved_assignments_count: 8,
    lost_assignments_count: 2,
    affected_character_names: ['Char 1'],
    is_destructive: true
  };

  it('renders nothing when not open', () => {
    const { container } = render(
      <ResyncPreviewModal
        isOpen={false}
        data={null}
        loading={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders loading state', () => {
    render(
      <ResyncPreviewModal
        isOpen={true}
        data={null}
        loading={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByText(/Calculating impact.../i)).toBeInTheDocument();
  });

  it('renders diff data and handles confirm', () => {
    const onConfirm = vi.fn();
    render(
      <ResyncPreviewModal
        isOpen={true}
        data={{ ...mockData, is_destructive: false } as any}
        loading={false}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('Commit Changes'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('handles cancel', () => {
    const onCancel = vi.fn();
    render(
      <ResyncPreviewModal
        isOpen={true}
        data={{ ...mockData, is_destructive: false } as any}
        loading={false}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByText('Back to Editor'));
    expect(onCancel).toHaveBeenCalled();
  });
});
