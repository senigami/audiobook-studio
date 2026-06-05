import React, { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { api } from '@/api';
import type { TtsEngine } from '@/types';

interface EngineDevPanelProps {
  engine: TtsEngine;
  activeScenario: any | null;
  onScenarioSelect: (scenario: any | null) => void;
  logs: string[];
  onAddLog: (msg: string) => void;
}

export const EngineDevPanel: React.FC<EngineDevPanelProps> = ({ engine, onScenarioSelect, activeScenario, logs, onAddLog }) => {
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.fetchEngineScenarios(engine.engine_id)
      .then(res => setScenarios(res.scenarios || []))
      .catch(err => {
        const msg = err.message || 'Failed to load scenarios';
        setError(msg);
        onAddLog(`Error: ${msg}`);
      })
      .finally(() => setLoading(false));
  }, [engine.engine_id]);

  const handleScenarioSelect = (scenario: any) => {
    onScenarioSelect(scenario);
    onAddLog(`Switched to scenario: ${scenario ? scenario.label : 'Live Data'}`);
  };

  return (
    <div style={{ marginTop: '2rem', borderTop: '2px dashed var(--border)', paddingTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
        <ShieldAlert size={16} color="var(--accent)" />
        <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)' }}>
          Engine Developer Panel
        </h4>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>SCENARIOS</span>
          <button
            onClick={() => handleScenarioSelect(null)}
            style={{
              textAlign: 'left',
              padding: '0.4rem 0.6rem',
              borderRadius: '6px',
              border: !activeScenario ? '1px solid var(--accent)' : '1px solid var(--border)',
              background: !activeScenario ? 'rgba(244, 114, 182, 0.05)' : 'white',
              fontSize: '0.75rem',
              fontWeight: !activeScenario ? 700 : 500,
              cursor: 'pointer',
              color: !activeScenario ? 'var(--accent)' : 'inherit',
              marginBottom: '0.4rem'
            }}
          >
            Live Data
          </button>
          {loading ? (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Loading...</div>
          ) : error ? (
            <div style={{ fontSize: '0.7rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.05)', padding: '0.4rem', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              {error}
            </div>
          ) : scenarios.map(s => (
            <button
              key={s.id}
              onClick={() => handleScenarioSelect(s)}
              style={{
                textAlign: 'left',
                padding: '0.4rem 0.6rem',
                borderRadius: '6px',
                border: activeScenario?.id === s.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                background: activeScenario?.id === s.id ? 'rgba(244, 114, 182, 0.05)' : 'white',
                fontSize: '0.75rem',
                fontWeight: activeScenario?.id === s.id ? 900 : 500,
                cursor: 'pointer',
                color: activeScenario?.id === s.id ? 'var(--accent)' : 'inherit'
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)' }}>DEV CONSOLE</span>
            <button
              onClick={() => setShowJson(!showJson)}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
            >
              {showJson ? 'View Logs' : 'View Raw JSON'}
            </button>
          </div>

          <div style={{
            background: '#0f172a',
            borderRadius: '12px',
            padding: '1rem',
            minHeight: '120px',
            maxHeight: '200px',
            overflowY: 'auto',
            overflowX: 'hidden',
            border: '1px solid #1e293b'
          }}>
            {showJson ? (
              <pre style={{
                margin: 0,
                color: '#38bdf8',
                fontSize: '0.7rem',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                maxWidth: '100%'
              }}>
                {JSON.stringify(engine, null, 2)}
              </pre>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {logs.length === 0 && <div style={{ color: '#64748b', fontSize: '0.75rem', fontStyle: 'italic' }}>No dev logs yet...</div>}
                {logs.map((log, i) => (
                  <div key={i} style={{ color: '#94a3b8', fontSize: '0.7rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{log}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
