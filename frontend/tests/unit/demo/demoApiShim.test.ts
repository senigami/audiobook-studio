import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { installDemoApiShim } from '@/demo/demoApiShim';
import type { DemoApiFixtures } from '@/demo/demoApiShim';

const fixtures: DemoApiFixtures = {
  '/api/projects': [{ id: 'p1', name: 'Test Project' }],
  '/api/home': { status: 'ok', projects: [] },
};

let originalFetch: typeof window.fetch;
let uninstall: () => void;

beforeEach(() => {
  originalFetch = window.fetch;
  uninstall = installDemoApiShim(fixtures);
});

afterEach(() => {
  uninstall();
  // Paranoia: restore if test forgot
  window.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// 1. GET /api/projects returns fixture JSON
// ---------------------------------------------------------------------------
describe('demoApiShim — GET with fixture', () => {
  it('returns fixture body with status 200', async () => {
    const res = await window.fetch('/api/projects');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([{ id: 'p1', name: 'Test Project' }]);
  });
});

// ---------------------------------------------------------------------------
// 2. Unknown GET returns {} with warn
// ---------------------------------------------------------------------------
describe('demoApiShim — GET without fixture', () => {
  it('returns empty object and logs a warning', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const res = await window.fetch('/api/unknown-route');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({});

    // Should warn at least once
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toMatch(/demo.*No fixture/);

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 3. POST returns 403 and fires demo-blocked-action
// ---------------------------------------------------------------------------
describe('demoApiShim — POST blocked', () => {
  it('returns 403 and fires demo-blocked-action event', async () => {
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('demo-blocked-action', handler);

    const res = await window.fetch('/api/projects', { method: 'POST', body: '{}' });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.demo).toBe(true);
    expect(body.detail).toBe('demo mode');

    expect(events.length).toBe(1);
    expect(events[0].detail.path).toBe('/api/projects');
    expect(events[0].detail.method).toBe('POST');

    window.removeEventListener('demo-blocked-action', handler);
  });
});

// ---------------------------------------------------------------------------
// 3b. Request object input: method comes from the Request, not just init
// ---------------------------------------------------------------------------
describe('demoApiShim — Request object input', () => {
  it('blocks a POST carried by a Request object (no init)', async () => {
    const res = await window.fetch(new Request('http://localhost/api/projects', { method: 'POST' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.demo).toBe(true);
  });

  it('serves a fixture for a GET Request object', async () => {
    const res = await window.fetch(new Request('http://localhost/api/projects'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'p1', name: 'Test Project' }]);
  });
});

// ---------------------------------------------------------------------------
// 4. Non-/api/ URL passes through to original fetch
// ---------------------------------------------------------------------------
describe('demoApiShim — non-api passthrough', () => {
  it('passes through requests that do not start with /api/', async () => {
    let passthroughCalled = false;
    // Replace original fetch with a spy AFTER shim is installed
    // The shim captured originalFetch on install, so we need to update the
    // original that the shim holds — reinstall with a mock as the original.
    uninstall();
    const mockOriginal = vi.fn().mockResolvedValue(
      new Response('{"passed":true}', { status: 200 }),
    );
    window.fetch = mockOriginal;
    uninstall = installDemoApiShim(fixtures);

    const res = await window.fetch('/static/some-asset.js');
    expect(mockOriginal).toHaveBeenCalledWith('/static/some-asset.js', undefined);
    const body = await res.json();
    expect(body.passed).toBe(true);

    passthroughCalled = true;
    expect(passthroughCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4b. warnedRoutes resets across install/uninstall cycles (not module-global)
// ---------------------------------------------------------------------------
describe('demoApiShim — warnedRoutes scoping', () => {
  it('warns again for the same unknown route on a second install stacked over the first (no uninstall in between)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // First cycle (installed in beforeEach) — warns once for the unknown route.
    await window.fetch('/api/still-unknown');
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // Install again WITHOUT uninstalling the previous instance first (e.g. two
    // overlapping mount cycles). A module-global warnedRoutes set would still
    // consider this route "already warned" from the first instance and stay
    // silent; a per-install set should warn again.
    const secondUninstall = installDemoApiShim(fixtures);

    await window.fetch('/api/still-unknown');
    expect(warnSpy).toHaveBeenCalledTimes(2);

    secondUninstall();
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 5. Uninstall restores original fetch
// ---------------------------------------------------------------------------
describe('demoApiShim — uninstall', () => {
  it('restores original fetch after uninstall', () => {
    expect(window.fetch).not.toBe(originalFetch);
    uninstall();
    expect(window.fetch).toBe(originalFetch);
  });
});
