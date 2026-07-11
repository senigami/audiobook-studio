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

  it('renders both CTAs as buttons with distinct primary/secondary treatment', () => {
    render(
      <MemoryRouter>
        <WelcomePage />
      </MemoryRouter>,
    );

    const primary = screen.getByRole('button', { name: /enter library/i });
    const secondary = screen.getByRole('button', { name: /view documentation/i });

    expect(primary.tagName).toBe('BUTTON');
    expect(secondary.tagName).toBe('BUTTON');
    expect(primary.className).not.toBe(secondary.className);
    expect(primary.className).toContain('welcome-cta-primary');
    expect(secondary.className).toContain('welcome-cta-secondary');
  });
});
