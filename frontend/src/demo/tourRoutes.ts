/**
 * The public demo ships the app tour only. The flag is set at build time
 * (vite.demo.config.ts); it is unset under vitest, so tests opt in with
 * vi.stubEnv.
 */
export const TOUR_STAGE_ID = 'site-mockup';

export const isTourOnly = (): boolean => import.meta.env.VITE_DEMO_TOUR_ONLY === 'true';

/** Where a tour-only build should send a hash, or null when it is already the tour. */
export const tourRedirectTarget = (hash: string): string | null => {
  const [path, query] = hash.replace(/^#/, '').split('?');
  if (path === `/stage/${TOUR_STAGE_ID}`) return null;
  return `#/stage/${TOUR_STAGE_ID}${query ? `?${query}` : ''}`;
};
