import { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * useFocusTrap — traps Tab/Shift-Tab inside `ref` while `isOpen` is true.
 * Focuses the first focusable element on open and restores the trigger element's
 * focus on close. Callers may also handle Escape themselves; this hook does NOT
 * call onClose — it only manages focus.
 *
 * @param ref    - RefObject pointing at the dialog/panel container element.
 * @param isOpen - Whether the overlay is currently visible.
 */
export function useFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  isOpen: boolean
): void {
  const previousFocusRef = useRef<Element | null>(null);

  // Capture the currently-focused element before opening so we can restore it.
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement;
    }
  }, [isOpen]);

  // Focus the first focusable element when the modal opens.
  useEffect(() => {
    if (!isOpen || !ref.current) return;
    const first = ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)[0];
    first?.focus();
  }, [isOpen, ref]);

  // Restore focus when the modal closes.
  useEffect(() => {
    if (isOpen) return;
    const el = previousFocusRef.current;
    if (el && 'focus' in el) {
      (el as HTMLElement).focus();
    }
    previousFocusRef.current = null;
  }, [isOpen]);

  // Trap Tab/Shift-Tab inside the container.
  useEffect(() => {
    if (!isOpen || !ref.current) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !ref.current) return;

      const focusable = Array.from(
        ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter(el => !el.closest('[aria-hidden="true"]'));

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, ref]);
}
