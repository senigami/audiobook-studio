import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, RefreshCw, X, CheckCircle, Info } from 'lucide-react';

export interface ResyncPreviewData {
  total_segments_before: number;
  total_segments_after: number;
  preserved_assignments_count: number;
  lost_assignments_count: number;
  affected_character_names: string[];
  is_destructive: boolean;
}

interface ResyncPreviewModalProps {
  isOpen: boolean;
  data: ResyncPreviewData | null;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

export const ResyncPreviewModal: React.FC<ResyncPreviewModalProps> = ({
  isOpen,
  data,
  onConfirm,
  onCancel,
  loading
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem'
        }}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={!loading ? onCancel : undefined}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.4)',
              backdropFilter: 'blur(8px)',
            }}
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '520px',
              background: 'var(--surface)',
              borderRadius: '20px',
              boxShadow: 'var(--shadow-xl)',
              border: '1px solid var(--border)',
              padding: '2rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ 
                width: '48px', 
                height: '48px', 
                borderRadius: '12px', 
                background: data?.is_destructive ? 'rgba(245, 158, 11, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: data?.is_destructive ? 'var(--warning)' : 'var(--success)'
              }}>
                {data?.is_destructive ? <AlertTriangle size={24} /> : <CheckCircle size={24} />}
              </div>
              <button 
                onClick={onCancel}
                disabled={loading}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  color: 'var(--text-muted)', 
                  cursor: loading ? 'not-allowed' : 'pointer',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Source Text Resync Preview
              </h3>
              <p style={{ fontSize: '0.925rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Review how your changes will affect existing speaker assignments and production blocks.
              </p>
            </div>

            {!data && loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '2rem 0' }}>
                <RefreshCw size={32} className="animate-spin" color="var(--accent)" />
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Calculating impact...</span>
              </div>
            ) : data ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Stats Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={{ padding: '1rem', background: 'var(--surface-light)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.4rem' }}>Segments</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>{data.total_segments_after}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>from {data.total_segments_before}</span>
                    </div>
                  </div>
                  <div style={{ padding: '1rem', background: 'var(--surface-light)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.4rem' }}>Preserved</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--success)' }}>{data.preserved_assignments_count}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>assignments</span>
                    </div>
                  </div>
                </div>

                {/* Warning / Success Box */}
                {data.lost_assignments_count > 0 ? (
                  <div style={{ 
                    padding: '1rem', background: 'rgba(239, 68, 68, 0.05)', 
                    border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px',
                    display: 'flex', flexDirection: 'column', gap: '0.75rem'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--error)', fontWeight: 700, fontSize: '0.9rem' }}>
                      <AlertTriangle size={16} />
                      Destructive Change Warning
                    </div>
                    <p style={{ fontSize: '0.850rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      <strong>{data.lost_assignments_count}</strong> assignments will be lost because the source text has shifted or been modified.
                    </p>
                    {data.affected_character_names.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginRight: '0.2rem' }}>Affected:</span>
                        {data.affected_character_names.map(name => (
                          <span key={name} style={{ 
                            fontSize: '0.7rem', fontWeight: 600, padding: '0.15rem 0.4rem', 
                            background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)', 
                            borderRadius: '4px' 
                          }}>
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ 
                    padding: '1rem', background: 'rgba(34, 197, 94, 0.05)', 
                    border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '12px',
                    display: 'flex', alignItems: 'center', gap: '0.75rem'
                  }}>
                    <CheckCircle size={20} color="var(--success)" />
                    <p style={{ fontSize: '0.88rem', color: 'var(--success-text)', fontWeight: 600 }}>
                      All current speaker assignments will be preserved!
                    </p>
                  </div>
                )}

                <div style={{ 
                  padding: '0.75rem 1rem', background: 'var(--surface-light)', 
                  border: '1px solid var(--border)', borderRadius: '10px',
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem'
                }}>
                  <Info size={16} style={{ marginTop: '0.15rem', color: 'var(--accent)' }} />
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    Proceeding will update the source text and regenerate all segments. This action cannot be undone, but you can always re-assign speakers in the Script view.
                  </p>
                </div>
              </div>
            ) : null}

            <div style={{ display: 'flex', gap: '12px', marginTop: '0.5rem' }}>
              <button 
                onClick={onCancel}
                disabled={loading}
                className="btn-ghost"
                style={{ flex: 1, padding: '0.75rem', borderRadius: '12px' }}
              >
                Back to Editor
              </button>
              <button 
                onClick={onConfirm}
                disabled={loading || !data}
                className={data?.is_destructive ? 'btn-danger' : 'btn-primary'}
                style={{ 
                  flex: 1, 
                  padding: '0.75rem', 
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  opacity: (loading || !data) ? 0.5 : 1
                }}
              >
                {loading ? <RefreshCw size={18} className="animate-spin" /> : (data?.is_destructive ? 'Confirm Resync' : 'Commit Changes')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
