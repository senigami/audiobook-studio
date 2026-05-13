import { describe, expect, it } from 'vitest';
import { formatEngineTestGeneratedAt } from '@/pages/Settings/components/EngineCard';

describe('formatEngineTestGeneratedAt', () => {
  it('formats unix seconds as a locale string', () => {
    const output = formatEngineTestGeneratedAt(1710000000);
    expect(output).not.toBe('Unknown');
    expect(output).not.toContain('Invalid Date');
  });

  it('formats ISO timestamps as a locale string', () => {
    const output = formatEngineTestGeneratedAt('2024-03-09T12:34:56Z');
    expect(output).not.toBe('Unknown');
    expect(output).not.toContain('Invalid Date');
  });
});
