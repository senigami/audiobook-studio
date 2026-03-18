import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Zap, ArrowUpDown } from 'lucide-react';
import { api } from '../api';
import type { Project, Chapter, Job, Audiobook, SpeakerProfile } from '../types';

// Extracted Components
import { ProjectHeader } from './project/ProjectHeader';
import { AssemblyProgress } from './project/AssemblyProgress';
import { ChapterList } from './project/ChapterList';
import { AddChapterModal, EditProjectModal, CoverImageModal } from './project/ProjectModals';
import { ChapterEditor } from './ChapterEditor';
import { CharactersTab } from './CharactersTab';
import { ConfirmModal } from './ConfirmModal';

// Extracted Hooks
import { useProjectActions } from '../hooks/useProjectActions';

interface ProjectViewProps {
  jobs: Record<string, Job>;
  speakerProfiles: SpeakerProfile[];
  speakers: import('../types').Speaker[];
  refreshTrigger?: number;
  segmentUpdate?: { chapterId: string; tick: number };
}

export const ProjectView: React.FC<ProjectViewProps> = ({ jobs, speakerProfiles, speakers, refreshTrigger = 0, segmentUpdate }) => {
  const { projectId } = useParams() as { projectId: string };
  const navigate = useNavigate();
  
  const [project, setProject] = useState<Project | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<'chapters' | 'characters'>('chapters');
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [availableAudiobooks, setAvailableAudiobooks] = useState<Audiobook[]>([]);
  const [isAssemblyMode, setIsAssemblyMode] = useState(false);
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [isExporting, setIsExporting] = useState<string | null>(null);

  // Modal visibility
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
    confirmText?: string;
  } | null>(null);

  useEffect(() => {
    if (speakerProfiles.length === 0) return;
    const voiceStillAvailable = selectedVoice && speakerProfiles.some(p => p.name === selectedVoice);
    if (voiceStillAvailable) return;

    const defaultProfile = speakerProfiles.find(p => p.is_default)?.name || speakerProfiles[0]?.name || '';
    if (defaultProfile) {
      setSelectedVoice(defaultProfile);
    }
  }, [speakerProfiles, selectedVoice]);

  const loadData = async () => {
    try {
      const [projData, chapsData] = await Promise.all([
        api.fetchProject(projectId),
        api.fetchChapters(projectId)
      ]);
      setProject(projData);
      setChapters(chapsData);
      try {
        const audiobooksData = await api.fetchProjectAudiobooks(projectId);
        setAvailableAudiobooks(audiobooksData || []);
      } catch (err) { setAvailableAudiobooks([]); }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const {
    submitting,
    handleCreateChapter,
    handleUpdateProject,
    handleDeleteChapter,
    handleReorderChapters,
    handleQueueChapter,
    handleResetChapterAudio,
    handleQueueAllUnprocessed,
    handleAssembleProject,
    handleDeleteAudiobook
  } = useProjectActions(projectId, loadData, navigate);

  useEffect(() => { loadData(); }, [projectId, refreshTrigger]);

  const formatLength = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins < 60) return `${mins}m ${secs}s`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatRelativeTime = (timestamp?: number) => {
    if (!timestamp) return 'Unknown';
    const diff = Math.floor((Date.now() / 1000) - timestamp);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  if (loading) return <div style={{ padding: '2rem' }}>Loading project...</div>;
  if (!project) return <div style={{ padding: '2rem' }}>Project not found.</div>;

  if (editingChapterId) {
      const activeIdx = chapters.findIndex(c => c.id === editingChapterId);
      return (
          <ChapterEditor 
              chapterId={editingChapterId} projectId={projectId} speakerProfiles={speakerProfiles} speakers={speakers}
              job={Object.values(jobs).find(j => j.project_id === projectId && (j.chapter_id === editingChapterId || j.chapter_file?.includes(editingChapterId)))}
              onBack={() => { setEditingChapterId(null); loadData(); }}
              onNavigateToQueue={() => navigate('/queue')}
              selectedVoice={selectedVoice} onVoiceChange={setSelectedVoice}
              onNext={activeIdx < chapters.length - 1 ? () => setEditingChapterId(chapters[activeIdx + 1].id) : undefined}
              onPrev={activeIdx > 0 ? () => setEditingChapterId(chapters[activeIdx - 1].id) : undefined}
              segmentUpdate={segmentUpdate}
          />
      );
  }

  const mergedVoices = [...(speakers || []).map(s => ({ id: s.id, name: s.name })), 
                        ...(speakerProfiles || []).filter(p => !p.speaker_id || !speakers.some(s => s.id === p.speaker_id))
                        .map(p => ({ id: `unassigned-${p.name}`, name: p.name }))];

  const totalRuntime = (Array.isArray(chapters) ? chapters : []).reduce((acc, c) => acc + (c.audio_status === 'done' ? (c.audio_length_seconds || c.predicted_audio_length || 0) : 0), 0);
  const totalPredicted = (Array.isArray(chapters) ? chapters : []).reduce((acc, c) => acc + (c.predicted_audio_length || 0), 0);

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '4rem' }}>
      <ProjectHeader 
        project={project} totalRuntime={totalRuntime} totalPredicted={totalPredicted} availableAudiobooks={availableAudiobooks}
        onBack={() => navigate('/')} onEditMetadata={() => setShowEditProjectModal(true)} onShowCover={() => setShowCoverModal(true)}
        onStartAssembly={() => { setSelectedChapters(new Set(chapters.filter(c => c.audio_status === 'done').map(c => c.id))); setIsAssemblyMode(true); }}
        onDeleteAudiobook={handleDeleteAudiobook} formatLength={formatLength} formatFileSize={formatFileSize} formatRelativeTime={formatRelativeTime}
      />

      <AssemblyProgress project={project} activeAssemblyJob={Object.values(jobs).find(j => j.engine === 'audiobook' && j.project_id === projectId && j.status !== 'done')} 
                        finishedAssemblyJob={Object.values(jobs).find(j => j.engine === 'audiobook' && j.project_id === projectId && j.status === 'done')} />

      <div style={{ display: 'flex', gap: '0.75rem', padding: '0 0.5rem' }}>
          <button onClick={() => setCurrentTab('chapters')} className={currentTab === 'chapters' ? 'btn-primary' : 'btn-ghost'} style={{ fontWeight: 700, fontSize: '0.9rem' }}>Chapters</button>
          <button onClick={() => setCurrentTab('characters')} className={currentTab === 'characters' ? 'btn-primary' : 'btn-ghost'} style={{ fontWeight: 700, fontSize: '0.9rem' }}>Characters</button>
      </div>

      {currentTab === 'characters' ? (
          <CharactersTab projectId={projectId} speakers={speakers} speakerProfiles={speakerProfiles} />
      ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{isAssemblyMode ? 'Select Chapters for Assembly' : 'Chapters'}</h3>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                      {isAssemblyMode ? (
                        <>
                          <button onClick={() => setIsAssemblyMode(false)} className="btn-ghost" style={{ fontSize: '0.85rem' }}>Cancel</button>
                          <button onClick={() => handleAssembleProject(Array.from(selectedChapters))} disabled={submitting || selectedChapters.size === 0} className="btn-primary" style={{ fontSize: '0.85rem' }}>Confirm Assembly</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => handleQueueAllUnprocessed(chapters, jobs, selectedVoice)} className="btn-ghost" style={{ border: '1px solid var(--border)', color: 'var(--accent)', fontSize: '0.85rem' }}><Zap size={16} /> Queue Remaining</button>
                          <select value={selectedVoice} onChange={e => setSelectedVoice(e.target.value)} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '0.85rem', padding: '0.25rem 0.5rem' }}>
                              <option value="">Default Speaker</option>
                              {mergedVoices.map(v => <option key={v.id} value={v.name}>{v.name}</option>)}
                          </select>
                          <button onClick={() => handleReorderChapters([...chapters].sort((a,b) => a.title.localeCompare(b.title, undefined, {numeric: true})))} className="btn-ghost" style={{ border: '1px solid var(--border)', fontSize: '0.85rem' }}><ArrowUpDown size={16} /> Sort A-Z</button>
                          <button onClick={() => setShowAddModal(true)} className="btn-primary" style={{ fontSize: '0.85rem' }}><Plus size={16} /> Add Chapter</button>
                        </>
                      )}
                  </div>
              </div>

              <ChapterList 
                chapters={chapters} projectId={projectId} jobs={jobs} isAssemblyMode={isAssemblyMode} selectedChapters={selectedChapters}
                onSelectChapter={id => setSelectedChapters(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
                onSelectAll={() => { const allDone = chapters.filter(c => c.audio_status === 'done').map(c => c.id); setSelectedChapters(selectedChapters.size === allDone.length ? new Set() : new Set(allDone)); }}
                onReorder={(newOrder) => { setChapters(newOrder); handleReorderChapters(newOrder); }}
                onEditChapter={setEditingChapterId} 
                onRenameChapter={async (id, title) => { await api.updateChapter(id, { title }); await loadData(); }}
                onQueueChapter={chap => { if (chap.char_count > 50000) setConfirmConfig({ title: 'Large Chapter', message: 'Chapter is long. Queue anyway?', onConfirm: () => handleQueueChapter(chap.id, selectedVoice) }); else handleQueueChapter(chap.id, selectedVoice); }}
                onResetAudio={id => setConfirmConfig({ title: 'Reset Audio', message: 'Delete all audio for this chapter?', isDestructive: true, onConfirm: () => handleResetChapterAudio(id) })}
                onDeleteChapter={id => setConfirmConfig({ title: 'Delete Chapter', message: 'Permanently delete this chapter?', isDestructive: true, onConfirm: () => handleDeleteChapter(id) })}
                onExportSample={async chap => { setIsExporting(chap.id); const res = await api.exportSample(chap.id, projectId); if (res.url) window.open(res.url, '_blank'); setIsExporting(null); }}
                isExporting={isExporting} formatLength={formatLength}
              />
          </div>
      )}

      <AddChapterModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} onSubmit={async (t, tx, f) => { if (await handleCreateChapter(t, tx, f, chapters.length)) setShowAddModal(false); }} submitting={submitting} />
      <EditProjectModal isOpen={showEditProjectModal} onClose={() => setShowEditProjectModal(false)} project={project} onSubmit={async d => { if (await handleUpdateProject(d)) setShowEditProjectModal(false); }} submitting={submitting} />
      <CoverImageModal isOpen={showCoverModal} onClose={() => setShowCoverModal(false)} imagePath={project.cover_image_path || ''} />

      <ConfirmModal isOpen={!!confirmConfig} title={confirmConfig?.title || ''} message={confirmConfig?.message || ''} onConfirm={() => { confirmConfig?.onConfirm(); setConfirmConfig(null); }} onCancel={() => setConfirmConfig(null)} isDestructive={confirmConfig?.isDestructive} confirmText={confirmConfig?.confirmText} />
    </div>
  );
};
