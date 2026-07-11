import React, { useState, useEffect, useCallback } from 'react';
import { EnginesPanel } from '@/pages/Engines/components/EnginesPanel';
import { ServerDiagnostics } from '@/pages/Engines/components/ServerDiagnostics';
import { VoiceModulesPanel } from '@/pages/Engines/components/VoiceModulesPanel';
import { api } from '@/api';
import type { TtsEngine } from '@/types';

type EnginesTab = 'engines' | 'module-settings';

interface EnginesPageProps {
  startupReady?: boolean;
  onRefresh?: () => void | Promise<void>;
  onShowNotification?: (message: string) => void;
}

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '0.45rem 1rem',
  borderRadius: '8px',
  fontWeight: 700,
  fontSize: '0.85rem',
  border: 'none',
  cursor: 'pointer',
  background: active ? 'var(--accent)' : 'transparent',
  color: active ? 'var(--text-on-accent)' : 'var(--text-muted)',
  transition: 'all 0.15s ease',
});

export const EnginesPage: React.FC<EnginesPageProps> = ({ startupReady = true, onRefresh, onShowNotification }) => {
  const [activeTab, setActiveTab] = useState<EnginesTab>('engines');
  const [engines, setEngines] = useState<TtsEngine[]>([]);
  const [enginesLoading, setEnginesLoading] = useState(false);

  const loadEngines = useCallback(async () => {
    if (!startupReady) return;
    setEnginesLoading(true);
    try {
      const data = await api.fetchEngines();
      if (Array.isArray(data)) setEngines(data);
    } catch {
      // silently degrade — EnginesPanel shows its own error
    } finally {
      setEnginesLoading(false);
    }
  }, [startupReady]);

  useEffect(() => {
    void loadEngines();
  }, [loadEngines]);

  const handleRefreshAll = useCallback(async () => {
    await Promise.all([Promise.resolve(onRefresh?.()), loadEngines()]);
  }, [onRefresh, loadEngines]);

  return (
    <section aria-labelledby="engines-title" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <h1 id="engines-title" style={{ margin: 0, fontSize: '2rem', color: 'var(--text-primary)' }}>
          Engines
        </h1>
        <div
          role="tablist"
          aria-label="Engines sections"
          style={{
            display: 'flex',
            gap: '4px',
            background: 'var(--surface-light)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            padding: '4px',
          }}
        >
          <button
            role="tab"
            aria-selected={activeTab === 'engines'}
            onClick={() => setActiveTab('engines')}
            style={tabStyle(activeTab === 'engines')}
          >
            Engines
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'module-settings'}
            onClick={() => setActiveTab('module-settings')}
            style={tabStyle(activeTab === 'module-settings')}
          >
            Module Settings
          </button>
        </div>
      </header>

      {activeTab === 'engines' && (
        <>
          <ServerDiagnostics onRefresh={handleRefreshAll} />
          <EnginesPanel
            startupReady={startupReady}
            onRefresh={handleRefreshAll}
            onShowNotification={onShowNotification}
          />
        </>
      )}

      {activeTab === 'module-settings' && (
        <VoiceModulesPanel
          engines={engines}
          loading={enginesLoading}
          onShowNotification={onShowNotification}
          onRefresh={handleRefreshAll}
        />
      )}
    </section>
  );
};
