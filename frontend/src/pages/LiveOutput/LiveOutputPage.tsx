import React from 'react';
import { Terminal } from 'lucide-react';
import { LiveOutputTable } from '@/components/LiveOutputTable';

export const LiveOutputPage: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--header-height, 72px) - 2rem)', gap: '1rem', minHeight: 0 }}>
      <section style={{
        padding: '1.25rem 1.5rem',
        borderRadius: '20px',
        border: '1px solid var(--border)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(246,248,252,0.92))',
        boxShadow: 'var(--shadow-md)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
          <Terminal size={18} color="var(--accent)" />
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Live Output Stream</h1>
        </div>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Internal audit log of normalized websocket events received by the client.
        </p>
      </section>

      <div style={{ flex: 1, minHeight: 0 }}>
        <LiveOutputTable />
      </div>
    </div>
  );
};
