import React from 'react';
import { ApiGuidePanel } from '@/pages/Integrations/components/ApiGuidePanel';

export const IntegrationsPage: React.FC = () => {
  return (
    <section aria-labelledby="integrations-title" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <header>
        <h1 id="integrations-title" style={{ margin: 0, fontSize: '2rem', color: 'var(--text-primary)' }}>
          Integrations
        </h1>
      </header>

      <ApiGuidePanel />
    </section>
  );
};
