import React, { useState, useEffect } from 'react';
import { Database, Download, Plus, Clock, Loader2, Trash2, CheckSquare, Square } from 'lucide-react';
import { InlineEdit } from './InlineEdit';
import { api } from '../api';
import type { StoredBackup } from '../types';
import { ConfirmModal } from './ConfirmModal';

interface ProjectBackupsPanelProps {
  projectId: string;
  onSaveBackup: (comment?: string, includeAudio?: boolean) => Promise<boolean>;
  onDeleteBackup: (filename: string) => Promise<boolean>;
  onUpdateMetadata: (filename: string, comment: string) => Promise<boolean>;
  submitting: boolean;
}

export const ProjectBackupsPanel: React.FC<ProjectBackupsPanelProps> = ({
  projectId,
  onSaveBackup,
  onDeleteBackup,
  onUpdateMetadata,
  submitting
}) => {
  const [backups, setBackups] = useState<StoredBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [includeAudio, setIncludeAudio] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  const loadBackups = async () => {
    setLoading(true);
    try {
      const data = await api.fetchProjectBackups(projectId);
      setBackups(data);
    } catch (e) {
      console.error("Failed to load backups", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, [projectId]);

  const handleCreate = async () => {
    const success = await onSaveBackup(comment, includeAudio);
    if (success) {
      setComment('');
      setIncludeAudio(true);
      setShowCreate(false);
      loadBackups();
    }
  };

  const handleDelete = (filename: string) => {
    setFileToDelete(filename);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!fileToDelete) return;

    setDeletingFile(fileToDelete);
    setShowDeleteConfirm(false);
    try {
        const success = await onDeleteBackup(fileToDelete);
        if (success) {
            loadBackups();
        }
    } finally {
        setDeletingFile(null);
        setFileToDelete(null);
    }
  };

  const handleUpdateComment = async (filename: string, newValue: string) => {
    const success = await onUpdateMetadata(filename, newValue);
    if (success) {
        setBackups(prev => prev.map(b => b.filename === filename ? { ...b, comment: newValue } : b));
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Project Backups</h3>
        {!showCreate && (
          <button onClick={() => setShowCreate(true)} className="btn-primary" style={{ fontSize: '0.85rem' }}>
            <Plus size={16} /> Create New Backup
          </button>
        )}
      </div>

      {showCreate && (
        <div className="animate-in" style={{
          background: 'var(--as-info-tint)',
          border: '1px solid var(--accent)',
          borderRadius: '12px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: 'var(--shadow-lg)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Backup Description (Optional)</label>
            <input
              autoFocus
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="e.g. Before major character voice change"
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') setShowCreate(false);
              }}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '0.75rem',
                fontSize: '0.9rem',
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />
          </div>

          <div
            onClick={() => setIncludeAudio(!includeAudio)}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                cursor: 'pointer',
                userSelect: 'none',
                padding: '0.25rem 0.5rem',
                transition: 'opacity 0.2s'
            }}
          >
            <div style={{ color: includeAudio ? 'var(--accent)' : 'var(--border)' }}>
                {includeAudio ? <CheckSquare size={20} /> : <Square size={20} />}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Include master chapter audio (WAV)</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Preserves generated high-fidelity chapter audio. Does not include segment files.</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowCreate(false)} className="btn-ghost">Cancel</button>
            <button
              onClick={handleCreate}
              disabled={submitting}
              className="btn-primary"
              style={{ minWidth: '140px' }}
            >
              {submitting ? <Loader2 className="animate-spin" size={18} /> : 'Start Backup'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading backup history...</div>
      ) : backups.length > 0 ? (
        <div style={{ background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--surface-light)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Date</th>
                <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Description / Comment</th>
                <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Size</th>
                <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b, i) => (
                <tr key={b.filename} className="hover-bg-subtle" style={{ borderBottom: i === backups.length - 1 ? 'none' : '1px solid var(--border)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Clock size={16} style={{ color: 'var(--text-muted)' }} />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>{new Date(b.created_at).toLocaleString()}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{b.filename}</span>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
                    <InlineEdit
                        value={b.comment || ''}
                        onSave={(val) => handleUpdateComment(b.filename, val)}
                        placeholder="No description provided"
                        style={{
                            color: b.comment ? 'var(--text-primary)' : 'var(--text-muted)',
                            minHeight: '1.25rem'
                        }}
                    />
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{formatFileSize(b.size_bytes)}</td>
                  <td style={{ padding: '1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <a
                          href={b.download_url}
                          className="btn-ghost"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: 'var(--accent)',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            padding: '0.5rem'
                          }}
                          title="Download"
                        >
                          <Download size={18} />
                        </a>
                        <button
                            onClick={() => handleDelete(b.filename)}
                            disabled={deletingFile === b.filename}
                            className="btn-ghost"
                            style={{ padding: '0.5rem', color: 'var(--text-error)' }}
                            title="Delete"
                        >
                            {deletingFile === b.filename ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
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
                <Database size={32} />
            </div>
            <div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>No backups saved yet</h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '300px', margin: '0.5rem auto 0' }}>
                    Create a dated backup to capture the current state of your project, including all chapters and character settings.
                </p>
            </div>
            {!showCreate && (
              <button onClick={() => setShowCreate(true)} className="btn-ghost" style={{ border: '1px solid var(--border)', marginTop: '0.5rem' }}>
                  Create First Backup
              </button>
            )}
        </div>
      )}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        title="Delete Backup"
        message={`Are you sure you want to permanently delete the backup "${fileToDelete}"? This action cannot be undone.`}
        onConfirm={confirmDelete}
        onCancel={() => {
            setShowDeleteConfirm(false);
            setFileToDelete(null);
        }}
        confirmText="Delete Backup"
        isDestructive={true}
      />
    </div>
  );
};
