import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Plus, Zap, ArrowUpDown, Book } from 'lucide-react';
import { api } from '../api';
import type {
  Project,
  Chapter,
  Job,
  Audiobook,
  SpeakerProfile,
  Settings,
  SegmentProgress,
  TtsEngine,
  Character,
} from '../types';
import type { StudioShellState } from '../app/navigation/model';

// Extracted Components
import { ProjectBreadcrumbs } from './project/ProjectBreadcrumbs';
import { ProjectSubnav } from './project/ProjectSubnav';
import { ProjectHeader } from './project/ProjectHeader';
import { AssemblyProgress } from './project/AssemblyProgress';
import { ChapterList } from './project/ChapterList';
import { AddChapterModal, EditProjectModal, CoverImageModal } from './project/ProjectModals';
import { ChapterEditor } from './ChapterEditor';
import { CharactersTab } from './CharactersTab';
import { AssemblyPanel } from './project/AssemblyPanel';
import { VoiceProfileSelect } from './chapter/VoiceProfileSelect';
import { ProjectBackupsPanel } from './ProjectBackupsPanel';
import { ConfirmModal } from './ConfirmModal';

// Extracted Hooks
import { useProjectActions } from '../hooks/useProjectActions';
import { buildVoiceOptions, getDefaultVoiceProfileName, getVoiceOptionLabel } from '../utils/voiceProfiles';
import { isChapterScopedJob, isSegmentScopedJob, pickRelevantJob } from '../utils/jobSelection';

interface ProjectViewProps {
  jobs: Record<string, Job>;
  segmentProgress?: Record<string, SegmentProgress>;
  speakerProfiles: SpeakerProfile[];
  speakers: import('../types').Speaker[];
  settings?: Settings;
  engines?: TtsEngine[];
  refreshTrigger?: number;
  segmentUpdate?: { chapterId: string; tick: number };
  chapterUpdate?: { chapterId: string; tick: number };
  shellState?: StudioShellState;
  onOpenQueue?: () => void;
}

export const ProjectView: React.FC<ProjectViewProps> = ({
  jobs,
  segmentProgress = {},
  speakerProfiles,
  speakers,
  settings,
  engines = [],
  refreshTrigger = 0,
  segmentUpdate,
  chapterUpdate,
  shellState,
  onOpenQueue
}) => {
  const RECENT_DONE_WINDOW_SECONDS = 60;
  const { projectId: routeProjectId, chapterId: routeChapterId } = useParams() as { projectId?: string, chapterId?: string };
  const effectiveProjectId = routeProjectId || shellState?.navigation.activeProjectId || "";
  const editingChapterId = routeChapterId || shellState?.navigation.activeChapterId || null;

  const navigate = useNavigate();
  const location = useLocation();

  const [project, setProject] = useState<Project | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState<'chapters' | 'characters' | 'assemblies' | 'backups'>('chapters');
  const [availableAudiobooks, setAvailableAudiobooks] = useState<Audiobook[]>([]);
  const [isAssemblyMode, setIsAssemblyMode] = useState(false);
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [hasResolvedInitialVoice, setHasResolvedInitialVoice] = useState(false);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const showTooltips = windowWidth <= 1250;
  const anyEnginesEnabled = React.useMemo(
    () => (engines || []).length === 0 || (engines || []).some(e => e.enabled && e.status === 'ready'),
    [engines]
  );

  const pickLatestJob = React.useCallback((predicate: (job: Job) => boolean, includeDone = false) => {
    return pickRelevantJob(Object.values(jobs).filter(predicate), includeDone);
  }, [jobs]);

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
    if (!project || speakerProfiles.length === 0) return;

    const projectProfile = project.speaker_profile_name || '';

    if (selectedVoice !== projectProfile || !hasResolvedInitialVoice) {
      setSelectedVoice(projectProfile);
      setHasResolvedInitialVoice(true);
    }
  }, [project, speakerProfiles, selectedVoice, settings?.default_speaker_profile, hasResolvedInitialVoice]);

  const loadData = async (isTransition = false) => {
    if (!effectiveProjectId) return;
    if (isTransition) setLoading(true);
    try {
      const [projData, chapsData, charsData] = await Promise.all([
        api.fetchProject(effectiveProjectId),
        api.fetchChapters(effectiveProjectId),
        api.fetchCharacters(effectiveProjectId)
      ]);
      setProject(projData);
      setChapters(chapsData);
      setCharacters(charsData);
      try {
        const audiobooksData = await api.fetchProjectAudiobooks(effectiveProjectId);
        setAvailableAudiobooks(audiobooksData || []);
      } catch (err) { setAvailableAudiobooks([]); }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
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
    handleDeleteAudiobook,
    handleSaveBackup,
    handleDeleteBackup,
    handleUpdateBackupMetadata,
    handleUpdateAudiobookMetadata
  } = useProjectActions(effectiveProjectId, loadData, navigate, onOpenQueue);

  useEffect(() => {
    const isTransition = project?.id !== effectiveProjectId;
    if (isTransition) {
      setProject(null);
      setChapters([]);
    }
    loadData(isTransition);
  }, [effectiveProjectId, refreshTrigger]);

  // Sync currentTab with shellState or URL fallback
  useEffect(() => {
    const subnavId = shellState?.navigation.activeProjectSubnavId;
    if (subnavId) {
      if (subnavId === 'project-characters') {
        setCurrentTab('characters');
      } else if (subnavId === 'project-assemblies') {
        setCurrentTab('assemblies');
      } else if (subnavId === 'project-backups') {
        setCurrentTab('backups');
      } else {
        setCurrentTab('chapters');
      }
    } else {
      // Fallback for tests or non-shell usage
      const params = new URLSearchParams(location.search);
      const tab = params.get('tab');
      if (tab === 'characters') {
        setCurrentTab('characters');
      } else if (tab === 'assemblies') {
        setCurrentTab('assemblies');
      } else if (tab === 'backups') {
        setCurrentTab('backups');
      } else {
        setCurrentTab('chapters');
      }
    }
  }, [shellState?.navigation.activeProjectSubnavId, location.search]);


  const handleProjectVoiceChange = async (voice: string) => {
    const previousVoice = selectedVoice;
    const previousProjectVoice = project?.speaker_profile_name ?? null;
    setHasResolvedInitialVoice(true);
    setSelectedVoice(voice);
    setProject(prev => prev ? { ...prev, speaker_profile_name: voice || null } : prev);
    try {
      await api.updateProject(effectiveProjectId, { speaker_profile_name: voice || null });
    } catch (e) {
      console.error(e);
      setSelectedVoice(previousVoice);
      setProject(prev => prev ? { ...prev, speaker_profile_name: previousProjectVoice } : prev);
    }
  };

  const mergedVoices = React.useMemo(
    () => buildVoiceOptions(speakerProfiles || [], speakers || [], engines, characters),
    [speakerProfiles, speakers, engines, characters]
  );
  const availableVoiceNames = React.useMemo(() => new Set(mergedVoices.map(v => v.value)), [mergedVoices]);
  const effectiveProjectVoice = React.useMemo(() => {
    return selectedVoice
      || project?.speaker_profile_name
      || settings?.default_speaker_profile
      || getDefaultVoiceProfileName(speakerProfiles)
      || '';
  }, [selectedVoice, project?.speaker_profile_name, settings?.default_speaker_profile, speakerProfiles]);
  const projectDefaultVoiceLabel = React.useMemo(() => {
    const fallbackVoiceLabel = getVoiceOptionLabel(effectiveProjectVoice, speakerProfiles, speakers, engines, characters);
    return fallbackVoiceLabel ? `Default Speaker (${fallbackVoiceLabel})` : 'Default Speaker';
  }, [effectiveProjectVoice, speakerProfiles, speakers, engines, characters]);

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

  if (loading) return <div style={{ padding: '2rem' }}>{editingChapterId ? 'Loading chapter...' : 'Loading project...'}</div>;
  if (!project) return <div style={{ padding: '2rem' }}>Project not found.</div>;

  const totalRuntime = (Array.isArray(chapters) ? chapters : []).reduce((acc, c) => acc + (c.audio_status === 'done' ? (c.audio_length_seconds || c.predicted_audio_length || 0) : 0), 0);
  const totalPredicted = (Array.isArray(chapters) ? chapters : []).reduce((acc, c) => acc + (c.predicted_audio_length || 0), 0);
  const activeChapter = editingChapterId ? chapters.find(c => c.id === editingChapterId) || null : null;

  // Derive editor state
  const matchingChapterJobs = Object.values(jobs).filter(j =>
    j.project_id === effectiveProjectId &&
    (j.chapter_id === editingChapterId || j.chapter_file?.includes(editingChapterId || 'none'))
  );
  const chapterRenderJobs = matchingChapterJobs.filter(isChapterScopedJob);
  const segmentGenerationJobs = matchingChapterJobs.filter(isSegmentScopedJob);
  const includeDoneForEditor = !!activeChapter
    && activeChapter.audio_status !== 'processing'
    && !(activeChapter.has_wav || activeChapter.has_mp3 || activeChapter.has_m4a)
    && chapterRenderJobs.some(j =>
      j.status === 'done' &&
      !!j.finished_at &&
      ((Date.now() / 1000) - j.finished_at) <= RECENT_DONE_WINDOW_SECONDS
    );
  const segmentJobs = segmentGenerationJobs.filter(j =>
    ['queued', 'preparing', 'running', 'finalizing'].includes(j.status)
  );
  const activeIdx = chapters.findIndex(c => c.id === editingChapterId);

  return (
    <div
      className="project-view-root animate-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: editingChapterId ? 'calc(100vh - 72px)' : 'none',
        height: editingChapterId ? 'calc(100vh - 72px)' : 'auto',
        overflow: editingChapterId ? 'hidden' : 'visible',
        marginTop: '-3rem', // Align breadcrumb strip to top of Layout padding
        position: 'relative'
      }}
    >
      <ProjectBreadcrumbs
        projectId={effectiveProjectId}
        projectTitle={project.name}
        chapterTitle={activeChapter?.title || undefined}
        selectedChapterId={editingChapterId || undefined}
        chapters={chapters}
        onProjectClick={editingChapterId ? () => navigate(`/project/${effectiveProjectId}`) : undefined}
        onNavigateChapter={(id) => navigate(`/chapter/${id}`)}
      />

      <div
        className="project-view-content"
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: editingChapterId ? 1 : 'none',
          minHeight: 0,
          padding: '0 2.5rem',
          paddingBottom: editingChapterId ? 0 : '4rem',
          gap: editingChapterId ? 0 : '1.5rem'
        }}
      >
        <ProjectHeader
          project={project}
          totalRuntime={totalRuntime}
          totalPredicted={totalPredicted}
          onEditMetadata={() => setShowEditProjectModal(true)}
          onShowCover={() => setShowCoverModal(true)}
          formatLength={formatLength}
          compact={!!editingChapterId}
        />

        {editingChapterId ? (
          <ChapterEditor
            chapterId={editingChapterId}
            projectId={effectiveProjectId}
            speakerProfiles={speakerProfiles}
            speakers={speakers}
            engines={engines}
            job={pickRelevantJob(chapterRenderJobs, includeDoneForEditor)}
            chapterJobs={segmentJobs}
            segmentProgress={segmentProgress}
            selectedVoice={effectiveProjectVoice}
            onNext={activeIdx < chapters.length - 1 ? () => navigate(`/chapter/${chapters[activeIdx + 1].id}`) : undefined}
            onPrev={activeIdx > 0 ? () => navigate(`/chapter/${chapters[activeIdx - 1].id}`) : undefined}
            segmentUpdate={segmentUpdate}
            chapterUpdate={chapterUpdate}
          />
        ) : (
          <>
            <AssemblyProgress
              project={project}
              activeAssemblyJob={pickLatestJob(j => j.engine === 'audiobook' && j.project_id === effectiveProjectId, false)}
              finishedAssemblyJob={pickLatestJob(j => j.engine === 'audiobook' && j.project_id === effectiveProjectId, true)}
            />

            <ProjectSubnav
              items={shellState?.projectSubnav || [
                { id: 'project-chapters', label: 'Chapters', href: `/project/${effectiveProjectId}` },
                { id: 'project-assemblies', label: 'Assemblies', href: `/project/${effectiveProjectId}?tab=assemblies` },
                { id: 'project-backups', label: 'Backups', href: `/project/${effectiveProjectId}?tab=backups` },
                { id: 'project-characters', label: 'Characters', href: `/project/${effectiveProjectId}?tab=characters` },
              ]}
              activeId={shellState?.navigation.activeProjectSubnavId || (
                currentTab === 'characters' ? 'project-characters' :
                currentTab === 'assemblies' ? 'project-assemblies' :
                currentTab === 'backups' ? 'project-backups' :
                'project-chapters'
              )}
            />

            {currentTab === 'characters' ? (
              <CharactersTab projectId={effectiveProjectId} speakers={speakers} speakerProfiles={speakerProfiles} engines={engines} />
            ) : currentTab === 'assemblies' ? (
              <AssemblyPanel
                availableAudiobooks={availableAudiobooks}
                onStartAssembly={() => {
                  setCurrentTab('chapters');
                  setSelectedChapters(new Set(chapters.filter(c => c.audio_status === 'done').map(c => c.id)));
                  setIsAssemblyMode(true);
                  navigate(`/project/${effectiveProjectId}`);
                }}
                onDeleteAudiobook={handleDeleteAudiobook}
                onUpdateMetadata={handleUpdateAudiobookMetadata}
                formatLength={formatLength}
                formatFileSize={formatFileSize}
                formatRelativeTime={formatRelativeTime}
              />
            ) : currentTab === 'backups' ? (
              <ProjectBackupsPanel
                projectId={effectiveProjectId}
                onSaveBackup={handleSaveBackup}
                onDeleteBackup={handleDeleteBackup}
                onUpdateMetadata={handleUpdateBackupMetadata}
                submitting={submitting}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{isAssemblyMode ? 'Select Chapters for Assembly' : 'Chapters'}</h3>
                  <div className="project-action-bar" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {isAssemblyMode ? (
                      <>
                        <button onClick={() => setIsAssemblyMode(false)} className="btn-ghost" style={{ fontSize: '0.85rem' }}>Cancel</button>
                        <button onClick={() => handleAssembleProject(Array.from(selectedChapters))} disabled={submitting || selectedChapters.size === 0} className="btn-primary" style={{ fontSize: '0.85rem' }}>Confirm Assembly</button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setSelectedChapters(new Set(chapters.filter(c => c.audio_status === 'done').map(c => c.id)));
                            setIsAssemblyMode(true);
                          }}
                          className="btn-ghost"
                          title={showTooltips ? "Assemble Project" : undefined}
                          style={{ border: '1px solid var(--border)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                          <Book size={16} /> <span className="hide-on-mobile">Assemble Project</span>
                        </button>
                        <button
                          onClick={() => handleQueueAllUnprocessed(chapters, jobs, effectiveProjectVoice)}
                          className="btn-ghost"
                          disabled={!anyEnginesEnabled}
                          title={!anyEnginesEnabled ? 'All TTS engines are disabled in Settings' : (showTooltips ? 'Queue all unprocessed chapters' : undefined)}
                          style={{ border: '1px solid var(--border)', color: anyEnginesEnabled ? 'var(--accent)' : 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                          <Zap size={16} /> <span className="hide-on-mobile">Queue Remaining</span>
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--surface-light)', padding: '2px 8px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Speaker:</span>
                            <VoiceProfileSelect
                                value={selectedVoice}
                                onChange={handleProjectVoiceChange}
                                options={mergedVoices}
                                defaultLabel={projectDefaultVoiceLabel}
                                style={{ background: 'transparent', border: 'none', padding: '0.25rem 0', maxWidth: '150px' }}
                            />
                        </div>

                        <button
                            onClick={() => handleReorderChapters([...chapters].sort((a,b) => a.title.localeCompare(b.title, undefined, {numeric: true})))}
                            className="btn-ghost"
                            title={showTooltips ? "Sort A-Z" : undefined}
                            style={{ border: '1px solid var(--border)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <ArrowUpDown size={16} /> <span className="hide-on-mobile">Sort</span>
                        </button>

                        <button
                            onClick={() => setShowAddModal(true)}
                            className="btn-primary"
                            title={showTooltips ? "Add Chapter" : undefined}
                            style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                            <Plus size={16} /> <span className="hide-on-mobile">Add Chapter</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <ChapterList
                  chapters={chapters} projectId={effectiveProjectId} jobs={jobs} isAssemblyMode={isAssemblyMode} selectedChapters={selectedChapters}
                  anyEnginesEnabled={anyEnginesEnabled}
                  onSelectChapter={id => setSelectedChapters(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
                  onSelectAll={() => { const allDone = chapters.filter(c => c.audio_status === 'done').map(c => c.id); setSelectedChapters(selectedChapters.size === allDone.length ? new Set() : new Set(allDone)); }}
                  onReorder={(newOrder) => { setChapters(newOrder); handleReorderChapters(newOrder); }}
                  onEditChapter={id => navigate(`/chapter/${id}`)}
                  onRenameChapter={async (id, title) => { await api.updateChapter(id, { title }); await loadData(); }}
                  onQueueChapter={chap => { if (chap.char_count > 50000) setConfirmConfig({ title: 'Large Chapter', message: 'Chapter is long. Queue anyway?', onConfirm: () => handleQueueChapter(chap.id, effectiveProjectVoice) }); else handleQueueChapter(chap.id, effectiveProjectVoice); }}
                  onResetAudio={id => setConfirmConfig({ title: 'Reset Audio', message: 'Delete all audio for this chapter?', isDestructive: true, onConfirm: () => handleResetChapterAudio(id) })}
                  onDeleteChapter={id => setConfirmConfig({ title: 'Delete Chapter', message: 'Permanently delete this chapter?', isDestructive: true, onConfirm: () => handleDeleteChapter(id) })}
                  onExportSample={async chap => { setIsExporting(chap.id); const res = await api.exportSample(chap.id, effectiveProjectId); if (res.url) window.open(res.url, '_blank'); setIsExporting(null); }}
                  isExporting={isExporting} formatLength={formatLength}
                />
              </div>
            )}
          </>
        )}
      </div>

      <AddChapterModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} onSubmit={async (t, tx, f) => { if (await handleCreateChapter(t, tx, f, chapters.length)) setShowAddModal(false); }} submitting={submitting} />
      <EditProjectModal isOpen={showEditProjectModal} onClose={() => setShowEditProjectModal(false)} project={project!} onSubmit={async d => { if (await handleUpdateProject(d)) setShowEditProjectModal(false); }} submitting={submitting} />
      <CoverImageModal isOpen={showCoverModal} onClose={() => setShowCoverModal(false)} imagePath={project?.cover_image_path || ''} />

      <ConfirmModal isOpen={!!confirmConfig} title={confirmConfig?.title || ''} message={confirmConfig?.message || ''} onConfirm={() => { confirmConfig?.onConfirm(); setConfirmConfig(null); }} onCancel={() => setConfirmConfig(null)} isDestructive={confirmConfig?.isDestructive} confirmText={confirmConfig?.confirmText} />
    </div>
  );
};
