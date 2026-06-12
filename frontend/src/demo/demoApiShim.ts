/**
 * demoApiShim — intercepts window.fetch for /api/ routes during demo mode.
 *
 * installDemoApiShim wraps the global fetch. Returns an uninstall function.
 * Non-/api/ URLs always pass through to the original fetch.
 */

export interface DemoApiFixtures {
  [route: string]: any; // exact-match pathname → JSON body
}

const warnedRoutes = new Set<string>();

export function installDemoApiShim(fixtures: DemoApiFixtures): () => void {
  const originalFetch = window.fetch;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let pathname: string;
    try {
      // Handle both absolute and relative URLs
      pathname = new URL(url, window.location.href).pathname;
    } catch {
      pathname = url;
    }

    if (!pathname.startsWith('/api/')) {
      return originalFetch(input, init);
    }

    // init.method wins; otherwise honor a Request object's own method.
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();

    if (method !== 'GET') {
      // Fire custom event so shell can toast
      window.dispatchEvent(
        new CustomEvent('demo-blocked-action', { detail: { path: pathname, method } }),
      );
      return new Response(JSON.stringify({ detail: 'demo mode', demo: true }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // GET — look up exact pathname
    if (Object.prototype.hasOwnProperty.call(fixtures, pathname)) {
      return new Response(JSON.stringify(fixtures[pathname]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // No match — warn once, return empty object
    if (!warnedRoutes.has(pathname)) {
      warnedRoutes.add(pathname);
      console.warn(`[demo] No fixture for GET ${pathname} — returning {}`);
    }
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  return () => {
    window.fetch = originalFetch;
    warnedRoutes.clear();
  };
}
