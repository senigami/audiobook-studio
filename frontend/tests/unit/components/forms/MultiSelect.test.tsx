import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    fireEvent.click(screen.getByRole('combobox', { name: 'Pick' }));
    fireEvent.click(screen.getByRole('option', { name: 'Option 1' }));
    expect(onChange).toHaveBeenCalledWith(['1']);
  });

  it('toggles an option off via click', () => {
    const onChange = vi.fn();
    render(<MultiSelect options={options} value={['1']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByRole('option', { name: /Option 1/ }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('does not close the panel after toggling an option', async () => {
    const onChange = vi.fn();
    render(<MultiSelect options={options} value={[]} onChange={onChange} label="Pick" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Pick' }));
    fireEvent.click(screen.getByRole('option', { name: 'Option 1' }));
    expect(await screen.findByRole('listbox')).toBeInTheDocument();
  });

  it('opens and toggles the highlighted option via arrow keys + space, changing the value', async () => {
    const onChange = vi.fn();
    render(<MultiSelect options={options} value={[]} onChange={onChange} label="Pick" />);
    const combobox = screen.getByRole('combobox', { name: 'Pick' });

    // Keyboard alone opens the panel — focus never leaves the combobox trigger.
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(combobox, { key: 'ArrowDown' }); // highlight moves 0 -> 1
    fireEvent.keyDown(combobox, { key: ' ' });         // toggle options[1]

    expect(onChange).toHaveBeenCalledWith(['2']);
  });

  it('toggles the highlighted option via Enter as well', () => {
    const onChange = vi.fn();
    render(<MultiSelect options={options} value={[]} onChange={onChange} label="Pick" />);
    const combobox = screen.getByRole('combobox', { name: 'Pick' });

    fireEvent.click(combobox); // open
    fireEvent.keyDown(combobox, { key: 'ArrowDown' }); // 0 -> 1
    fireEvent.keyDown(combobox, { key: 'ArrowUp' });   // 1 -> 0
    fireEvent.keyDown(combobox, { key: 'Enter' });     // toggle options[0]

    expect(onChange).toHaveBeenCalledWith(['1']);
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

  it('reaches each chip remove button by Tab in sequence and activates via Enter/Space', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<MultiSelect options={options} value={['1', '2']} onChange={onChange} label="Pick" />);

    const combobox = screen.getByRole('combobox', { name: 'Pick' });
    combobox.focus();
    expect(combobox).toHaveFocus();

    // Tab lands on the first chip's remove button, then the second — in order.
    await user.tab();
    const remove1 = screen.getByRole('button', { name: 'Remove Option 1' });
    expect(remove1).toHaveFocus();

    await user.tab();
    const remove2 = screen.getByRole('button', { name: 'Remove Option 2' });
    expect(remove2).toHaveFocus();

    // Enter activates the focused remove control (removes Option 2)...
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(['1']);

    // ...and Space activates it too (removes Option 1).
    remove1.focus();
    await user.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith(['2']);

    // Activating a chip must never open the listbox.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes on Escape', async () => {
    render(<MultiSelect options={options} value={[]} onChange={vi.fn()} label="Pick" />);
    const combobox = screen.getByRole('combobox', { name: 'Pick' });
    fireEvent.click(combobox);
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(combobox, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('closes on outside click', async () => {
    render(
      <div>
        <MultiSelect options={options} value={[]} onChange={vi.fn()} label="Pick" />
        <div data-testid="outside">outside</div>
      </div>
    );
    fireEvent.click(screen.getByRole('combobox', { name: 'Pick' }));
    expect(await screen.findByRole('listbox')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('sets aria-multiselectable and role=option/aria-selected correctly', () => {
    render(<MultiSelect options={options} value={['2']} onChange={vi.fn()} label="Pick" />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Pick' }));

    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveAttribute('aria-multiselectable', 'true');

    const selectedOption = screen.getByRole('option', { name: /Option 2/ });
    expect(selectedOption).toHaveAttribute('aria-selected', 'true');

    const unselectedOption = screen.getByRole('option', { name: 'Option 1' });
    expect(unselectedOption).toHaveAttribute('aria-selected', 'false');
  });

  // -----------------------------------------------------------------------
  // H-5 (design-critique follow-up): selected chips tint to the facet's pill
  // hue when a `category` is supplied, instead of one generic accent color.
  // -----------------------------------------------------------------------

  it('renders selected chips with generic accent styling when no category is supplied', () => {
    render(<MultiSelect options={options} value={['1']} onChange={vi.fn()} />);
    const chip = screen.getByText('Option 1').closest('span');
    expect(chip).toHaveStyle({ background: 'var(--accent-glow)', color: 'var(--action-primary)' });
    expect(chip).not.toHaveAttribute('data-category');
  });

  it('tints selected chips to the pill hue for the supplied category', () => {
    render(<MultiSelect options={options} value={['1']} onChange={vi.fn()} category="gender" />);
    const chip = screen.getByText('Option 1').closest('span');
    expect(chip).toHaveStyle({
      background: 'var(--pill-gender-bg)',
      color: 'var(--pill-gender-text)',
    });
    expect(chip).toHaveAttribute('data-category', 'gender');
  });

  it('is disabled when disabled prop is true', () => {
    render(<MultiSelect options={options} value={[]} onChange={vi.fn()} disabled={true} label="Pick" />);
    const combobox = screen.getByRole('combobox', { name: 'Pick' });
    expect(combobox).toHaveAttribute('aria-disabled', 'true');
    expect(combobox).toHaveAttribute('tabindex', '-1');
    fireEvent.click(combobox);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
