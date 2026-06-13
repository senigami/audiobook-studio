import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IntegrationsPage } from '@/pages/Integrations/IntegrationsPage';

describe('IntegrationsPage', () => {
  it('renders the integrations heading and swagger link', () => {
    render(<IntegrationsPage />);

    expect(screen.getByRole('heading', { name: 'Integrations' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Security Note' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Swagger Docs' })).toHaveAttribute('href', '/api/v1/tts/docs');
  });
});
