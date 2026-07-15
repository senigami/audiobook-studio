import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { WelcomePage } from '@/pages/Welcome/WelcomePage';

describe('WelcomePage', () => {
  it('renders the CTA row immediately after the hero, before "Getting started"', () => {
    render(
      <MemoryRouter>
        <WelcomePage />
      </MemoryRouter>,
    );

    const container = screen.getByText('Audiobook').closest('.welcome-page__container');
    expect(container).not.toBeNull();

    const sectionOrder = Array.from(container!.children).map((el) => el.className);
    const heroIndex = sectionOrder.findIndex((c) => c.includes('welcome-hero'));
    const ctaIndex = sectionOrder.findIndex((c) => c.includes('welcome-ctas'));
    const gettingStartedIndex = sectionOrder.findIndex((c) => c.includes('welcome-section'));

    expect(heroIndex).toBeGreaterThanOrEqual(0);
    expect(ctaIndex).toBeGreaterThanOrEqual(0);
    expect(gettingStartedIndex).toBeGreaterThanOrEqual(0);
    expect(ctaIndex).toBe(heroIndex + 1);
    expect(ctaIndex).toBeLessThan(gettingStartedIndex);
  });

  it('renders distinct primary/secondary CTA treatments, secondary as a real external link', () => {
    render(
      <MemoryRouter>
        <WelcomePage />
      </MemoryRouter>,
    );

    // "View Documentation" links out to the published handbook (the local app
    // server doesn't mount docs/) — it's a real <a target="_blank"> now, not a
    // decorative button with no onClick (design-review fix for dead controls).
    const primary = screen.getByRole('button', { name: /enter library/i });
    const secondary = screen.getByRole('link', { name: /view documentation/i });

    expect(primary.tagName).toBe('BUTTON');
    expect(secondary.tagName).toBe('A');
    expect(secondary).toHaveAttribute('href', expect.stringContaining('https://'));
    expect(secondary).toHaveAttribute('target', '_blank');
    expect(secondary).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(primary.className).not.toBe(secondary.className);
    expect(primary.className).toContain('welcome-cta-primary');
    expect(secondary.className).toContain('welcome-cta-secondary');
  });
});
