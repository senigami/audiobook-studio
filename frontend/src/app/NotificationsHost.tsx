import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import { useToast } from '@/hooks/useToast';
import { APP_TOAST_EVENT, type ToastAction } from '@/utils/toast';
import type { ToastState } from '@/hooks/useToast';

export interface ConfirmConfig {
  title: string;
  message: string;
  onConfirm: () => void;
  isDestructive?: boolean;
  confirmText?: string;
}

/**
 * Owns toast + confirm-modal state for the app shell, including the global
 * `APP_TOAST_EVENT` listener that lets any part of the app trigger a toast
 * without prop-drilling `showToast` everywhere.
 */
export function useNotifications() {
  const [confirmConfig, setConfirmConfig] = useState<ConfirmConfig | null>(null);
  const { toast, showToast, dismissToast } = useToast();

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string; action?: ToastAction }>).detail;
      if (detail?.message) {
        showToast(detail.message, detail.action);
      }
    };
    window.addEventListener(APP_TOAST_EVENT, handler);
    return () => window.removeEventListener(APP_TOAST_EVENT, handler);
  }, [showToast]);

  return { confirmConfig, setConfirmConfig, toast, showToast, dismissToast };
}

interface NotificationsHostProps {
  confirmConfig: ConfirmConfig | null;
  onDismissConfirm: () => void;
  toast: ToastState | null;
  onDismissToast: () => void;
}

export function NotificationsHost({ confirmConfig, onDismissConfirm, toast, onDismissToast }: NotificationsHostProps) {
  return (
    <>
      <ConfirmModal
        isOpen={!!confirmConfig}
        title={confirmConfig?.title || ''}
        message={confirmConfig?.message || ''}
        onConfirm={() => {
          confirmConfig?.onConfirm();
          onDismissConfirm();
        }}
        onCancel={onDismissConfirm}
        isDestructive={confirmConfig?.isDestructive}
        confirmText={confirmConfig?.confirmText}
      />

      {/* Simple Toast — always-mounted live region so AT announces the message */}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, pointerEvents: 'none' }}
      >
        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
          {toast?.visible ? toast.message : ''}
        </span>
      </div>
      <AnimatePresence>
        {toast?.visible && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            style={{
              position: 'fixed',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 9999,
              background: 'var(--as-ink)',
              color: 'var(--text-on-accent)',
              padding: '12px 20px',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '0.9rem',
              fontWeight: 600,
              minWidth: '300px',
              maxWidth: 'calc(100vw - 2rem)',
              justifyContent: 'space-between',
              border: '1px solid var(--glass-border)'
            }}
          >
            <span style={{ minWidth: 0, overflowWrap: 'break-word' }}>{toast.message}</span>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action?.onClick();
                  onDismissToast();
                }}
                style={{
                  background: 'var(--action-primary)',
                  color: 'var(--text-on-accent)',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                {toast.action.label}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
