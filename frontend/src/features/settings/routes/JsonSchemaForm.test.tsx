import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JsonSchemaForm } from './JsonSchemaForm';

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
});
