/**
 * NumberStepper accessibility additions: aria-describedby wiring and the two
 * focus returns (a step button that reaches its limit, and a save that disables
 * the whole stepper). No mocks: the component under test is rendered for real.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NumberStepper, SettingCard } from '@/pages/Settings/components/SettingsComponents';
import { Layers } from 'lucide-react';

const Stepper: React.FC<{ value: number; max: number; disabled?: boolean; describedBy?: string }> = (props) => (
  <NumberStepper ariaLabel="Cap" min={1} onStep={vi.fn()} {...props} />
);

describe('NumberStepper describedBy', () => {
  it('wires aria-describedby to the input and both buttons', () => {
    render(<Stepper value={2} max={4} describedBy="hint-a error-b" />);
    for (const name of ['Decrease Cap', 'Cap', 'Increase Cap']) {
      expect(screen.getByLabelText(name)).toHaveAttribute('aria-describedby', 'hint-a error-b');
    }
  });

  it('sets no aria-describedby when none is given', () => {
    render(<Stepper value={2} max={4} />);
    expect(screen.getByLabelText('Cap')).not.toHaveAttribute('aria-describedby');
  });
});

describe('NumberStepper focus', () => {
  it('moves focus to the input when the focused increase button reaches the max', () => {
    const { rerender } = render(<Stepper value={1} max={2} />);
    const inc = screen.getByLabelText('Increase Cap');
    inc.focus();
    expect(inc).toHaveFocus();

    rerender(<Stepper value={2} max={2} />);

    expect(screen.getByLabelText('Increase Cap')).toBeDisabled();
    expect(screen.getByLabelText('Cap')).toHaveFocus();
  });

  it('moves focus to the input when a poll lowers the max under the focused increase button', () => {
    const { rerender } = render(<Stepper value={2} max={3} />);
    screen.getByLabelText('Increase Cap').focus();

    rerender(<Stepper value={2} max={2} />);

    expect(screen.getByLabelText('Cap')).toHaveFocus();
  });

  it('returns focus to the input after a save that disabled the stepper', () => {
    const { rerender } = render(<Stepper value={1} max={4} />);
    screen.getByLabelText('Cap').focus();

    rerender(<Stepper value={1} max={4} disabled />);
    rerender(<Stepper value={1} max={4} />);

    expect(screen.getByLabelText('Cap')).toHaveFocus();
  });

  it('does not take focus when it was elsewhere before the save', () => {
    const { rerender } = render(
      <>
        <button type="button">Elsewhere</button>
        <Stepper value={1} max={4} />
      </>
    );
    screen.getByText('Elsewhere').focus();

    rerender(
      <>
        <button type="button">Elsewhere</button>
        <Stepper value={1} max={4} disabled />
      </>
    );
    rerender(
      <>
        <button type="button">Elsewhere</button>
        <Stepper value={1} max={4} />
      </>
    );

    expect(screen.getByText('Elsewhere')).toHaveFocus();
  });
});

describe('SettingCard hint', () => {
  it('renders the hint node under the description', () => {
    render(
      <SettingCard
        icon={Layers}
        title="Title"
        description="Description text"
        hint={<p id="the-hint">Hint text</p>}
        action={<span>action</span>}
      />
    );
    const description = screen.getByText('Description text');
    const hint = screen.getByText('Hint text');
    expect(hint.id).toBe('the-hint');
    expect(description.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
