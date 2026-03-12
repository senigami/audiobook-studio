import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SearchableSelect from './SearchableSelect';

describe('SearchableSelect', () => {
  const options = [
    { id: '1', name: 'Option 1' },
    { id: '2', name: 'Option 2' },
  ];

  it('renders with placeholder', () => {
    render(<SearchableSelect options={options} value="" onChange={vi.fn()} placeholder="Select test" />);
    expect(screen.getByText('Select test')).toBeInTheDocument();
  });

  it('opens dropdown on click', () => {
    render(<SearchableSelect options={options} value="" onChange={vi.fn()} placeholder="Select test" />);
    fireEvent.click(screen.getByRole('button', { name: 'Select test' }));
    expect(screen.getByPlaceholderText('Search speakers...')).toBeInTheDocument();
  });

  it('filters options based on search', () => {
    render(<SearchableSelect options={options} value="" onChange={vi.fn()} placeholder="Select test" />);
    fireEvent.click(screen.getByRole('button', { name: 'Select test' }));
    
    const input = screen.getByPlaceholderText('Search speakers...');
    fireEvent.change(input, { target: { value: 'Option 1' } });
    
    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.queryByText('Option 2')).not.toBeInTheDocument();
  });

  it('calls onChange when an option is selected', () => {
    const onChange = vi.fn();
    render(<SearchableSelect options={options} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Select an option/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Option 1' }));
    
    expect(onChange).toHaveBeenCalledWith('1');
  });

  it('handles "None" option', () => {
    const onChange = vi.fn();
    render(<SearchableSelect options={options} value="1" onChange={onChange} noneLabel="Clear" />);
    fireEvent.click(screen.getByRole('button', { name: 'Option 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    
    expect(onChange).toHaveBeenCalledWith('none');
  });

  it('calls onCreateNew when create button clicked', () => {
    const onCreateNew = vi.fn();
    render(<SearchableSelect options={options} value="" onChange={vi.fn()} onCreateNew={onCreateNew} placeholder="Select test" />);
    fireEvent.click(screen.getByRole('button', { name: 'Select test' }));
    fireEvent.click(screen.getByRole('button', { name: /Create New Speaker/i }));
    
    expect(onCreateNew).toHaveBeenCalled();
  });

  it('is disabled when disabled prop is true', () => {
    render(<SearchableSelect options={options} value="" onChange={vi.fn()} disabled={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByPlaceholderText('Search speakers...')).not.toBeInTheDocument();
  });
});
