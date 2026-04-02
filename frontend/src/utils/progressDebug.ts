type ProgressDebugEntry = {
    scope: string;
    at: string;
    payload: Record<string, unknown>;
};

declare global {
    interface Window {
        __ABF_PROGRESS_LOG__?: ProgressDebugEntry[];
        __ABF_DUMP_PROGRESS_LOG__?: () => ProgressDebugEntry[];
        __ABF_PROGRESS_DEBUG__?: boolean;
    }
}

const KEY = 'abf-progress-debug';
const LIMIT = 500;

const isEnabled = () => {
    if (typeof window === 'undefined') return false;
    const storageEnabled = typeof window.localStorage?.getItem === 'function'
        ? window.localStorage.getItem(KEY) === '1'
        : false;
    return window.__ABF_PROGRESS_DEBUG__ === true || storageEnabled;
};

export function logProgress(scope: string, payload: Record<string, unknown>) {
    if (typeof window === 'undefined' || !isEnabled()) return;

    const entry: ProgressDebugEntry = {
        scope,
        at: new Date().toISOString(),
        payload,
    };

    const log = window.__ABF_PROGRESS_LOG__ ?? [];
    log.push(entry);
    if (log.length > LIMIT) {
        log.splice(0, log.length - LIMIT);
    }
    window.__ABF_PROGRESS_LOG__ = log;
    window.__ABF_DUMP_PROGRESS_LOG__ = () => [...(window.__ABF_PROGRESS_LOG__ ?? [])];
    console.log('[abf-progress]', entry);
}
