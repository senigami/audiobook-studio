import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JsonSchemaForm } from '@/pages/Settings/components/JsonSchemaForm';

describe('JsonSchemaForm', () => {
  it('renders duplicate enum values without React key warnings', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <JsonSchemaForm
        schema={{
          properties: {
            model: {
              type: 'string',
              title: 'Model',
              enum: ['voxtral-mini-latest', 'voxtral-mini-latest'],
            },
          },
        }}
        values={{ model: 'voxtral-mini-latest' }}
        onSave={vi.fn()}
        busy={false}
        engineVerified={true}
      />,
    );

    expect(screen.getAllByRole('option', { name: 'voxtral-mini-latest' })).toHaveLength(1);
    expect(
      consoleError.mock.calls.some((call) =>
        String(call[0]).includes('Encountered two children with the same key'),
      ),
    ).toBe(false);

    consoleError.mockRestore();
  });

  it('shows computed plugin computer speed as characters per second without allowing edits', () => {
    render(
      <JsonSchemaForm
        schema={{
          properties: {
            computer_speed_multiplier: {
              type: 'number',
              title: 'Computer Speed',
              description: 'Computed from completed renders.',
              default: 1,
              readOnly: true,
              'x-ui': {
                display: 'computer_speed_cps',
                baseline_cps: 16.7,
              },
            },
          },
        }}
        values={{ computer_speed_multiplier: 1.75 }}
        onSave={vi.fn()}
        busy={false}
        engineVerified={true}
      />,
    );

    expect(screen.getByText('Computer Speed')).toBeInTheDocument();
    expect(screen.getByText('29.2 characters/sec')).toBeInTheDocument();
    expect(screen.queryByText('1.75')).not.toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('allows resetting the computed plugin computer speed back to baseline', async () => {
    const onReset = vi.fn();

    render(
      <JsonSchemaForm
        schema={{
          properties: {
            computer_speed_multiplier: {
              type: 'number',
              title: 'Computer Speed',
              description: 'Computed from completed renders.',
              default: 1,
              readOnly: true,
              'x-ui': {
                display: 'computer_speed_cps',
                baseline_cps: 16.7,
              },
            },
          },
        }}
        values={{ computer_speed_multiplier: 1.75 }}
        onSave={vi.fn()}
        onReset={onReset}
        busy={false}
        engineVerified={true}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /reset/i }));

    await waitFor(() => {
      expect(onReset).toHaveBeenCalledWith('computer_speed_multiplier');
    });
  });

  it('shows a null computed speed as not yet computed', () => {
    render(
      <JsonSchemaForm
        schema={{
          properties: {
            computer_speed_multiplier: {
              type: 'number',
              title: 'Computer Speed',
              description: 'Computed from completed renders.',
              default: 1,
              readOnly: true,
              'x-ui': {
                display: 'computer_speed_cps',
                baseline_cps: 16.7,
              },
            },
          },
        }}
        values={{}}
        onSave={vi.fn()}
        busy={false}
        engineVerified={true}
      />,
    );

    expect(screen.getByText('Not yet computed')).toBeInTheDocument();
    expect(screen.queryByText(/characters\/sec/)).not.toBeInTheDocument();
  });
});
