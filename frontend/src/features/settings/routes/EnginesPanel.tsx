import React, { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import type { TtsEngine } from '../../../types';
import { api } from '../../../api';
import { ConfirmModal } from '../../../components/ConfirmModal';
import { EngineCard } from './EngineCard';

interface EnginesPanelProps {
  onShowNotification?: (message: string) => void;
  onRefresh?: () => void | Promise<void>;
}

export const EnginesPanel: React.FC<EnginesPanelProps> = ({ onShowNotification, onRefresh }) => {
  const [engines, setEngines] = useState<TtsEngine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [installModal, setInstallModal] = useState<{ open: boolean; message: string }>({ open: false, message: '' });

  const loadEngines = async () => {
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
  };

  useEffect(() => {
    loadEngines();
  }, []);

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
      </div>

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
