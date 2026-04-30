import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, FileText, Loader2 } from 'lucide-react';
import type { TtsEngine } from '../../../types';
import { api } from '../../../api';
import { ConfirmModal } from '../../../components/ConfirmModal';
import { EngineCard } from './EngineCard';

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
  const [installModal, setInstallModal] = useState<{ open: boolean; message: string }>({ open: false, message: '' });
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<string>('');
  const [fetchingLogs, setFetchingLogs] = useState(false);

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

  const handleInstallPlugin = async () => {
    try {
      const res = await api.installPlugin();
      setInstallModal({ open: true, message: res.message || 'Place your plugin folder in the "plugins/" directory and click Refresh.' });
    } catch (err) {
      onShowNotification?.('Failed to retrieve installation instructions.');
    }
  };

  const handleFetchLogs = async () => {
    setFetchingLogs(true);
    setShowLogs(true);
    try {
      // The backend watchdog buffer captures all TTS server output
      const res = await api.fetchEngineLogs('all');
      setLogs(res.logs || '');
      if (!res.logs && res.message) {
        onShowNotification?.(res.message);
      }
    } catch (err) {
      onShowNotification?.('Failed to fetch diagnostics logs.');
    } finally {
      setFetchingLogs(false);
    }
  };

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
        <div style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#b91c1c', fontSize: '0.85rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
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
        <button
          type="button"
          className="btn-glass"
          onClick={handleInstallPlugin}
          style={{ padding: '0.65rem 0.9rem', borderRadius: '10px', border: '1px solid var(--border)', fontWeight: 800 }}
        >
          Install Plugin
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
          disabled={fetchingLogs}
          onClick={handleFetchLogs}
          style={{ padding: '0.65rem 0.9rem', borderRadius: '10px', border: '1px solid var(--border)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          {fetchingLogs ? <Loader2 size={14} className="spin" /> : <FileText size={14} />}
          {showLogs ? 'Refresh Logs' : 'View Diagnostics'}
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
            <button
              onClick={() => setShowLogs(false)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 700 }}
            >
              Close Diagnostics
            </button>
          </div>
          <div
            style={{
              background: '#1a1a1a',
              color: '#d4d4d4',
              padding: '1.25rem',
              borderRadius: '16px',
              fontSize: '0.75rem',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              maxHeight: '400px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.5,
              border: '1px solid #333',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
            }}
          >
            {fetchingLogs && !logs ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#666' }}>
                <Loader2 size={14} className="spin" /> Streaming logs...
              </div>
            ) : logs || 'No diagnostics captured yet.'}
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
    </div>
  );
};
