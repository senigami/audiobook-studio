import React from 'react';
import { Download, Trash2, Image as ImageIcon, CheckCircle, Book } from 'lucide-react';
import { InlineEdit } from '../InlineEdit';
import type { Audiobook } from '../../types';

interface AssemblyPanelProps {
  availableAudiobooks: Audiobook[];
  onStartAssembly: () => void;
  onDeleteAudiobook: (filename: string) => void;
  onUpdateMetadata: (filename: string, description: string) => Promise<boolean>;
  formatLength: (seconds: number) => string;
  formatFileSize: (bytes?: number) => string;
  formatRelativeTime: (timestamp?: number) => string;
}

export const AssemblyPanel: React.FC<AssemblyPanelProps> = ({
  availableAudiobooks,
  onStartAssembly,
  onDeleteAudiobook,
  onUpdateMetadata,
  formatLength,
  formatFileSize,
  formatRelativeTime
}) => {
  const [localAudiobooks, setLocalAudiobooks] = React.useState(availableAudiobooks);

  React.useEffect(() => {
    setLocalAudiobooks(availableAudiobooks);
  }, [availableAudiobooks]);

  const handleUpdateDescription = async (filename: string, newValue: string) => {
    const success = await onUpdateMetadata(filename, newValue);
    if (success) {
        setLocalAudiobooks(prev => prev.map(a => a.filename === filename ? { ...a, description: newValue } : a));
    }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Project Assemblies</h3>
        <button onClick={onStartAssembly} className="btn-ghost" style={{ fontSize: '0.85rem', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Book size={16} /> Assemble Project
        </button>
      </div>

      {availableAudiobooks.length > 0 ? (
        <div style={{ background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--surface-light)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Assembly</th>
                <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Created</th>
                <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Stats</th>
                <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {localAudiobooks.map((a, i) => (
                <tr key={i} className="hover-bg-subtle" style={{ borderBottom: i === availableAudiobooks.length - 1 ? 'none' : '1px solid var(--border)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{
                            width: '40px',
                            aspectRatio: '2/3',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            background: 'var(--surface-light)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            border: '1px solid var(--border)',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}>
                            {a.cover_url ? (
                                <img src={a.cover_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                            ) : (
                                <ImageIcon size={20} style={{ opacity: 0.3 }} />
                            )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {a.title || a.filename}
                            </span>
                            <InlineEdit
                                value={a.description || ''}
                                onSave={(val) => handleUpdateDescription(a.filename, val)}
                                placeholder="Add description..."
                                style={{
                                    fontSize: '0.75rem',
                                    color: a.description ? 'var(--text-primary)' : 'var(--text-muted)',
                                    marginTop: '2px',
                                    minHeight: '1.1rem'
                                }}
                            />
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '1px' }}>
                                {a.filename}
                            </span>
                        </div>
                    </div>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    {formatRelativeTime(a.created_at)}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {a.duration_seconds && <span>{formatLength(a.duration_seconds)}</span>}
                        {a.size_bytes && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{formatFileSize(a.size_bytes)}</span>}
                    </div>
                  </td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button
                            onClick={() => {
                                const link = document.createElement('a');
                                link.href = a.url || `/out/audiobook/${a.filename}`;
                                link.download = a.download_filename || a.filename;
                                link.click();
                            }}
                            className="btn-ghost"
                            style={{ padding: '0.5rem', color: 'var(--accent)' }}
                            title="Download"
                        >
                            <Download size={18} />
                        </button>
                        <button
                            onClick={() => onDeleteAudiobook(a.filename)}
                            className="btn-ghost"
                            style={{ padding: '0.5rem', color: 'var(--text-error)' }}
                            title="Delete"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4rem 2rem',
            background: 'var(--surface)',
            borderRadius: '12px',
            border: '1px dashed var(--border)',
            textAlign: 'center',
            gap: '1rem'
        }}>
            <div style={{ background: 'var(--surface-light)', padding: '1rem', borderRadius: '50%', color: 'var(--text-muted)' }}>
                <CheckCircle size={32} />
            </div>
            <div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>No assemblies yet</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '300px', margin: '0.5rem auto 0' }}>
                    Assemblies are created from the Chapters tab.
                </p>
            </div>
            <button onClick={onStartAssembly} className="btn-ghost" style={{ border: '1px solid var(--border)', marginTop: '0.5rem' }}>
                Go to Chapters to Assemble
            </button>
        </div>
      )}
    </div>
  );
};
