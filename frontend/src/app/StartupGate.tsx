import { useStartupOverlay } from '@/hooks/useStartupOverlay';

interface StartupGateProps {
  loading: boolean;
  error: string | null | undefined;
  hasInitialData: boolean;
  startupMessage: string;
  startupDetail?: string;
  onRetry: () => void;
}

/**
 * Full-screen startup overlay shown while the initial `/api/home` fetch is
 * pending (or retrying after a failure). Renders nothing once loading clears.
 */
export function StartupGate({ loading, error, hasInitialData, startupMessage, startupDetail, onRetry }: StartupGateProps) {
  const showStartupCopy = useStartupOverlay(loading);

  if (!loading) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--glass-surface-light)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div
        style={{
          padding: '1.25rem 1.5rem',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.9rem',
          color: 'var(--text-primary)',
          fontWeight: 700,
          maxWidth: 'calc(100vw - 2rem)',
        }}
      >
        {error ? (
          <div
            role="alert"
            aria-live="assertive"
            style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', flexWrap: 'wrap', minWidth: 0 }}
          >
            <div
              data-testid="startup-error-indicator"
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: '2px solid var(--danger, #d64545)',
                flexShrink: 0,
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0 }}>
              <span>Couldn't reach Audiobook Studio</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                {/* The 1s startup poll only retries automatically before the first
                    successful load (!hasInitialData) - a later refetch failure (e.g. after
                    a job-complete event) does not re-arm it, so that copy is omitted then.
                    Note: the em dash/ellipsis below must stay inside a JS string literal
                    (not bare JSX text) for the \uXXXX escapes to actually decode - see F15's
                    original bug where a bare-JSX-text escape rendered literally. */}
                {error}{!hasInitialData ? ' — retrying automatically…' : ''}
              </span>
            </div>
            <button
              type="button"
              onClick={onRetry}
              data-testid="startup-retry-button"
              style={{
                marginLeft: '0.5rem',
                padding: '0.4rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--surface-hover, transparent)',
                color: 'var(--text-primary)',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Retry now
            </button>
          </div>
        ) : (
          <>
            <div
              className="animate-spin"
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: '2px solid var(--accent-glow)',
                borderTopColor: 'var(--action-primary)',
              }}
            />
            {showStartupCopy && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minHeight: '2.1rem' }}>
                <span>{startupMessage}</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', minHeight: '1.1rem' }}>
                  {startupDetail || ' '}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
