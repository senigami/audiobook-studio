import React from 'react';
import { EnginesPanel } from '@/pages/Engines/components/EnginesPanel';

interface EnginesPageProps {
  startupReady?: boolean;
  onRefresh?: () => void | Promise<void>;
  onShowNotification?: (message: string) => void;
}

export const EnginesPage: React.FC<EnginesPageProps> = ({ startupReady = true, onRefresh, onShowNotification }) => {
  return (
    <section aria-labelledby="engines-title" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <header>
        <h1 id="engines-title" style={{ margin: 0, fontSize: '2rem', color: 'var(--text-primary)' }}>
          Engines
        </h1>
      </header>

      <EnginesPanel
        startupReady={startupReady}
        onRefresh={onRefresh}
        onShowNotification={onShowNotification}
      />
    </section>
  );
};
