import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DirectorsConsole } from '@/pages/ChapterEditor/components/DirectorsConsole';
import { directorsConsoleTools } from '@/pages/ChapterEditor/components/DirectorsConsole/registry';

describe('DirectorsConsole', () => {
  it('renders an icon rail entry for every registered tool', () => {
    render(<DirectorsConsole />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(directorsConsoleTools.length);

    directorsConsoleTools.forEach((tool) => {
      expect(screen.getByRole('tab', { name: tool.label })).toBeInTheDocument();
    });
  });

  it('includes the three core tools and the future-slot placeholders', () => {
    render(<DirectorsConsole />);

    ['Cast', 'Booth', 'Revise'].forEach((label) => {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    });

    ['Casting Call', 'Script Supervisor', 'Plugin'].forEach((label) => {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    });
  });

  it('shows the first tool\'s "coming soon" stub body by default', () => {
    render(<DirectorsConsole />);

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Cast');
    expect(panel).toHaveTextContent('Coming soon');
  });

  it('switches the active tool body when a different rail icon is clicked', async () => {
    const user = userEvent.setup();
    render(<DirectorsConsole />);

    await user.click(screen.getByRole('tab', { name: 'Booth' }));

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Booth');
    expect(panel).toHaveTextContent('Coming soon');
    expect(screen.getByRole('tab', { name: 'Booth' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Cast' })).toHaveAttribute('aria-selected', 'false');
  });

  it('shows the "coming soon" stub for a placeholder slot when selected', async () => {
    const user = userEvent.setup();
    render(<DirectorsConsole />);

    await user.click(screen.getByRole('tab', { name: 'Script Supervisor' }));

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Script Supervisor');
    expect(panel).toHaveTextContent('Coming soon');
  });
});
