const isTruthy = (value: string | null | undefined) => {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
};

const readStorageFlag = (key: string) => {
  try {
    return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
};

const readQueryFlag = () => {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return (
    isTruthy(params.get('debug'))
    || isTruthy(params.get('studioDebug'))
    || isTruthy(params.get('studio-debug'))
  );
};

export const shouldEnableStudioDebugLogging = () =>
  isTruthy(readStorageFlag('studioDebug'))
  || isTruthy(readStorageFlag('studio-debug'))
  || readQueryFlag();

export type StudioDebugSnapshot = {
  tag: string;
  timestamp: number;
  payload: unknown;
};

type StudioDebugWindow = Window & {
  __studioDebugSnapshots?: StudioDebugSnapshot[];
  __studioDebugLast?: StudioDebugSnapshot | null;
};

export const recordStudioDebugSnapshot = (tag: string, payload: unknown) => {
  if (!shouldEnableStudioDebugLogging() || typeof window === 'undefined') return;

  const win = window as StudioDebugWindow;
  const entry: StudioDebugSnapshot = {
    tag,
    timestamp: Date.now(),
    payload,
  };

  if (!Array.isArray(win.__studioDebugSnapshots)) {
    win.__studioDebugSnapshots = [];
  }

  win.__studioDebugSnapshots.push(entry);
  if (win.__studioDebugSnapshots.length > 200) {
    win.__studioDebugSnapshots.shift();
  }
  win.__studioDebugLast = entry;
  console.warn(`[${tag}]`, payload);
};
