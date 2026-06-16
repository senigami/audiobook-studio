import { describe, expect, it } from 'vitest';

import { buildNavGroups, getActiveNavId } from '@/app/layout/navData';

describe('navData', () => {
  it('returns nav groups in the expected order', () => {
    expect(buildNavGroups(false).map((group) => group.group)).toEqual([
      'CREATE',
      'MONITOR',
      'PLATFORM',
      'MANAGE',
    ]);
  });

  it('includes the developer group only when dev mode is enabled', () => {
    expect(buildNavGroups(false).map((group) => group.group)).not.toContain('DEVELOPER');

    expect(buildNavGroups(true).map((group) => group.group)).toEqual([
      'CREATE',
      'MONITOR',
      'PLATFORM',
      'MANAGE',
      'DEVELOPER',
    ]);
  });

  it.each([
    ['/', ''],
    ['/library', 'library'],
    ['/project/abc', 'library'],
    ['/project/abc/chapters', 'library'],
    ['/chapter/abc', 'library'],
    ['/chapter/abc/edit', 'library'],
    ['/book/future-title', 'library'],
    ['/voices', 'voices'],
    ['/voices/search', 'voices'],
    ['/activity', 'activity'],
    ['/activity/queue', 'activity'],
    ['/queue', 'activity'],
    ['/queue/history', 'activity'],
    ['/engines', 'engines'],
    ['/engines/plugins', 'engines'],
    ['/integrations', 'integrations'],
    ['/settings', 'settings'],
    ['/settings/general', 'settings'],
    ['/progress-test', 'progress-test'],
    ['/event-stream', 'event-stream'],
    ['/unknown', 'library'],
  ])('maps %s to %s', (pathname, expected) => {
    expect(getActiveNavId(pathname)).toBe(expected);
  });
});
