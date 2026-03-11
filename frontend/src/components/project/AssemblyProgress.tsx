import React from 'react';
import { CheckCircle } from 'lucide-react';
import type { Job, Project } from '../../types';

interface AssemblyProgressProps {
  project: Project;
  activeAssemblyJob?: Job;
  finishedAssemblyJob?: Job;
}

export const AssemblyProgress: React.FC<AssemblyProgressProps> = ({
  project,
  activeAssemblyJob,
  finishedAssemblyJob
}) => {
  if (activeAssemblyJob) {
    return (
      <div style={{ background: 'var(--accent-glow)', border: '1px solid var(--accent)', borderRadius: '12px', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <h3 style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Assembling {project.name}...</h3>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  {Math.round(activeAssemblyJob.progress * 100)}%
              </div>
          </div>
          <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${activeAssemblyJob.progress * 100}%`, background: 'var(--accent)', transition: 'width 0.3s' }} />
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              ETA: {activeAssemblyJob.eta_seconds ? `${Math.floor(activeAssemblyJob.eta_seconds / 60)}m ${activeAssemblyJob.eta_seconds % 60}s` : 'Calculating...'}
          </div>
      </div>
    );
  }

  if (finishedAssemblyJob) {
    return (
      <div style={{ background: 'var(--surface)', color: 'var(--success-text)', borderRadius: '12px', padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--success)' }}>
          <CheckCircle size={20} />
          <span style={{ fontWeight: 600 }}>Audiobook assembled successfully! {finishedAssemblyJob.output_mp3}</span>
      </div>
    );
  }

  return null;
};
