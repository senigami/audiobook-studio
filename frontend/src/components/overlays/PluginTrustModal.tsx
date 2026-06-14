import React, { useId, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

export interface PluginPreviewInfo {
  engine_id: string;
  display_name: string;
  version?: string | null;
  requirements: string[];
}

interface PluginTrustModalProps {
  isOpen: boolean;
  preview: PluginPreviewInfo | null;
  /** "import" = new plugin upload; "install-deps" = installing deps for existing plugin */
  mode: 'import' | 'install-deps';
  onConfirm: () => void;
  onCancel: () => void;
}

function isRemoteSource(line: string): boolean {
  const l = line.toLowerCase();
  return l.startsWith('git+') || l.startsWith('http://') || l.startsWith('https://');
}

export const PluginTrustModal: React.FC<PluginTrustModalProps> = ({
  isOpen,
  preview,
  mode,
  onConfirm,
  onCancel,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(dialogRef, isOpen && preview !== null);

  if (!preview) return null;

  const remoteLines = preview.requirements.filter(isRemoteSource);
  const hasRemote = remoteLines.length > 0;
  const actionLabel = mode === 'import' ? 'Install Plugin' : 'Install Dependencies';

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--overlay-backdrop)',
              backdropFilter: 'blur(8px)',
            }}
          />

          {/* Modal */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '520px',
              background: 'var(--surface)',
              borderRadius: '20px',
              boxShadow: 'var(--shadow-xl)',
              border: '1px solid var(--border)',
              padding: '2rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'var(--warning-tint-bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--warning-text)',
                }}
              >
                <ShieldAlert size={24} />
              </div>
              <button
                onClick={onCancel}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                }}
                aria-label="Cancel"
              >
                <X size={20} />
              </button>
            </div>

            {/* Title + body */}
            <div>
              <h3 id={titleId} style={{ margin: '0 0 0.4rem 0', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {mode === 'import' ? 'Trust this plugin?' : 'Install dependencies?'}
              </h3>
              <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                Installing a plugin runs third-party code with the <strong>same permissions as Studio</strong> — including access to your files and network. Only install plugins you trust.
              </p>
            </div>

            {/* Plugin identity */}
            <div
              style={{
                padding: '0.85rem 1rem',
                borderRadius: '12px',
                background: 'var(--surface-dim)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.3rem',
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Engine</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{preview.display_name}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>ID</span>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{preview.engine_id}</span>
                {preview.version && (
                  <>
                    <span style={{ color: 'var(--text-muted)' }}>·</span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>v{preview.version}</span>
                  </>
                )}
              </div>
            </div>

            {/* Dependency list */}
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                Dependencies ({preview.requirements.length})
              </div>
              {preview.requirements.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>None declared.</p>
              ) : (
                <div
                  style={{
                    maxHeight: '160px',
                    overflowY: 'auto',
                    borderRadius: '10px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-code)',
                  }}
                >
                  {preview.requirements.map((line, i) => {
                    const remote = isRemoteSource(line);
                    return (
                      <div
                        key={i}
                        style={{
                          padding: '0.35rem 0.75rem',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          fontSize: '0.78rem',
                          lineHeight: 1.5,
                          color: remote ? 'var(--warning)' : 'var(--text-code-muted)',
                          background: remote ? 'var(--warning-tint-bg)' : 'transparent',
                          borderBottom: i < preview.requirements.length - 1 ? '1px solid var(--surface-code-border)' : 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        {remote && (
                          <span
                            title="Remote code source (git+/URL)"
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 900,
                              background: 'var(--warning-tint-border)',
                              color: 'var(--warning)',
                              padding: '1px 4px',
                              borderRadius: '3px',
                              letterSpacing: '0.04em',
                              flexShrink: 0,
                            }}
                          >
                            REMOTE
                          </span>
                        )}
                        <span style={{ wordBreak: 'break-all' }}>{line}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {hasRemote && (
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: 'var(--warning-text)', lineHeight: 1.5 }}>
                  One or more dependencies pull code directly from a remote URL (highlighted above). These execute immediately at install time.
                </p>
              )}
            </div>

            {/* Note about signing */}
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Plugins run unsandboxed. Plugin signing and verified-publisher trust indicators are planned for a future release.
            </p>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '0.25rem' }}>
              <button
                onClick={onCancel}
                className="btn-ghost"
                style={{ flex: 1, padding: '0.75rem', borderRadius: '12px' }}
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                style={{
                  flex: 1,
                  padding: '0.75rem',
                  borderRadius: '12px',
                  background: hasRemote ? 'var(--warning-text-strong)' : 'var(--accent)',
                  color: 'var(--text-on-accent)',
                  border: 'none',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                {actionLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
