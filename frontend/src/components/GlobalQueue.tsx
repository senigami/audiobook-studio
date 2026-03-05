import React, { useState, useEffect } from 'react';
import { Reorder, motion, AnimatePresence } from 'framer-motion';
import { Trash2, GripVertical, CheckCircle, Clock, Layers, Play, Pause, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../api';
import { ActionMenu } from './ActionMenu';
import { ConfirmModal } from './ConfirmModal';
import type { ProcessingQueueItem, Job } from '../types';
import { PredictiveProgressBar } from './PredictiveProgressBar';

interface GlobalQueueProps {
    paused?: boolean;
    jobs?: Record<string, Job>;
    refreshTrigger?: number;
    onRefresh?: () => void;
}

export const GlobalQueue: React.FC<GlobalQueueProps> = ({ paused = false, jobs = {}, refreshTrigger = 0, onRefresh }) => {
  const [queue, setQueue] = useState<ProcessingQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [localPaused, setLocalPaused] = useState(paused);

  const formatTime = (ts: number | null | undefined) => {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  const [hoveredJobId, setHoveredJobId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
    confirmText?: string;
  } | null>(null);

  useEffect(() => {
    setLocalPaused(paused);
  }, [paused]);

  const fetchQueue = async () => {
    try {
      const data = await api.getProcessingQueue();
      setQueue(data);
    } catch (e) {
      console.error("Failed to fetch queue", e);
    } finally {
      setLoading(false);
    }
  };

  const handlePauseToggle = async () => {
    const targetState = !localPaused;
    setLocalPaused(targetState);
    try {
      const endpoint = targetState ? '/queue/pause' : '/queue/resume';
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      console.log(`Queue ${targetState ? 'paused' : 'resumed'}:`, data);
      if (onRefresh) onRefresh();
      fetchQueue();
    } catch (e) {
      console.error('Failed to toggle pause', e);
      setLocalPaused(!targetState); // Revert on failure
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [refreshTrigger]);

  // Re-fetch queue from server whenever live job data changes,
  // ensuring status sync even if a WS event was missed during tab navigation.
  useEffect(() => {
    // Also sync local state immediately from jobs prop
    setQueue(prev => {
      let changed = false;
      const updated = prev.map(q => {
        const liveJob = Object.values(jobs).find(j => j.id === q.id);
        if (liveJob && liveJob.status !== q.status) {
          changed = true;
          return { ...q, status: liveJob.status };
        }
        return q;
      });
      return changed ? updated : prev;
    });
  }, [jobs]);

  // Safety-net polling: infrequent fallback in case a WS event was missed
  useEffect(() => {
    const timer = setInterval(fetchQueue, 30000);
    return () => clearInterval(timer);
  }, []);

  const handleReorder = async (newOrder: ProcessingQueueItem[]) => {
    // Only allow reordering of queued items
    const nonQueued = queue.filter(q => q.status !== 'queued');
    const correctlyOrdered = [...nonQueued, ...newOrder.filter(q => q.status === 'queued')];
    setQueue(correctlyOrdered);
    
    try {
        await api.reorderProcessingQueue(newOrder.filter(q => q.status === 'queued').map(q => q.id));
    } catch (e) {
        console.error(e);
        fetchQueue();
    }
  };

  const handleRemove = async (id: string) => {
    try {
        await api.removeProcessingQueue(id);
        fetchQueue();
    } catch (e) {
        console.error(e);
    }
  };

  const handleClearCompleted = async () => {
    try {
        await api.clearCompletedJobs();
        fetchQueue();
    } catch (e) {
        console.error(e);
    }
  };

  const activeJobs = queue.filter(q => q.status === 'running' || q.status === 'preparing' || q.status === 'finalizing');
  const pendingJobs = queue.filter(q => q.status === 'queued');
  const pastJobs = queue.filter(q => q.status === 'done' || q.status === 'failed' || q.status === 'cancelled');

  if (loading) return <div style={{ padding: '2rem' }}>Loading Queue...</div>;

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', minHeight: '100%', paddingBottom: '4rem' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '10px' }}>
             <Layers size={24} strokeWidth={2} color="var(--accent)" /> Global Processing Queue
          </h2>
          <p style={{ color: 'var(--text-muted)' }}>Manage your batch audio generation tasks</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button
                onClick={handlePauseToggle}
                className={localPaused ? "btn-success" : "btn-primary"}
                style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    padding: '10px 20px', 
                    borderRadius: '12px', 
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    boxShadow: 'var(--shadow-sm)',
                    transition: 'all 0.2s ease',
                    border: 'none',
                    cursor: 'pointer'
                }}
            >
                {localPaused ? <Play size={18} strokeWidth={2} fill="currentColor" /> : <Pause size={18} strokeWidth={2} fill="currentColor" />}
                {localPaused ? 'Resume Processing' : 'Pause All Jobs'}
            </button>
            <ActionMenu 
              items={[
                { 
                  label: 'Clear Completed', 
                  icon: CheckCircle, 
                  onClick: handleClearCompleted 
                },
                { 
                  label: 'Clear All Jobs', 
                  icon: Trash2, 
                  onClick: () => {
                    setConfirmConfig({
                      title: 'Clear Queue',
                      message: 'Are you sure you want to clear all items from the queue? This will cancel any running jobs.',
                      isDestructive: true,
                      onConfirm: async () => {
                        await api.clearProcessingQueue(); 
                        fetchQueue(); 
                        setConfirmConfig(null);
                      }
                    });
                  },
                  isDestructive: true 
                }
              ]}
            />
        </div>
      </header>

      {queue.length === 0 ? (
        <div style={{ 
            textAlign: 'center', 
            padding: '5rem 2rem', 
            background: 'var(--surface)', 
            borderRadius: '20px', 
            border: '2px dashed var(--border)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.5rem',
            color: 'var(--text-muted)'
        }}>
          <div style={{ 
              width: '64px', 
              height: '64px', 
              borderRadius: '50%', 
              background: 'var(--surface-alt)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              opacity: 0.5
          }}>
              <Layers size={32} />
          </div>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Queue is empty</h3>
            <p style={{ maxWidth: '300px', margin: '0 auto', fontSize: '0.9rem', lineHeight: 1.5 }}>
                Jobs you add from the project chapter view will appear here for processing.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {localPaused && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.2)',
                    borderRadius: '12px',
                    padding: '1rem 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    color: '#d97706' // warning-text
                }}
              >
                  <Pause size={18} fill="currentColor" />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Processing is currently paused. Resume to continue the queue.</span>
              </motion.div>
          )}
          {/* Active Job */}
          {activeJobs.length > 0 && (
              <div>
                  <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '1rem' }}>Processing Now</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {activeJobs.map(job => {
                          const liveJob = Object.values(jobs).find(j => j.id === job.id);
                          const prog = liveJob?.progress ?? job.progress ?? 0;
                          const started = liveJob?.started_at ?? job.started_at;
                          const eta = liveJob?.eta_seconds ?? job.eta_seconds;

                          return (
                          <div key={job.id} style={{
                              background: 'var(--surface)', 
                              border: '1px solid var(--accent)',
                              borderRadius: '16px', 
                              padding: '1.5rem', 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '1.5rem',
                              boxShadow: 'var(--shadow-md)',
                              position: 'relative',
                              overflow: 'hidden'
                          }}>
                              <div style={{ 
                                  position: 'absolute', 
                                  left: 0, 
                                  top: 0, 
                                  bottom: 0, 
                                  width: '6px', 
                                  background: 'var(--accent)' 
                              }} />
                              
                              <div style={{ 
                                  width: '48px', 
                                  height: '48px', 
                                  borderRadius: '12px', 
                                  background: 'var(--accent-tint)', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center',
                                  flexShrink: 0
                              }}>
                                  {localPaused ? (
                                      <Pause size={24} strokeWidth={2} color="var(--accent)" />
                                  ) : (
                                      <Play size={24} strokeWidth={2} color="var(--accent)" className="animate-pulse" />
                                  )}
                              </div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                      <div style={{ minWidth: 0 }}>
                                          <h4 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.chapter_title}</h4>
                                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                              <span>{job.project_name} • Part {job.split_part + 1}</span>
                                              {started && (
                                                  <>
                                                      <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                                                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Started {formatTime(started)}</span>
                                                  </>
                                              )}
                                          </div>
                                      </div>
                                      <div style={{ display: 'flex', gap: '8px' }}>
                                          <button 
                                              onClick={() => {/* TODO: Implement individual pause */}}
                                              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', borderRadius: '8px' }}
                                              className="hover-bg-subtle"
                                              title="Pause Job"
                                          >
                                              <Pause size={18} strokeWidth={2} />
                                          </button>
                                          <button 
                                              onClick={() => handleRemove(job.id)}
                                              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '6px', borderRadius: '8px' }}
                                              className="hover-bg-destructive"
                                              title="Cancel Job"
                                          >
                                              <XCircle size={18} strokeWidth={2} />
                                          </button>
                                      </div>
                                  </div>
                                  <PredictiveProgressBar 
                                    progress={prog}
                                    startedAt={started}
                                    etaSeconds={eta}
                                    label={job.status === 'preparing' ? "Preparing..." : (job.status === 'finalizing' ? "Finalizing..." : "Processing...")}
                                  />
                              </div>
                          </div>
                      )})}
                  </div>
              </div>
          )}

          {/* Pending Jobs */}
          {pendingJobs.length > 0 && (
              <div>
                  <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '1rem' }}>Up Next</h3>
                  <Reorder.Group axis="y" values={pendingJobs} onReorder={handleReorder} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {pendingJobs.map(job => (
                          <Reorder.Item 
                            key={job.id} 
                            value={job}
                            onMouseEnter={() => setHoveredJobId(job.id)}
                            onMouseLeave={() => setHoveredJobId(null)}
                            style={{
                                background: 'var(--surface)', 
                                borderRadius: '12px', 
                                padding: '1rem 1.25rem', 
                                border: '1px solid var(--border)',
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '1.25rem', 
                                cursor: 'grab',
                                boxShadow: hoveredJobId === job.id ? 'var(--shadow-md)' : 'none',
                                transition: 'all 0.2s ease'
                            }}
                            whileDrag={{ scale: 1.02, boxShadow: 'var(--shadow-lg)', zIndex: 50, cursor: 'grabbing' }}
                          >
                            <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }} title="Drag to reorder"><GripVertical size={18} strokeWidth={2} /></div>
                            
                            <div style={{ 
                                width: '36px', 
                                height: '36px', 
                                borderRadius: '8px', 
                                background: 'var(--surface-alt)', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                color: 'var(--text-muted)'
                            }}>
                                <Clock size={18} strokeWidth={2} />
                            </div>
                            
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <h4 style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.chapter_title}</h4>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{job.project_name} • Part {job.split_part + 1}</div>
                            </div>

                            <button 
                                onClick={() => handleRemove(job.id)} 
                                style={{ 
                                    background: 'none',
                                    border: 'none',
                                    padding: '8px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    color: hoveredJobId === job.id ? 'var(--error)' : 'var(--text-muted)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s ease'
                                }}
                                className="hover-bg-destructive"
                                title="Remove from Queue"
                            >
                                <Trash2 size={16} strokeWidth={2} />
                            </button>
                          </Reorder.Item>
                      ))}
                  </Reorder.Group>
              </div>
          )}

          {/* Past Jobs */}
          {pastJobs.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
                  <button 
                      onClick={() => setShowHistory(!showHistory)}
                      style={{ 
                          background: 'none', 
                          border: 'none', 
                          width: '100%', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'space-between',
                          padding: '0.5rem 0',
                          cursor: 'pointer',
                          marginBottom: showHistory ? '1rem' : 0
                      }}
                  >
                      <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', margin: 0 }}>
                          Completed / Failed History ({pastJobs.length})
                      </h3>
                      <div style={{ color: 'var(--text-muted)' }}>
                          {showHistory ? <ChevronDown size={18} strokeWidth={2} /> : <ChevronRight size={18} strokeWidth={2} />}
                      </div>
                  </button>

                  <AnimatePresence>
                      {showHistory && (
                          <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                              style={{ overflow: 'hidden' }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingBottom: '1rem' }}>
                                {pastJobs.map(job => (
                                    <div 
                                        key={job.id} 
                                        onMouseEnter={() => setHoveredJobId(job.id)}
                                        onMouseLeave={() => setHoveredJobId(null)}
                                        style={{
                                            background: 'var(--surface)', 
                                            border: '1px solid var(--border)',
                                            borderRadius: '12px', 
                                            padding: '0.75rem 1.25rem', 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '1.25rem',
                                            opacity: 0.8,
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        <div style={{ 
                                            width: '32px', 
                                            height: '32px', 
                                            borderRadius: '8px', 
                                            background: job.status === 'done' ? 'var(--success-tint)' : 'var(--error-tint)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: job.status === 'done' ? 'var(--success)' : 'var(--error)'
                                        }}>
                                            {job.status === 'done' ? <CheckCircle size={18} strokeWidth={2} /> : <XCircle size={18} strokeWidth={2} />}
                                        </div>

                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <h4 style={{ 
                                                fontWeight: 600, 
                                                fontSize: '0.95rem', 
                                                color: 'var(--text-primary)',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {job.chapter_title}
                                            </h4>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>{job.project_name}</span>
                                                {job.started_at && (
                                                    <>
                                                        <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                                                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                            {formatTime(job.started_at)} {job.completed_at ? `→ ${formatTime(job.completed_at)}` : ''}
                                                        </span>
                                                    </>
                                                )}
                                                <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                                                <span style={{ 
                                                    fontSize: '0.7rem', 
                                                    fontWeight: 700, 
                                                    textTransform: 'uppercase', 
                                                    letterSpacing: '0.04em',
                                                    color: job.status === 'done' ? 'var(--success)' : 'var(--error)'
                                                }}>
                                                    {job.status}
                                                </span>
                                            </div>
                                        </div>

                                        <button 
                                            onClick={() => handleRemove(job.id)} 
                                            style={{ 
                                                background: 'none',
                                                border: 'none',
                                                padding: '8px',
                                                borderRadius: '8px',
                                                cursor: 'pointer',
                                                color: hoveredJobId === job.id ? 'var(--error)' : 'var(--text-muted)',
                                                opacity: hoveredJobId === job.id ? 1 : 0.4,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                transition: 'all 0.2s ease'
                                            }}
                                            title="Remove from History"
                                        >
                                            <Trash2 size={16} strokeWidth={2} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                          </motion.div>
                      )}
                  </AnimatePresence>
              </div>
          )}

        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmConfig}
        title={confirmConfig?.title || ''}
        message={confirmConfig?.message || ''}
        onConfirm={() => {
          confirmConfig?.onConfirm();
          setConfirmConfig(null);
        }}
        onCancel={() => setConfirmConfig(null)}
        isDestructive={confirmConfig?.isDestructive}
        confirmText={confirmConfig?.confirmText}
      />
    </div>
  );
};
