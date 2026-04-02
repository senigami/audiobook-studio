export function isProgressDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const win = window as Window & { __ABF_PROGRESS_DEBUG__?: boolean };
    return (
      win.__ABF_PROGRESS_DEBUG__ === true
      || window.localStorage?.getItem('abf-progress-debug') === '1'
      || window.location?.search?.includes('progressDebug=1')
    );
  } catch {
    return false;
  }
}

export function progressDebug(scope: string, payload: Record<string, unknown>): void {
  const win = window as Window & {
    __ABF_PROGRESS_LOG__?: Array<{ scope: string; payload: Record<string, unknown>; at: string }>
    __ABF_DUMP_PROGRESS_LOG__?: () => Array<{ scope: string; payload: Record<string, unknown>; at: string }>
  };
  if (!win.__ABF_PROGRESS_LOG__) {
    win.__ABF_PROGRESS_LOG__ = [];
  }
  const entry = {
    scope,
    payload,
    at: new Date().toISOString(),
  };
  win.__ABF_PROGRESS_LOG__.push(entry);
  if (win.__ABF_PROGRESS_LOG__.length > 500) {
    win.__ABF_PROGRESS_LOG__.splice(0, win.__ABF_PROGRESS_LOG__.length - 500);
  }
  win.__ABF_DUMP_PROGRESS_LOG__ = () => [...(win.__ABF_PROGRESS_LOG__ || [])];
  if (!isProgressDebugEnabled()) return;
  console.log(`[progress-debug] ${scope}`, payload);
}
