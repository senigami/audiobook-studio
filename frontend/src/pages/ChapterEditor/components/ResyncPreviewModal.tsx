import React, { useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, RefreshCw, X, CheckCircle, Info } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

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
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isOpen);

  const handleEscape = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !loading) onCancel();
  }, [onCancel, loading]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="resync-modal-overlay"
          onKeyDown={handleEscape}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={!loading ? onCancel : undefined}
            aria-hidden="true"
            className="resync-modal-backdrop"
          />

          {/* Modal Content */}
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="resync-modal-title"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="resync-modal-card"
          >
            <div className="resync-modal-header">
              <div className={`resync-modal-icon ${data?.is_destructive ? 'resync-modal-icon--warning' : 'resync-modal-icon--success'}`}>
                {data?.is_destructive ? <AlertTriangle size={24} /> : <CheckCircle size={24} />}
              </div>
              <button
                onClick={onCancel}
                disabled={loading}
                aria-label="Close"
                className="modal-close-btn"
                style={{ cursor: loading ? 'not-allowed' : 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="resync-modal-title-block">
              <h3 id="resync-modal-title" className="resync-modal-title">
                Source Text Resync Preview
              </h3>
              <p className="resync-modal-description">
                Review how your changes will affect existing speaker assignments and production blocks.
              </p>
            </div>

            {!data && loading ? (
              <div className="resync-modal-loading">
                <RefreshCw size={32} className="animate-spin" color="var(--action-primary)" />
                <span className="resync-modal-loading-text">Calculating impact...</span>
              </div>
            ) : data ? (
              <div className="resync-modal-body">
                {/* Stats Grid */}
                <div className="resync-modal-stats-grid">
                  <div className="resync-modal-stat-card">
                    <div className="resync-modal-stat-label">Segments</div>
                    <div className="resync-modal-stat-row">
                      <span className="resync-modal-stat-value">{data.total_segments_after}</span>
                      <span className="resync-modal-stat-note">from {data.total_segments_before}</span>
                    </div>
                  </div>
                  <div className="resync-modal-stat-card">
                    <div className="resync-modal-stat-label">Preserved</div>
                    <div className="resync-modal-stat-row">
                      <span className="resync-modal-stat-value resync-modal-stat-value--success">{data.preserved_assignments_count}</span>
                      <span className="resync-modal-stat-note">assignments</span>
                    </div>
                  </div>
                </div>

                {/* Warning / Success Box */}
                {data.lost_assignments_count > 0 ? (
                  <div className="resync-modal-warning-box">
                    <div className="resync-modal-warning-heading">
                      <AlertTriangle size={16} />
                      Destructive Change Warning
                    </div>
                    <p className="resync-modal-warning-text">
                      <strong>{data.lost_assignments_count}</strong> assignments will be lost because the source text has shifted or been modified.
                    </p>
                    {data.affected_character_names.length > 0 && (
                      <div className="resync-modal-affected-list">
                        <span className="resync-modal-affected-label">Affected:</span>
                        {data.affected_character_names.map(name => (
                          <span key={name} className="resync-modal-affected-chip">
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="resync-modal-success-box">
                    <CheckCircle size={20} color="var(--success)" />
                    <p className="resync-modal-success-text">
                      All current speaker assignments will be preserved!
                    </p>
                  </div>
                )}

                <div className="resync-modal-info-box">
                  <Info size={16} className="resync-modal-info-icon" />
                  <p className="resync-modal-info-text">
                    Proceeding will update the source text and regenerate all segments. This action cannot be undone, but you can always re-assign speakers in the Script view.
                  </p>
                </div>
              </div>
            ) : null}

            <div className="resync-modal-actions">
              <button
                onClick={onCancel}
                disabled={loading}
                className="btn-ghost resync-modal-btn"
              >
                Back to Editor
              </button>
              <button
                onClick={onConfirm}
                disabled={loading || !data}
                className={`resync-modal-btn resync-modal-btn--confirm ${data?.is_destructive ? 'btn-danger' : 'btn-primary'}`}
                style={{ opacity: (loading || !data) ? 0.5 : 1 }}
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
