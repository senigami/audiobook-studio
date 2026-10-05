import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ScriptView } from '@/pages/ChapterEditor/components/ScriptView';

// Mock framer-motion if needed
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Minimal ScriptViewResponse with three spans
const makeData = () => ({
  chapter_id: 'chap1',
  base_revision_id: 'r1',
  paragraphs: [
    { id: 'para1', span_ids: ['spanA', 'spanB', 'spanC'] },
  ],
  spans: [
    { id: 'spanA', order_index: 0, text_content: 'Alpha text.', safe_text: 'Alpha text.', status: 'idle', character_id: null, speaker_profile_name: null },
    { id: 'spanB', order_index: 1, text_content: 'Beta text.', safe_text: 'Beta text.', status: 'idle', character_id: null, speaker_profile_name: null },
    { id: 'spanC', order_index: 2, text_content: 'Gamma text.', safe_text: 'Gamma text.', status: 'idle', character_id: null, speaker_profile_name: null },
  ],
  render_batches: [],
  audio_groups: [],
});

const baseProps = {
  data: makeData(),
  characters: [],
  pendingSpanIds: new Set<string>(),
};

describe('ScriptView render group numbering', () => {
  it('without groupNumberForSpan: numbers every span when showNumbers is toggled', () => {
    render(<ScriptView {...baseProps} />);

    // Toggle the numbers button (aria-pressed)
    const numbersToggle = screen.getByRole('button', { pressed: false, name: /numbers/i });
    fireEvent.click(numbersToggle);

    const numbers = screen.getAllByTestId('span-number');
    expect(numbers).toHaveLength(3);
    expect(numbers[0].textContent).toBe('1');
    expect(numbers[1].textContent).toBe('2');
    expect(numbers[2].textContent).toBe('3');
  });

  it('with groupNumberForSpan: shows number only on first span of each group, using group number', () => {
    // spanA → group 1, spanB → no label, spanC → group 2
    const firstSpanGroupNumber = new Map<string, number>([
      ['spanA', 1],
      ['spanC', 2],
    ]);

    render(<ScriptView {...baseProps} groupNumberForSpan={firstSpanGroupNumber} />);

    const numbersToggle = screen.getByRole('button', { pressed: false, name: /numbers/i });
    fireEvent.click(numbersToggle);

    const numbers = screen.getAllByTestId('span-number');
    expect(numbers).toHaveLength(2);
    expect(numbers[0].textContent).toBe('1');
    expect(numbers[1].textContent).toBe('2');

    // spanB should not have a number
    const spanB = screen.getByTestId('script-span-spanB');
    expect(spanB.querySelector('[data-testid="span-number"]')).toBeNull();
  });

  it('with empty groupNumberForSpan map: falls back to per-span numbering', () => {
    const emptyMap = new Map<string, number>();

    render(<ScriptView {...baseProps} groupNumberForSpan={emptyMap} />);

    const numbersToggle = screen.getByRole('button', { pressed: false, name: /numbers/i });
    fireEvent.click(numbersToggle);

    const numbers = screen.getAllByTestId('span-number');
    expect(numbers).toHaveLength(3);
  });
});
