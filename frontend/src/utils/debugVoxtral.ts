function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem('debug_voxtral_progress') === '1') return true;
    return new URLSearchParams(window.location.search).get('debug_voxtral_progress') === '1';
  } catch {
    return false;
  }
}

export function logVoxtralDebug(scope: string, payload: unknown): void {
  if (!isDebugEnabled()) return;
  console.info(`[voxtral-debug ${new Date().toISOString()}] ${scope}`, payload);
}

