export const APP_TOAST_EVENT = 'studio-toast';

/**
 * Default duration (ms) a toast stays visible. Delete-adjacent call sites that
 * schedule an undoable action reuse this same window so the action commits
 * right as the toast (and its Undo affordance) disappears.
 */
export const TOAST_VISIBLE_MS = 4000;

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export function emitToast(message: string, action?: ToastAction): void {
  window.dispatchEvent(new CustomEvent(APP_TOAST_EVENT, { detail: { message, action } }));
}
