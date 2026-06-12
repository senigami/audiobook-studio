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

  describe('nested boolean-object property (sanitize_overrides)', () => {
    const sanitizeSchema = {
      properties: {
        sanitize_overrides: {
          type: 'object',
          title: 'Text Sanitization Overrides',
          description: 'Enable or disable individual text sanitization categories.',
          properties: {
            quotes: { type: 'boolean', title: 'Normalize Quotes', default: true },
            dashes: { type: 'boolean', title: 'Normalize Dashes & Ellipses', default: true },
          },
          default: {},
        },
      },
    };

    it('renders the group title and sub-category toggles', () => {
      render(
        <JsonSchemaForm
          schema={sanitizeSchema}
          values={{}}
          onSave={vi.fn()}
          busy={false}
          engineVerified={true}
        />,
      );

      expect(screen.getByText('Text Sanitization Overrides')).toBeInTheDocument();
      expect(screen.getByText('Normalize Quotes')).toBeInTheDocument();
      expect(screen.getByText('Normalize Dashes & Ellipses')).toBeInTheDocument();
    });

    it('calls onSave with the nested overrides object when a sub-toggle is clicked', async () => {
      const onSave = vi.fn();

      render(
        <JsonSchemaForm
          schema={sanitizeSchema}
          values={{ sanitize_overrides: { quotes: true, dashes: true } }}
          onSave={onSave}
          busy={false}
          engineVerified={true}
        />,
      );

      // Click the "Normalize Quotes" toggle button (first ToggleButton rendered)
      const toggleButtons = screen.getAllByRole('button');
      fireEvent.click(toggleButtons[0]);

      // The Save Settings button should now appear (values changed)
      const saveBtn = await screen.findByRole('button', { name: /save settings/i });
      fireEvent.click(saveBtn);

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          sanitize_overrides: expect.objectContaining({ quotes: false }),
        }),
      );
    });
  });
});
