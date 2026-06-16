import React, { useState, useEffect } from 'react';
import { Upload, Download, Github, Book, Globe, Shield, Tag, Cpu, Loader2, Plus } from 'lucide-react';
import { api } from '@/api';

interface RegistryPlugin {
  id: string;
  name: string;
  summary: string;
  trust_level: string;
  repo_url: string;
  homepage?: string;
  docs_url?: string;
  icon?: string;
  tags?: string[];
  min_studio?: string;
  compatibility?: string[];
  requirements?: string[];
}

interface OfficialRegistryPanelProps {
  onInstallGithubUrl: (url: string) => void;
  importing: boolean;
}

export const OfficialRegistryPanel: React.FC<OfficialRegistryPanelProps> = ({ onInstallGithubUrl, importing }) => {
  const [plugins, setPlugins] = useState<RegistryPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualUrl, setManualUrl] = useState('');

  useEffect(() => {
    let mounted = true;
    const fetchRegistry = async () => {
      try {
        setLoading(true);
        const data = await api.fetchOfficialPluginRegistry();
        if (mounted) {
          setPlugins(Array.isArray(data) ? data : []);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError('Failed to load official plugin registry.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    void fetchRegistry();
    return () => { mounted = false; };
  }, []);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualUrl.trim()) return;
    onInstallGithubUrl(manualUrl.trim());
    setManualUrl('');
  };

  return (
    <section aria-labelledby="store-section-label" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <h2
          id="store-section-label"
          style={{
            margin: 0,
            fontSize: '0.82rem',
            fontWeight: 900,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Plugin Registry
        </h2>
        <span
          style={{
            fontSize: '0.6rem',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 'var(--radius-round)',
            background: 'var(--accent-tint-bg)',
            color: 'var(--accent-text)',
            border: '1px solid var(--accent-tint-border)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
          aria-label="Official feature"
          data-testid="store-official-chip"
        >
          official
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Loader2 size={24} className="spin" style={{ opacity: 0.5, margin: '0 auto' }} />
          </div>
        ) : error ? (
          <div style={{ padding: '1rem', borderRadius: '12px', background: 'var(--error-tint-bg)', color: 'var(--error-text-strong)', fontSize: '0.85rem', border: '1px solid var(--error-tint-border)' }}>
            {error}
          </div>
        ) : plugins.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No official plugins available.
          </div>
        ) : (
          plugins.map(plugin => (
            <div
              key={plugin.id}
              style={{
                padding: '1.25rem',
                borderRadius: '16px',
                border: '1px solid var(--border)',
                background: 'var(--surface-light)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>{plugin.name}</h3>
                    {plugin.trust_level === 'official' && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--accent-tint-bg)', color: 'var(--accent-text)', border: '1px solid var(--accent-tint-border)', textTransform: 'uppercase' }}>
                        <Shield size={10} /> Official
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{plugin.summary}</p>
                </div>
                <button
                  type="button"
                  className="btn-glass"
                  disabled={importing}
                  aria-label={`Install ${plugin.name}`}
                  onClick={() => onInstallGithubUrl(plugin.repo_url)}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}
                >
                  <Download size={14} />
                  Install
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                {plugin.tags?.map(tag => (
                  <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--surface)', padding: '2px 8px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <Tag size={10} /> {tag}
                  </span>
                ))}
                {plugin.compatibility?.map(comp => (
                  <span key={comp} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--surface)', padding: '2px 8px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <Cpu size={10} /> {comp}
                  </span>
                ))}
              </div>

              {(plugin.requirements && plugin.requirements.length > 0) && (
                <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <strong>Requires:</strong> {plugin.requirements.join(', ')}
                </div>
              )}

              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.75rem' }}>
                {plugin.repo_url && (
                  <a href={plugin.repo_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600 }}>
                    <Github size={12} /> Repository
                  </a>
                )}
                {plugin.homepage && (
                  <a href={plugin.homepage} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600 }}>
                    <Globe size={12} /> Homepage
                  </a>
                )}
                {plugin.docs_url && (
                  <a href={plugin.docs_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: 'var(--accent-text)', textDecoration: 'none', fontWeight: 600 }}>
                    <Book size={12} /> Documentation
                  </a>
                )}
              </div>
            </div>
          ))
        )}

        <div
          style={{
            padding: '1.25rem',
            borderRadius: '16px',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            marginTop: '0.5rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Github size={16} color="var(--text-muted)" />
            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>Install from GitHub</h3>
          </div>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Paste the URL of a compatible GitHub repository to install a third-party plugin.
          </p>
          <form onSubmit={handleManualSubmit} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
            <input
              type="url"
              placeholder="https://github.com/owner/repo.git"
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              disabled={importing}
              required
              style={{
                flex: 1,
                padding: '0.6rem 0.8rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--background)',
                color: 'var(--text)',
                fontSize: '0.85rem'
              }}
            />
            <button
              type="submit"
              className="btn-glass"
              disabled={importing || !manualUrl.trim()}
              aria-label="Install plugin from GitHub URL"
              style={{ padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
            >
              <Plus size={14} />
              Install
            </button>
          </form>
          
          <div
            style={{
              padding: '0.65rem 0.85rem',
              borderRadius: '10px',
              border: '1px solid var(--warning-tint-border)',
              background: 'var(--warning-tint-bg)',
              color: 'var(--warning-text)',
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              marginTop: '0.25rem'
            }}
          >
            <Upload size={14} style={{ marginTop: '0.15rem', flexShrink: 0 }} />
            <span>
              Plugins run unsandboxed — install only from sources you trust. Review dependencies
              before confirming any install.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
