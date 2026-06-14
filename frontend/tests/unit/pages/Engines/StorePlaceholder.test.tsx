import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StorePlaceholder } from '@/pages/Engines/components/StorePlaceholder';

describe('StorePlaceholder (R5-T11)', () => {
  it('renders the "Browse store" heading with planned chip', () => {
    render(<StorePlaceholder />);
    expect(screen.getByRole('heading', { name: 'Browse store' })).toBeInTheDocument();
    expect(screen.getByTestId('store-planned-chip')).toBeInTheDocument();
    expect(screen.getByText('plugin store — GitHub discovery')).toBeInTheDocument();
  });

  it('renders the planned description and import hint', () => {
    render(<StorePlaceholder />);
    expect(screen.getByText(/Discover and install engine plugins from GitHub — planned/)).toBeInTheDocument();
    expect(screen.getByText(/Import plugin \(\.zip\)/)).toBeInTheDocument();
  });

  it('renders the unsandboxed-plugins trust note', () => {
    render(<StorePlaceholder />);
    expect(screen.getByText(/Plugins run unsandboxed/i)).toBeInTheDocument();
  });

  it('contains no install buttons (fake install buttons are intentionally absent)', () => {
    render(<StorePlaceholder />);
    // No "Install" buttons should be present — store cards are not rendered
    const installBtns = screen.queryAllByRole('button', { name: /install/i });
    expect(installBtns).toHaveLength(0);
  });
});
