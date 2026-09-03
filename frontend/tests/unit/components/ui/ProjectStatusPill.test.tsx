import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProjectStatusPill } from '@/components/ui/ProjectStatusPill';
import type { ProjectStatus } from '@/types';

describe('ProjectStatusPill', () => {
  it.each([
    ['drafting', 'Drafting'],
    ['casting', 'Casting'],
    ['rendered', 'Rendered'],
  ] satisfies Array<[ProjectStatus, string]>)('renders the %s state with label "%s"', (status, label) => {
    render(<ProjectStatusPill status={status} />);
    const pill = screen.getByText(label);
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveClass('project-status-pill');
    expect(pill).toHaveClass(`project-status-pill--${status}`);
  });
});
