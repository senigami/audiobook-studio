import React from 'react';
import { Reorder } from 'framer-motion';
import { FileText, GripVertical, CheckSquare, Square, RefreshCw, Edit3, Zap, Video, Download, Trash2, Loader2 } from 'lucide-react';
import { ActionMenu } from '../ActionMenu';
import { StatusOrb } from '../StatusOrb';
import { PredictiveProgressBar } from '../PredictiveProgressBar';
import type { Chapter, Job } from '../../types';

interface ChapterListProps {
  chapters: Chapter[];
  projectId: string;
  jobs: Record<string, Job>;
  isAssemblyMode: boolean;
  selectedChapters: Set<string>;
  onSelectChapter: (id: string) => void;
  onSelectAll: () => void;
  onReorder: (chapters: Chapter[]) => void;
  onEditChapter: (id: string) => void;
  onRenameChapter: (id: string, newTitle: string) => Promise<void>;
  onQueueChapter: (chap: Chapter) => void;
  onResetAudio: (id: string) => void;
  onDeleteChapter: (id: string) => void;
  onExportSample: (chap: Chapter) => void;
  isExporting: string | null;
  formatLength: (seconds: number) => string;
}

export const ChapterList: React.FC<ChapterListProps> = ({
  chapters,
  projectId,
  jobs,
  isAssemblyMode,
  selectedChapters,
  onSelectChapter,
  onSelectAll,
  onReorder,
  onEditChapter,
  onRenameChapter,
  onQueueChapter,
  onResetAudio,
  onDeleteChapter,
  onExportSample,
  isExporting,
  formatLength
}) => {
  const [editingTitleId, setEditingTitleId] = React.useState<string | null>(null);
  const [tempTitle, setTempTitle] = React.useState('');
  const [openMenuRowId, setOpenMenuRowId] = React.useState<string | null>(null);
  const skipBlurSaveId = React.useRef<string | null>(null);

  if (chapters.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <FileText size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
        <p style={{ color: 'var(--text-muted)' }}>No chapters yet. Add one to get started.</p>
      </div>
    );
  }

  const allDoneIds = chapters.filter(c => c.audio_status === 'done').map(c => c.id);
  const isAllSelected = selectedChapters.size === allDoneIds.length && allDoneIds.length > 0;

  return (
    <div style={{ background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
      {isAssemblyMode && (
        <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', background: 'var(--surface-light)', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <button onClick={onSelectAll} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}>
            {isAllSelected ? <CheckSquare size={20} /> : <Square size={20} />}
          </button>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Select All Chapters</span>
        </div>
      )}
      
      <Reorder.Group axis="y" values={chapters} onReorder={onReorder} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {chapters.map((chap, idx) => {
          const relevantJobs = Object.values(jobs).filter(j => j.project_id === projectId && (j.chapter_id === chap.id || (j.chapter_file && j.chapter_file.includes(chap.id))));
          const activeJob = relevantJobs.find(j => ['running', 'preparing', 'finalizing', 'queued'].includes(j.status));
          const isMenuOpen = openMenuRowId === chap.id;

          return (
            <Reorder.Item 
                key={chap.id} value={chap} 
                className={`chapter-row ${isMenuOpen ? 'is-menu-open' : ''}`}
                initial={{ opacity: 0 }} animate={{ opacity: 1, backgroundColor: isMenuOpen ? 'var(--as-info-tint)' : 'var(--surface)' }}
                style={{ padding: '0.4rem 1.25rem', borderBottom: idx === chapters.length - 1 ? 'none' : '1px solid var(--border)', display: 'flex', gap: '1rem', alignItems: 'center', cursor: 'grab', position: 'relative', zIndex: (activeJob || isMenuOpen) ? 5 : 1 }}
                dragListener={!isAssemblyMode}
                onClick={() => isAssemblyMode && chap.audio_status === 'done' && onSelectChapter(chap.id)}
            >
              {!isAssemblyMode && (
                <div className="drag-handle" style={{ position: 'absolute', left: '-7px', top: '50%', transform: 'translateY(-50%)', cursor: 'grab', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: '4px', padding: '4px 0', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', zIndex: 10 }}>
                  <GripVertical size={14} />
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '30px', flexShrink: 0 }}>
                {isAssemblyMode && (
                  <div style={{ color: chap.audio_status === 'done' ? 'var(--accent)' : 'var(--border)', cursor: chap.audio_status === 'done' ? 'pointer' : 'not-allowed' }}>
                    {selectedChapters.has(chap.id) && chap.audio_status === 'done' ? <CheckSquare size={18} /> : <Square size={18} />}
                  </div>
                )}
                <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--surface-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', fontSize: '0.75rem', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{idx + 1}</div>
              </div>

              {!isAssemblyMode && (
                <ActionMenu 
                  onOpenChange={(open) => setOpenMenuRowId(open ? chap.id : null)}
                  trigger={<StatusOrb chap={chap} activeJob={activeJob} doneSegments={chap.done_segments_count} totalSegments={chap.total_segments_count} />}
                  items={[
                    { label: 'Queue rebuild', icon: RefreshCw, onClick: () => onQueueChapter(chap) }
                  ].filter(() => {
                    const isStale = chap.text_last_modified && chap.audio_generated_at && (chap.text_last_modified > chap.audio_generated_at);
                    const isPartial = (chap.done_segments_count || 0) > 0 && (chap.done_segments_count || 0) < (chap.total_segments_count || 0) && !chap.has_wav;
                    return isStale || isPartial || (chap.audio_status !== 'processing' && !chap.has_wav && !activeJob);
                  })}
                />
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: isAssemblyMode && chap.audio_status !== 'done' ? 0.4 : 1, cursor: isAssemblyMode ? 'default' : 'pointer', minWidth: '150px', flex: '1 1 0' }} onClick={() => !isAssemblyMode && onEditChapter(chap.id)}>
                {editingTitleId === chap.id ? (
                  <input autoFocus value={tempTitle} onChange={e => setTempTitle(e.target.value)} onClick={e => e.stopPropagation()} 
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); skipBlurSaveId.current = chap.id; onRenameChapter(chap.id, tempTitle); setEditingTitleId(null); }
                      else if (e.key === 'Escape') { skipBlurSaveId.current = chap.id; setEditingTitleId(null); }
                    }}
                    onBlur={() => { if (skipBlurSaveId.current === chap.id) { skipBlurSaveId.current = null; return; } onRenameChapter(chap.id, tempTitle); setEditingTitleId(null); }}
                    style={{ fontWeight: 500, fontSize: '0.95rem', background: 'var(--surface-light)', border: '1px solid var(--accent)', borderRadius: '4px', color: 'var(--text-primary)', padding: '0 4px', width: '100%', maxWidth: '200px' }}
                  />
                ) : (
                  <h4 onClick={e => { if (!isAssemblyMode) { e.stopPropagation(); setEditingTitleId(chap.id); setTempTitle(chap.title); } }} style={{ fontWeight: 500, fontSize: '0.95rem', cursor: 'text' }}>{chap.title}</h4>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem', flex: '2 1 0', minWidth: 0 }}>
                {activeJob ? (
                    <div style={{ width: '100%', maxWidth: '600px' }}>
                        <PredictiveProgressBar 
                          progress={activeJob.progress || 0} 
                          startedAt={activeJob.status !== 'queued' ? activeJob.started_at : undefined} 
                          etaSeconds={activeJob.eta_seconds}
                          status={activeJob.status}
                          label={activeJob.status} 
                        />
                    </div>
                ) : chap.audio_status === 'done' && (chap.has_wav || chap.has_mp3) && !isAssemblyMode ? (
                  <audio controls key={chap.id} style={{ height: '36px', width: '100%', maxWidth: '600px' }} onClick={e => e.stopPropagation()} preload="metadata">
                    {(() => {
                      const audioPath = chap.audio_file_path;
                      if (!audioPath) {
                        return (
                          <>
                            <source src={`/projects/${projectId}/audio/${chap.id}.mp3`} type="audio/mpeg" />
                            <source src={`/projects/${projectId}/audio/${chap.id}.wav`} type="audio/wav" />
                          </>
                        );
                      }
                      const wavPath = audioPath.replace(/\.[^.]+$/, '.wav');
                      const mp3Path = audioPath.replace(/\.[^.]+$/, '.mp3');
                      return (
                        <>
                          <source src={`/projects/${projectId}/audio/${audioPath}`} />
                          {audioPath !== mp3Path && <source src={`/projects/${projectId}/audio/${mp3Path}`} type="audio/mpeg" />}
                          {audioPath !== wavPath && <source src={`/projects/${projectId}/audio/${wavPath}`} type="audio/wav" />}
                        </>
                      );
                    })()}
                  </audio>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>~{formatLength(chap.predicted_audio_length || 0)} runtime</span>
                )}
                
                {!isAssemblyMode && (
                  <>
                    <div style={{ display: 'flex', gap: '0.15rem', borderLeft: '1px solid var(--border)', paddingLeft: '1rem' }}>
                      <button onClick={e => { e.stopPropagation(); onQueueChapter(chap); }} className="btn-ghost" disabled={chap.audio_status === 'processing'} style={{ padding: '0.4rem', color: 'var(--accent)' }}><Zap size={16} /></button>
                      <button onClick={e => { e.stopPropagation(); onEditChapter(chap.id); }} className="btn-ghost" style={{ padding: '0.4rem', color: 'var(--text-secondary)' }}><Edit3 size={16} /></button>
                    </div>
                    <ActionMenu 
                      onOpenChange={open => setOpenMenuRowId(open ? chap.id : null)}
                      items={[
                        { label: isExporting === chap.id ? 'Generating...' : 'Export Video Sample', icon: isExporting === chap.id ? Loader2 : Video, disabled: chap.audio_status !== 'done' || isExporting !== null, onClick: () => onExportSample(chap) },
                        ...(chap.audio_status === 'done' && chap.audio_file_path ? [{ label: 'Download Audio', icon: Download, onClick: () => { const path = chap.audio_file_path; if (!path) return; const link = document.createElement('a'); link.href = `/projects/${projectId}/audio/${path}`; link.download = `${chap.title}${path.substring(path.lastIndexOf('.'))}`; link.click(); } }] : []),
                        { isDivider: true },
                        { label: 'Reset Audio', icon: RefreshCw, onClick: () => onResetAudio(chap.id) },
                        { label: 'Delete Chapter', icon: Trash2, isDestructive: true, onClick: () => onDeleteChapter(chap.id) }
                      ]}
                    />
                  </>
                )}
              </div>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>
    </div>
  );
};
