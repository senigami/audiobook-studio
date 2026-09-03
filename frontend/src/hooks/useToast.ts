import { useCallback, useEffect, useRef, useState } from 'react';
import { TOAST_VISIBLE_MS, type ToastAction } from '@/utils/toast';

export interface ToastState {
  message: string;
  visible: boolean;
  action?: ToastAction;
}

export const useToast = () => {
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, action?: ToastAction) => {
    // Clear any pending timeout before setting a new one
    if (toastTimeoutRef.current !== null) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ message, visible: true, action });
    toastTimeoutRef.current = setTimeout(() => setToast(prev => prev ? { ...prev, visible: false } : null), TOAST_VISIBLE_MS);
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    return () => {
      // Clear any pending toast timeout on unmount
      if (toastTimeoutRef.current !== null) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  return { toast, showToast, dismissToast };
};
