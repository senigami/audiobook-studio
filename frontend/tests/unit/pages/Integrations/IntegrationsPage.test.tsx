import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IntegrationsPage } from '@/pages/Integrations/IntegrationsPage';

describe('IntegrationsPage', () => {
  it('renders without crashing', () => {
    render(<IntegrationsPage />);

    expect(screen.getByRole('heading', { name: 'Integrations' })).toBeInTheDocument();
  });
});
