import React from 'react';
import { demoStages } from './demoStages';

// ---------------------------------------------------------------------------
// Stage index grid

const IndexCard: React.FC<{ href: string; title: string; description: string; accent?: boolean }> = ({
  href, title, description, accent,
}) => (
  <a href={href} style={{ textDecoration: 'none' }}>
    <div
      style={{
        background: accent ? 'var(--accent-tint-bg)' : 'var(--surface)',
        border: `1px solid ${accent ? 'var(--accent-tint-border)' : 'var(--border)'}`,
        borderRadius: 12,
        padding: '1.25rem',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
        height: '100%',
      }}
      onMouseEnter={e =>
        ((e.currentTarget as HTMLDivElement).style.borderColor = 'var(--action-primary)')
      }
      onMouseLeave={e =>
        ((e.currentTarget as HTMLDivElement).style.borderColor = accent
          ? 'var(--accent-tint-border)'
          : 'var(--border)')
      }
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: '1rem',
          color: accent ? 'var(--action-primary)' : 'var(--text-primary)',
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {description}
      </div>
    </div>
  </a>
);

export const StageIndex: React.FC = () => (
  <div>
    <h1
      style={{
        fontSize: '1.4rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: '1.25rem',
      }}
    >
      Choose a demo stage
    </h1>
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: '1rem',
      }}
    >
      {demoStages.map(stage => (
        <IndexCard
          key={stage.id}
          href={`#/stage/${stage.id}`}
          title={stage.title}
          description={stage.description}
        />
      ))}
      <IndexCard
        href="#/styleguide"
        title="Design Spec Sheet"
        description="Tokens, type rules, component states, and proposed redesign directions — a storybook-style reference for evaluating theming and design decisions."
        accent
      />
    </div>
  </div>
);
