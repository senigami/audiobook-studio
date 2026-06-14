import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { RefreshCw, FileText, Loader2, Upload } from 'lucide-react';
import type { TtsEngine } from '@/types';
import { api } from '@/api';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import { PluginTrustModal, type PluginPreviewInfo } from '@/components/overlays/PluginTrustModal';
import { EngineCard } from '@/pages/Engines/components/EngineCard';
import { useLiveTtsLogLines } from '@/hooks/useLiveTtsLogLines';

interface EnginesPanelProps {
  onShowNotification?: (message: string) => void;
  onRefresh?: () => void | Promise<void>;
  startupReady?: boolean;
}

export const EnginesPanel: React.FC<EnginesPanelProps> = ({ onShowNotification, onRefresh, startupReady = true }) => {
  const [engines, setEngines] = useState<TtsEngine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [installModal, setInstallModal] = useState<{ open: boolean; message: string }>({ open: false, message: '' });
  const [trustModal, setTrustModal] = useState<{
    open: boolean;
    preview: PluginPreviewInfo | null;
    stagingToken: string | null;
  }>({ open: false, preview: null, stagingToken: null });
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string>('');
  const [fetchingLogs, setFetchingLogs] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);
  // Track the active staging token so we can clean it up if the panel unmounts
  // (e.g. user navigates away) while a trust prompt is still pending.
  const pendingStagingTokenRef = useRef<string | null>(null);
  const { liveLines, markRefreshStart, resetCursor: resetLiveCursor } = useLiveTtsLogLines(showLogs);

  const loadEngines = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.fetchEngines();
      if (Array.isArray(data)) {
        setEngines(data);
        setError(null);
      } else {
        setEngines([]);
        setError('Unexpected engine payload received from the server.');
      }
    } catch (err) {
      setError('Failed to load engines. Ensure the TTS Server is running if enabled.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (startupReady) {
      loadEngines();
    }
  }, [startupReady, loadEngines]);

  const refreshAppState = async () => {
    await Promise.all([
      loadEngines(),
      Promise.resolve(onRefresh?.()),
    ]);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.refreshPlugins();
      await refreshAppState();
      onShowNotification?.('Plugins refreshed successfully.');
    } catch (err) {
      console.error('Refresh failed', err);
      onShowNotification?.('Plugin refresh failed.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleInstallPlugin = () => {
    // Open file selector instead of just showing instructions
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input immediately so re-selecting the same file works.
    if (fileInputRef.current) fileInputRef.current.value = '';

    setImporting(true);
    try {
      const res = await api.previewEnginePlugin(file);
      if (!res.ok || !res.staging_token) {
        onShowNotification?.(res.message || 'Plugin preview failed.');
        return;
      }
      // Show trust modal — user must confirm before we complete the install.
      setTrustModal({
        open: true,
        preview: {
          engine_id: res.engine_id,
          display_name: res.display_name,
          version: res.version ?? null,
          requirements: Array.isArray(res.requirements) ? res.requirements : [],
        },
        stagingToken: res.staging_token,
      });
      pendingStagingTokenRef.current = res.staging_token;
    } catch (err: any) {
      onShowNotification?.(`Import failed: ${err.message || err}`);
    } finally {
      setImporting(false);
    }
  };

  const handleTrustConfirm = async () => {
    const { stagingToken, preview } = trustModal;
    setTrustModal({ open: false, preview: null, stagingToken: null });
    pendingStagingTokenRef.current = null;
    if (!stagingToken) return;

    setImporting(true);
    try {
      const res = await api.confirmEnginePlugin(stagingToken);
      if (res.ok || res.engine_id) {
        onShowNotification?.(`Plugin ${res.engine_id || preview?.engine_id || ''} imported successfully.`);
        await refreshAppState();
      } else {
        onShowNotification?.(res.message || 'Install failed.');
      }
    } catch (err: any) {
      onShowNotification?.(`Install failed: ${err.message || err}`);
    } finally {
      setImporting(false);
    }
  };

  const handleTrustCancel = async () => {
    const { stagingToken } = trustModal;
    setTrustModal({ open: false, preview: null, stagingToken: null });
    pendingStagingTokenRef.current = null;
    if (!stagingToken) return;
    try {
      await api.cancelEnginePluginStaging(stagingToken);
    } catch {
      // Best-effort cleanup; silence errors.
    }
  };

  // On unmount, discard any still-pending staged plugin so its extracted
  // directory does not leak on the TTS Server until the next restart sweep.
  useEffect(() => {
    return () => {
      const token = pendingStagingTokenRef.current;
      if (token) {
        pendingStagingTokenRef.current = null;
        void api.cancelEnginePluginStaging(token).catch(() => {});
      }
    };
  }, []);

  const handleFetchLogs = async () => {
    const refreshStartedAfterFrameId = markRefreshStart();
    setFetchingLogs(true);
    setShowLogs(true);
    try {
      // The backend watchdog buffer captures all TTS server output
      const res = await api.fetchEngineLogs('all');
      setLogs(res.logs || '');
      // Reconcile: the backend text is fresh, but preserve live frames that arrived during this fetch.
      resetLiveCursor({ preserveAfterFrameId: refreshStartedAfterFrameId });
      if (!res.logs && res.message) {
        onShowNotification?.(res.message);
      }
    } catch (err) {
      onShowNotification?.('Failed to fetch diagnostics logs.');
    } finally {
      setFetchingLogs(false);
    }
  };

  const combinedLogs = useMemo(() => {
    if (liveLines.length === 0) return logs;
    const formatTimestamp = (isoString?: string): string => {
      if (!isoString) return '';
      try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '';
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const ms = String(date.getMilliseconds()).padStart(3, '0');
        return `${hours}:${minutes}:${seconds}.${ms}`;
      } catch {
        return '';
      }
    };

    const liveText = liveLines.map(entry => {
      const timePart = formatTimestamp(entry.timestamp);
      const label = entry.pluginShortName ? entry.pluginShortName.substring(0, 10) : '';
      const prefix = [
        timePart ? `[${timePart}]` : '',
        label ? `[${label}]` : '',
      ].filter(Boolean).join(' ');
      return prefix ? `${prefix} ${entry.line}` : entry.line;
    }).join('\n');

    if (!logs) return liveText;
    return `${logs.endsWith('\n') ? logs : `${logs}\n`}${liveText}`;
  }, [logs, liveLines]);

  useEffect(() => {
    if (!showLogs) return;
    logsEndRef.current?.scrollIntoView({ block: 'end' });
  }, [combinedLogs, showLogs]);

  if (loading && engines.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw size={24} className="spin" style={{ marginBottom: '1rem', opacity: 0.5 }} />
        <p>Discovering engines...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {error && (
        <div style={{ padding: '1rem', borderRadius: '12px', background: 'var(--error-tint-bg)', color: 'var(--error-text-strong)', fontSize: '0.85rem', border: '1px solid var(--error-tint-border)' }}>
          {error}
        </div>
      )}
      {engines.map((engine) => (
        <EngineCard
          key={engine.engine_id}
          engine={engine}
          onUpdate={refreshAppState}
          onShowNotification={onShowNotification}
        />
      ))}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".zip"
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className="btn-glass"
          disabled={importing}
          onClick={handleInstallPlugin}
          style={{ padding: '0.65rem 0.9rem', borderRadius: '10px', border: '1px solid var(--border)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {importing ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
          {importing ? 'Importing...' : 'Import Plugin (.zip)'}
        </button>
        <button
          type="button"
          className="btn-glass"
          disabled={refreshing}
          onClick={handleRefresh}
          style={{ padding: '0.65rem 0.9rem', borderRadius: '10px', border: '1px solid var(--border)', fontWeight: 800 }}
        >
          {refreshing ? 'Refreshing...' : 'Refresh Plugins'}
        </button>
        <button
          type="button"
          className="btn-glass"
          disabled={fetchingLogs && !showLogs}
          onClick={showLogs ? () => setShowLogs(false) : handleFetchLogs}
          style={{ padding: '0.65rem 0.9rem', borderRadius: '10px', border: '1px solid var(--border)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {fetchingLogs && !showLogs ? <Loader2 size={14} className="spin" /> : <FileText size={14} />}
          {showLogs ? 'Close Diagnostics' : 'View Diagnostics'}
        </button>
      </div>

      {showLogs && (
        <div style={{ marginTop: '0.5rem', animation: 'fade-in 0.2s ease-out' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <FileText size={14} color="var(--text-muted)" />
              <span style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                TTS Server Diagnostics
              </span>
            </div>
          </div>
          <div
            style={{
              background: 'var(--surface-code)',
              color: 'var(--text-code-muted)',
              padding: '1.25rem',
              borderRadius: '16px',
              fontSize: '0.75rem',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              maxHeight: '400px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.5,
              border: '1px solid var(--surface-code-border)',
              boxShadow: 'inset 0 2px 4px var(--progress-track)'
            }}
          >
            {fetchingLogs && !combinedLogs ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
                <Loader2 size={14} className="spin" /> Streaming logs...
              </div>
            ) : combinedLogs || 'No diagnostics captured yet.'}
            <div ref={logsEndRef} aria-hidden="true" />
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={installModal.open}
        title="Install TTS Plugin"
        message={installModal.message}
        onConfirm={() => setInstallModal({ open: false, message: '' })}
        onCancel={() => setInstallModal({ open: false, message: '' })}
        confirmText="Understood"
        isAlert={true}
        isDestructive={false}
      />

      <PluginTrustModal
        isOpen={trustModal.open}
        preview={trustModal.preview}
        mode="import"
        onConfirm={handleTrustConfirm}
        onCancel={handleTrustCancel}
      />
    </div>
  );
};
