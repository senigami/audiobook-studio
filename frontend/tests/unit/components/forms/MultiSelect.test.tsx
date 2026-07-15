import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MultiSelect from '@/components/forms/MultiSelect';

describe('MultiSelect', () => {
  const options = [
    { id: '1', label: 'Option 1' },
    { id: '2', label: 'Option 2' },
    { id: '3', label: 'Option 3' },
  ];

  it('renders selected values as chips', () => {
    render(<MultiSelect options={options} value={['1', '2']} onChange={vi.fn()} />);
    expect(screen.getByText('Option 1')).toBeInTheDocument();
    expect(screen.getByText('Option 2')).toBeInTheDocument();
    expect(screen.queryByText('Option 3')).not.toBeInTheDocument();
  });

  it('shows placeholder when no values selected', () => {
    render(<MultiSelect options={options} value={[]} onChange={vi.fn()} placeholder="Pick some" />);
    expect(screen.getByText('Pick some')).toBeInTheDocument();
  });

  it('toggles an option on via click', () => {
    const onChange = vi.fn();
    render(<MultiSelect options={options} value={[]} onChange={onChange} label="Pick" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    fireEvent.click(screen.getByRole('option', { name: 'Option 1' }));
    expect(onChange).toHaveBeenCalledWith(['1']);
  });

  it('toggles an option off via click', () => {
    const onChange = vi.fn();
    render(<MultiSelect options={options} value={['1']} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button')[0]);
    fireEvent.click(screen.getByRole('option', { name: /Option 1/ }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('does not close the panel after toggling an option', () => {
    const onChange = vi.fn();
    render(<MultiSelect options={options} value={[]} onChange={onChange} label="Pick" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    fireEvent.click(screen.getByRole('option', { name: 'Option 1' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('toggles the highlighted option via arrow keys + space', () => {
    const onChange = vi.fn();
    render(<MultiSelect options={options} value={[]} onChange={onChange} label="Pick" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));

    const listbox = screen.getByRole('listbox');
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: ' ' });

    expect(onChange).toHaveBeenCalledWith(['2']);
  });

  it('removes a chip via its × control', () => {
    const onChange = vi.fn();
    render(<MultiSelect options={options} value={['1', '2']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Option 1' }));
    expect(onChange).toHaveBeenCalledWith(['2']);
  });

  it('removing a chip does not toggle the dropdown open', () => {
    const onChange = vi.fn();
    render(<MultiSelect options={options} value={['1']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Option 1' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    render(<MultiSelect options={options} value={[]} onChange={vi.fn()} label="Pick" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('closes on outside click', async () => {
    render(
      <div>
        <MultiSelect options={options} value={[]} onChange={vi.fn()} label="Pick" />
        <div data-testid="outside">outside</div>
      </div>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('sets aria-multiselectable and role=option/aria-selected correctly', () => {
    render(<MultiSelect options={options} value={['2']} onChange={vi.fn()} label="Pick" />);
    const triggerButtons = screen.getAllByRole('button');
    fireEvent.click(triggerButtons[0]);

    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveAttribute('aria-multiselectable', 'true');

    const selectedOption = screen.getByRole('option', { name: /Option 2/ });
    expect(selectedOption).toHaveAttribute('aria-selected', 'true');

    const unselectedOption = screen.getByRole('option', { name: 'Option 1' });
    expect(unselectedOption).toHaveAttribute('aria-selected', 'false');
  });

  it('is disabled when disabled prop is true', () => {
    render(<MultiSelect options={options} value={[]} onChange={vi.fn()} disabled={true} label="Pick" />);
    expect(screen.getByRole('button', { name: 'Pick' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Pick' }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
