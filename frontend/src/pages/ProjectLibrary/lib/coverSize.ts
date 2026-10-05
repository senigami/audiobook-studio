// Cover-size slider state for the Library grid view. Mirrors the Finder-style
// discrete size steps from the demo (frontend/src/demo/stages/siteMockup/panes/library.tsx)
// and persists the chosen index to localStorage, following the existing
// get/set-with-try/catch pattern used by frontend/src/utils/devMode.ts and
// frontend/src/utils/railState.ts.

export const COVER_SIZE_STORAGE_KEY = 'studio-library-cover-size-idx';

// Discrete cover-display sizes (Finder-style). The slider snaps between these
// so the grid always lands on a clean column width. `col` drives the grid
// track width, `cover` is available for future use if the card itself grows
// a variable cover size.
export const COVER_SIZES = [
    { col: 76, cover: 48 },
    { col: 92, cover: 64 },
    { col: 108, cover: 80 },
    { col: 124, cover: 96 },
    { col: 156, cover: 128 },
    { col: 188, cover: 160 },
    { col: 236, cover: 208 },
    { col: 284, cover: 256 },
] as const;

export const DEFAULT_COVER_SIZE_IDX = 3;

export function clampCoverSizeIdx(idx: number): number {
    if (!Number.isFinite(idx)) return DEFAULT_COVER_SIZE_IDX;
    return Math.min(COVER_SIZES.length - 1, Math.max(0, Math.round(idx)));
}

export function getStoredCoverSizeIdx(): number {
    try {
        const stored = localStorage.getItem(COVER_SIZE_STORAGE_KEY);
        if (stored == null) return DEFAULT_COVER_SIZE_IDX;
        return clampCoverSizeIdx(Number(stored));
    } catch {
        return DEFAULT_COVER_SIZE_IDX;
    }
}

export function setStoredCoverSizeIdx(idx: number): void {
    try {
        localStorage.setItem(COVER_SIZE_STORAGE_KEY, String(clampCoverSizeIdx(idx)));
    } catch {
        // ignore storage errors
    }
}
