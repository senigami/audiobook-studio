import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VoiceProfileSelect } from './VoiceProfileSelect';

describe('VoiceProfileSelect', () => {
  it('renders duplicate provider ids without React key warnings', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <VoiceProfileSelect
        value=""
        onChange={vi.fn()}
        options={[
          { id: 'voxtral-mini-latest', value: 'cloud-a', name: 'Cloud A', is_speaker: true },
          { id: 'voxtral-mini-latest', value: 'cloud-b', name: 'Cloud B', is_speaker: true },
        ]}
      />,
    );

    expect(screen.getByRole('option', { name: 'Cloud A' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Cloud B' })).toBeInTheDocument();
    expect(
      consoleError.mock.calls.some((call) =>
        String(call[0]).includes('Encountered two children with the same key'),
      ),
    ).toBe(false);

    consoleError.mockRestore();
  });
});
