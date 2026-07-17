import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart2, Radio, Palette, FileCode, ExternalLink } from 'lucide-react';

interface DevLinkCardProps {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  description: string;
  href: string;
  external?: boolean;
}

const DevLinkCard: React.FC<DevLinkCardProps> = ({ icon: Icon, title, description, href, external }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (external) {
      window.open(href, '_blank', 'noopener,noreferrer');
    } else {
      navigate(href);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '1rem',
        borderRadius: '14px',
        border: '1px solid var(--border)',
        background: 'var(--surface-light)',
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
        <div style={{ color: 'var(--action-primary)', marginTop: '0.1rem' }}>
          <Icon size={20} />
        </div>
        <div>
          <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{title}</h3>
          <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
            {description}
          </p>
        </div>
      </div>
      {external && (
        <div style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
          <ExternalLink size={16} />
        </div>
      )}
    </button>
  );
};

export const DeveloperSettingsPanel: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <DevLinkCard
        icon={BarChart2}
        title="Progress Bar Test"
        description="Interactive test harness for the predictive progress bar component."
        href="/progress-test"
      />
      <DevLinkCard
        icon={Radio}
        title="Event Stream"
        description="Live view of Studio WebSocket events as they arrive from the backend."
        href="/event-stream"
      />
      <DevLinkCard
        icon={Palette}
        title="Design Spec Sheet"
        description="Component styleguide and visual design specification for the Studio UI."
        href="https://senigami.github.io/audiobook-studio/demo/#/styleguide"
        external
      />
      <DevLinkCard
        icon={FileCode}
        title="TTS API Swagger"
        description="OpenAPI documentation for the Studio TTS gateway API."
        href="/api/v1/tts/docs"
        external
      />
    </div>
  );
};
