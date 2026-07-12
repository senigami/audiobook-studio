/**
 * Task 011 — persistence for the segment-render-monitor "peek strip"
 * dismissal. One boolean per chapter job, matching the get/set-with-try/catch
 * localStorage pattern already used by `railState.ts` (rail collapsed/width)
 * rather than inventing a new persistence convention.
 *
 * Deliberately NOT reactive across tabs/components (no `useSyncExternalStore`
 * subscription like `railState.ts`'s rail state) — the peek strip has a
 * single consumer (`ActivityPage`), so a plain get/set pair is enough.
 */
const STORAGE_PREFIX = 'studio-peek-strip-dismissed:';

export function isPeekStripDismissed(jobId: string): boolean {
  try {
    return localStorage.getItem(STORAGE_PREFIX + jobId) === 'true';
  } catch {
    return false;
  }
}

export function setPeekStripDismissed(jobId: string, dismissed: boolean): void {
  try {
    if (dismissed) {
      localStorage.setItem(STORAGE_PREFIX + jobId, 'true');
    } else {
      localStorage.removeItem(STORAGE_PREFIX + jobId);
    }
  } catch {
    // ignore storage errors (private browsing / quota) — dismissal degrades
    // to session-only in that case, same failure mode as railState.ts.
  }
}
