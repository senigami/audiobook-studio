import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SystemResourceStrip } from '@/pages/Activity/components/SystemResourceStrip';
import type { SystemResourceSample } from '@/hooks/useSystemResourceSamples';

function makeSample(overrides: Partial<SystemResourceSample> = {}): SystemResourceSample {
  return {
    t: Date.now(),
    cpuPct: 42,
    ramUsedGB: 7.2,
    ramTotalGB: 16,
    vramUsedGB: 3.1,
    vramTotalGB: 8,
    ...overrides,
  };
}

describe('SystemResourceStrip', () => {
  it('renders 3 rows (CPU/RAM/VRAM) when hasVram=true', () => {
    render(<SystemResourceStrip samples={[makeSample()]} hasVram loading={false} />);

    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('RAM')).toBeInTheDocument();
    expect(screen.getByText('VRAM')).toBeInTheDocument();
  });

  it('renders only 2 rows, omitting VRAM from the DOM, when hasVram=false', () => {
    render(<SystemResourceStrip samples={[makeSample()]} hasVram={false} loading={false} />);

    expect(screen.getByText('CPU')).toBeInTheDocument();
    expect(screen.getByText('RAM')).toBeInTheDocument();
    expect(screen.queryByText('VRAM')).not.toBeInTheDocument();
  });

  it('shows the no-data placeholder ("—") for every row while loading', () => {
    render(<SystemResourceStrip samples={[]} hasVram loading />);

    const dashes = screen.getAllByText('—');
    // CPU + RAM rows always render; VRAM row only renders once samples exist,
    // so during initial loading (no samples) it's CPU + RAM = 2 dashes.
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('applies hot (error) styling when pct >= 90 sustained for 2+ samples', () => {
    const samples: SystemResourceSample[] = [
      makeSample({ cpuPct: 40 }),
      makeSample({ cpuPct: 95 }),
      makeSample({ cpuPct: 96 }),
    ];

    render(<SystemResourceStrip samples={samples} hasVram={false} loading={false} />);

    const cpuValue = screen.getByText('96%');
    expect(cpuValue).toHaveStyle({ color: 'var(--error)' });
  });

  it('applies elevated (not sustained-hot) styling for a single high sample >= 70', () => {
    const samples: SystemResourceSample[] = [
      makeSample({ cpuPct: 40 }),
      makeSample({ cpuPct: 95 }),
    ];

    render(<SystemResourceStrip samples={samples} hasVram={false} loading={false} />);

    const cpuValue = screen.getByText('95%');
    expect(cpuValue).toHaveStyle({ color: 'var(--warning-text-strong)' });
  });

  it('does not apply elevated/hot styling below 70', () => {
    const samples: SystemResourceSample[] = [makeSample({ cpuPct: 40 })];

    render(<SystemResourceStrip samples={samples} hasVram={false} loading={false} />);

    const cpuValue = screen.getByText('40%');
    expect(cpuValue).toHaveStyle({ color: 'var(--text-primary)' });
  });

  it('renders sparkline svgs with aria-hidden', () => {
    const { container } = render(<SystemResourceStrip samples={[makeSample()]} hasVram loading={false} />);

    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
    svgs.forEach((svg) => {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    });
  });

  it('includes visually-hidden accessible text per row', () => {
    const { container } = render(<SystemResourceStrip samples={[makeSample({ cpuPct: 42 })]} hasVram loading={false} />);

    const hidden = container.querySelectorAll('.sr-only');
    const texts = Array.from(hidden).map((el) => el.textContent);
    expect(texts.some((t) => t?.includes('CPU: 42 percent'))).toBe(true);
  });

  it('renders a below-graph meter bar filled to the current value, per row', () => {
    const { container } = render(<SystemResourceStrip samples={[makeSample({ cpuPct: 42 })]} hasVram={false} loading={false} />);

    const fills = container.querySelectorAll('.system-resource-strip__meter-fill');
    expect(fills.length).toBe(2);
    expect((fills[0] as HTMLElement).style.width).toBe('42%');
  });

  it('meter fill re-renders to a new width as the trailing sample changes (CSS transition animates the change)', () => {
    const { container, rerender } = render(
      <SystemResourceStrip samples={[makeSample({ cpuPct: 20 })]} hasVram={false} loading={false} />
    );
    const fillBefore = container.querySelector('.system-resource-strip__meter-fill') as HTMLElement;
    expect(fillBefore.style.width).toBe('20%');

    rerender(<SystemResourceStrip samples={[makeSample({ cpuPct: 20 }), makeSample({ cpuPct: 65 })]} hasVram={false} loading={false} />);
    const fillAfter = container.querySelector('.system-resource-strip__meter-fill') as HTMLElement;
    expect(fillAfter.style.width).toBe('65%');
  });

  it('meter fill is empty while loading', () => {
    const { container } = render(<SystemResourceStrip samples={[]} hasVram={false} loading />);

    const fill = container.querySelector('.system-resource-strip__meter-fill') as HTMLElement;
    expect(fill.style.width).toBe('0%');
  });
});
