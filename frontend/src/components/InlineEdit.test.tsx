import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { InlineEdit } from './InlineEdit';

describe('InlineEdit', () => {
  it('renders the initial value', () => {
    render(<InlineEdit value="Initial Value" onSave={() => {}} />);
    expect(screen.getByText('Initial Value')).toBeInTheDocument();
  });

  it('renders the placeholder when value is empty', () => {
    render(<InlineEdit value="" onSave={() => {}} placeholder="Add something..." />);
    expect(screen.getByText('Add something...')).toBeInTheDocument();
  });

  it('enters edit mode on single click', () => {
    render(<InlineEdit value="Click me" onSave={() => {}} />);
    fireEvent.click(screen.getByText('Click me'));
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Click me');
  });

  it('saves on blur', () => {
    const onSave = vi.fn();
    render(<InlineEdit value="Original" onSave={onSave} />);
    
    fireEvent.click(screen.getByText('Original'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Updated' } });
    fireEvent.blur(input);
    
    expect(onSave).toHaveBeenCalledWith('Updated');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('saves on Enter key', () => {
    const onSave = vi.fn();
    render(<InlineEdit value="Original" onSave={onSave} />);
    
    fireEvent.click(screen.getByText('Original'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Updated' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    
    expect(onSave).toHaveBeenCalledWith('Updated');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('cancels on Escape key', () => {
    const onSave = vi.fn();
    render(<InlineEdit value="Original" onSave={onSave} />);
    
    fireEvent.click(screen.getByText('Original'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Updated' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Original')).toBeInTheDocument();
  });

  it('does not save if value has not changed', () => {
    const onSave = vi.fn();
    render(<InlineEdit value="Same" onSave={onSave} />);
    
    fireEvent.click(screen.getByText('Same'));
    fireEvent.blur(screen.getByRole('textbox'));
    
    expect(onSave).not.toHaveBeenCalled();
  });

  it('respects the disabled prop', () => {
    render(<InlineEdit value="Locked" onSave={() => {}} disabled={true} />);
    fireEvent.click(screen.getByText('Locked'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
