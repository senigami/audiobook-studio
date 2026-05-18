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

export type WebsocketDebugSnapshot = {
  listener: string;
  receivedAt: string;
  raw: string;
  type?: string;
  source?: string;
  scope?: string;
  classification?: string;
  job_id?: string;
  project_id?: string;
  chapter_id?: string;
  status?: string;
  progress?: number;
  reason_code?: string;
};

type StudioDebugWindow = Window & {
  __studioDebugSnapshots?: StudioDebugSnapshot[];
  __studioDebugLast?: StudioDebugSnapshot | null;
};

type WebsocketDebugWindow = Window & {
  __websocketRecentMessages?: WebsocketDebugSnapshot[];
  __websocketLastMessage?: WebsocketDebugSnapshot | null;
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

export const recordWebsocketDebugMessage = (listener: string, payload: unknown, raw?: string) => {
  if (typeof window === 'undefined') return;

  const win = window as WebsocketDebugWindow;
  const entry: WebsocketDebugSnapshot = {
    listener,
    receivedAt: new Date().toISOString(),
    raw: raw ?? (typeof payload === 'string' ? payload : JSON.stringify(payload)),
  };

  if (payload && typeof payload === 'object') {
    const data = payload as Record<string, any>;
    if (data.type !== undefined) entry.type = data.type;
    if (data.source !== undefined) entry.source = data.source;
    if (data.scope !== undefined) entry.scope = data.scope;
    if (data.classification !== undefined) entry.classification = data.classification;
    if (data.job_id !== undefined) entry.job_id = data.job_id;
    if (data.project_id !== undefined) entry.project_id = data.project_id;
    if (data.chapter_id !== undefined) entry.chapter_id = data.chapter_id;
    if (data.status !== undefined) entry.status = data.status;
    if (data.progress !== undefined) entry.progress = data.progress;
    if (data.reason_code !== undefined) entry.reason_code = data.reason_code;
  }

  if (!Array.isArray(win.__websocketRecentMessages)) {
    win.__websocketRecentMessages = [];
  }

  win.__websocketRecentMessages.push(entry);
  if (win.__websocketRecentMessages.length > 400) {
    win.__websocketRecentMessages.shift();
  }
  win.__websocketLastMessage = entry;
};
