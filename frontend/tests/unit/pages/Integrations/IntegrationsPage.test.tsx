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

  it('renders the developer integration guide cards', () => {
    render(<IntegrationsPage />);

    expect(screen.getByText('Developer Integration Guide')).toBeInTheDocument();
    expect(screen.getByText('Unified Orchestration')).toBeInTheDocument();
    expect(screen.getByText('Direct Synthesis')).toBeInTheDocument();
  });

  it('renders all three numbered endpoint sections', () => {
    render(<IntegrationsPage />);

    expect(screen.getByText('1. Resource Discovery')).toBeInTheDocument();
    expect(screen.getByText('2. Orchestration & Generation')).toBeInTheDocument();
    expect(screen.getByText('3. Direct TTS Server Access')).toBeInTheDocument();
  });

  it('renders endpoint rows with paths', () => {
    render(<IntegrationsPage />);

    expect(screen.getByText('GET /api/engines')).toBeInTheDocument();
    expect(screen.getByText('GET /api/speaker-profiles')).toBeInTheDocument();
    expect(screen.getByText('POST /api/processing_queue')).toBeInTheDocument();
    expect(screen.getByText('WebSocket /ws')).toBeInTheDocument();
  });
});
