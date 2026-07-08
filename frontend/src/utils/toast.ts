export const APP_TOAST_EVENT = 'studio-toast';

export function emitToast(message: string): void {
  window.dispatchEvent(new CustomEvent(APP_TOAST_EVENT, { detail: { message } }));
}
