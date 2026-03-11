import React from 'react';
import { ArrowLeft, Clock, CheckCircle, Edit3, Image as ImageIcon, Download, Trash2 } from 'lucide-react';
import { ActionMenu } from '../ActionMenu';
import type { Project, Audiobook } from '../../types';

interface ProjectHeaderProps {
  project: Project;
  totalRuntime: number;
  totalPredicted: number;
  availableAudiobooks: Audiobook[];
  onBack: () => void;
  onEditMetadata: () => void;
  onShowCover: () => void;
  onStartAssembly: () => void;
  onDeleteAudiobook: (filename: string) => void;
  formatLength: (seconds: number) => string;
  formatFileSize: (bytes?: number) => string;
  formatRelativeTime: (timestamp?: number) => string;
}

export const ProjectHeader: React.FC<ProjectHeaderProps> = ({
  project,
  totalRuntime,
  totalPredicted,
  availableAudiobooks,
  onBack,
  onEditMetadata,
  onShowCover,
  onStartAssembly,
  onDeleteAudiobook,
  formatLength,
  formatFileSize,
  formatRelativeTime
}) => {
  return (
    <header style={{ 
        background: 'var(--surface)', 
        borderRadius: '16px', 
        border: '1px solid var(--border)', 
        padding: '2rem',
        display: 'flex', 
        gap: '2rem',
        alignItems: 'center'
    }}>
      {/* Project Cover Art */}
      <div 
          onClick={() => project.cover_image_path ? onShowCover() : null}
          style={{
              height: '200px',
              width: '150px',
              flexShrink: 0,
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              cursor: project.cover_image_path ? 'zoom-in' : 'default',
              transition: 'transform 0.2s',
              background: 'var(--surface-light)',
              border: '1px solid var(--border)'
          }}
          onMouseOver={(e) => { if (project.cover_image_path) e.currentTarget.style.transform = 'scale(1.02)' }}
          onMouseOut={(e) => { if (project.cover_image_path) e.currentTarget.style.transform = 'scale(1)' }}
      >
          {project.cover_image_path ? (
              <img 
                  src={project.cover_image_path} 
                  alt="Cover" 
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
              />
          ) : (
              <ImageIcon size={48} style={{ opacity: 0.2 }} />
          )}
      </div>

      {/* Project Metadata */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
              <button onClick={onBack} className="btn-ghost" style={{ padding: '0.5rem', marginLeft: '-0.5rem' }}>
                  <ArrowLeft size={20} />
              </button>
              <div style={{ background: 'var(--surface-light)', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'inline-block' }}>
                  {project.series || 'Standalone'}
              </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
              <h2 style={{ fontSize: '2.5rem', fontWeight: 700, lineHeight: 1.1 }}>{project.name}</h2>
              <button 
                onClick={onEditMetadata} 
                className="btn-ghost" 
                style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}
                title="Edit Project Metadata"
              >
                  <Edit3 size={18} />
              </button>
          </div>
          {project.author && <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>by {project.author}</p>}
          
          <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={16} /> 
                  <span>Runtime: <strong style={{ color: 'var(--text-primary)' }}>{formatLength(totalRuntime)}</strong> {totalRuntime < totalPredicted && `(Predicted: ${formatLength(totalPredicted)})`}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle size={16} />
                  <span>Created: <strong style={{ color: 'var(--text-primary)' }}>{new Date(project.created_at * 1000).toLocaleDateString()}</strong></span>
              </div>
          </div>
      </div>

      {/* Action Buttons & History */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '220px' }}>
          {availableAudiobooks.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '-0.25rem' }}>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Assemblies ({availableAudiobooks.length})
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} title="Total storage used by these local exports">
                          Total: {formatFileSize(availableAudiobooks.reduce((acc, a) => acc + (a.size_bytes || 0), 0))}
                      </div>
                  </div>
                  <div style={{ 
                      maxHeight: '240px', 
                      overflowY: 'auto', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '0.5rem',
                      paddingRight: '4px',
                      scrollbarWidth: 'thin'
                  }}>
                      {availableAudiobooks.map((a, i) => (
                          <div key={i} className="hover-bg-subtle" style={{ 
                              background: 'var(--surface)',
                              border: '1px solid var(--border)',
                              borderRadius: '8px',
                              padding: '0.6rem 0.8rem',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '1rem',
                              position: 'relative',
                              transition: 'all 0.2s ease'
                          }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0, flex: 1 }}>
                                  <div style={{ 
                                      width: '40px', 
                                      height: '40px', 
                                      borderRadius: '4px', 
                                      overflow: 'hidden', 
                                      background: 'rgba(0,0,0,0.05)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flexShrink: 0,
                                      border: '1px solid var(--border)'
                                  }}>
                                      {a.cover_url ? (
                                          <img src={a.cover_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                      ) : (
                                          <ImageIcon size={16} style={{ opacity: 0.3 }} />
                                      )}
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                          <span style={{ 
                                              fontSize: '0.8rem', 
                                              fontWeight: 600, 
                                              color: 'var(--text-primary)',
                                              whiteSpace: 'nowrap',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis'
                                          }}>
                                              {a.title || a.filename}
                                          </span>
                                          {i === 0 && (
                                              <span style={{ 
                                                  fontSize: '0.65rem', 
                                                  fontWeight: 600, 
                                                  padding: '2px 6px', 
                                                  borderRadius: '4px', 
                                                  background: 'var(--surface-light)', 
                                                  color: 'var(--text-secondary)',
                                                  border: '1px solid var(--border)'
                                              }}>
                                                  Latest
                                              </span>
                                          )}
                                      </div>
                                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                          <span>{formatRelativeTime(a.created_at)}</span>
                                          {a.duration_seconds && <span>• {formatLength(a.duration_seconds)}</span>}
                                          {a.size_bytes && <span>• {formatFileSize(a.size_bytes)}</span>}
                                      </div>
                                  </div>
                              </div>
                              <ActionMenu 
                                  items={[
                                      { label: 'Download', icon: Download, onClick: () => {
                                          const link = document.createElement('a');
                                          link.href = a.url || `/out/audiobook/${a.filename}`;
                                          link.download = a.filename;
                                          link.click();
                                      }},
                                      { label: 'Delete', icon: Trash2, isDestructive: true, onClick: () => onDeleteAudiobook(a.filename) }
                                  ]}
                              />
                          </div>
                      ))}
                  </div>
              </div>
          ) : (
              <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  padding: '2rem 1rem', 
                  background: 'var(--surface-light)', 
                  borderRadius: '12px', 
                  border: '1px dashed var(--border)',
                  textAlign: 'center',
                  gap: '0.5rem'
              }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>No assemblies yet</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', padding: '0 1rem' }}>Export an audiobook to see it here.</span>
              </div>
          )}

          <button
              className="btn-ghost"
              onClick={onStartAssembly}
              style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  border: '1px solid var(--border)', padding: '0.75rem',
                  borderRadius: '12px'
              }}
          >   
              <CheckCircle size={16} />
              Assemble Project
          </button>
      </div>
    </header>
  );
};
