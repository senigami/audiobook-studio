import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, FileText, CheckCircle, Clock, AlertTriangle, Edit3, Trash2, GripVertical, Zap, Image as ImageIcon, ArrowUpDown, CheckSquare, Square, MoreVertical, RefreshCw, Download, Video, Loader2 } from 'lucide-react';
import { motion, Reorder } from 'framer-motion';
import { api } from '../api';
import type { Project, Chapter, Job, Audiobook, SpeakerProfile } from '../types';
import { ChapterEditor } from './ChapterEditor';
import { PredictiveProgressBar } from './PredictiveProgressBar';
import { CharactersTab } from './CharactersTab';
import { ConfirmModal } from './ConfirmModal';

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
  const [hoveredTab, setHoveredTab] = useState<'chapters' | 'characters' | null>(null);
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const skipBlurSaveId = useRef<string | null>(null);
  const [tempTitle, setTempTitle] = useState('');
  const [availableAudiobooks, setAvailableAudiobooks] = useState<Audiobook[]>([]);
  const [isAssemblyMode, setIsAssemblyMode] = useState(false);
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<string | null>(null); // Stores chapterId
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [editProjectData, setEditProjectData] = useState({ name: '', series: '', author: '' });
  const [editCover, setEditCover] = useState<File | null>(null);
  const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null);
  const [isDraggingEditCover, setIsDraggingEditCover] = useState(false);
  const editCoverInputRef = useRef<HTMLInputElement>(null);
  const [newText, setNewText] = useState('');
  const [newFile, setNewFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
    confirmText?: string;
  } | null>(null);

  // Compute merged voices grouping for dropdowns (matches VoicesTab logic)
  const mergedVoices = React.useMemo(() => {
    const list = (speakers || []).map(s => ({ id: s.id, name: s.name, is_speaker: true }));
    const orphans = (speakerProfiles || [])
      .filter(p => !p.speaker_id || !speakers.some(s => s.id === p.speaker_id))
      .map(p => ({ id: `unassigned-${p.name}`, name: p.name, is_speaker: false }));
    return [...list, ...orphans];
  }, [speakers, speakerProfiles]);

  const loadData = async () => {
    try {
      const [projData, chapsData, audiobooksData] = await Promise.all([
        api.fetchProject(projectId),
        api.fetchChapters(projectId),
        api.fetchAudiobooks()
      ]);
      setProject(projData);
      setChapters(chapsData);
      
      // Look for assembled audiobooks matching this project's name
      if (projData && audiobooksData) {
          const projectM4bs = audiobooksData.filter((a: Audiobook) => a.filename.includes(projData.name));
          setAvailableAudiobooks(projectM4bs);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId, refreshTrigger]);

  const handleCreateChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle) return;
    setSubmitting(true);
    try {
      await api.createChapter(projectId, {
        title: newTitle,
        text_content: newText,
        sort_order: chapters.length,
        file: newFile || undefined
      });
      setShowAddModal(false);
      setNewTitle('');
      setNewText('');
      setNewFile(null);
      loadData();
    } catch (e) {
      console.error("Failed to create chapter", e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleEditCoverSelection(file);
  };

  const handleEditCoverSelection = (file: File) => {
      setEditCover(file);
      const reader = new FileReader();
      reader.onloadend = () => setEditCoverPreview(reader.result as string);
      reader.readAsDataURL(file);
  };

  const handleEditCoverDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingEditCover(true);
  };

  const handleEditCoverDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingEditCover(false);
  };

  const handleEditCoverDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingEditCover(false);
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) {
          handleEditCoverSelection(file);
      }
  };

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
        await api.updateProject(projectId, {
            name: editProjectData.name,
            series: editProjectData.series,
            author: editProjectData.author,
            cover: editCover || undefined
        });
        setShowEditProjectModal(false);
        setEditCover(null);
        loadData();
    } catch (e) {
        console.error("Failed to update project", e);
    } finally {
        setSubmitting(false);
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    setConfirmConfig({
      title: 'Delete Chapter',
      message: 'Are you sure you want to delete this chapter? This will permanently remove all text and generated audio.',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.deleteChapter(chapterId);
          await loadData();
        } catch (e) {
          console.error("Delete failed", e);
          setConfirmConfig({
            title: 'Delete Failed',
            message: 'Failed to delete chapter. Please check the console for details.',
            onConfirm: () => setConfirmConfig(null),
            isDestructive: false,
            confirmText: 'OK'
          });
        }
      }
    });
  };

  const formatLength = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    
    if (mins < 60) return `${mins}m ${secs}s`;
    
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  };

  // Use a ref to store pending reorder timeout so we can debounce
  const reorderTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleReorder = async (reorderedChapters: Chapter[]) => {
    setChapters(reorderedChapters);
    
    // Clear previous timeout
    if (reorderTimeoutRef.current) {
        clearTimeout(reorderTimeoutRef.current);
    }
    
    // Debounce the actual API call by 500ms
    reorderTimeoutRef.current = setTimeout(async () => {
        try {
            await api.reorderChapters(projectId, reorderedChapters.map(c => c.id));
            // We do a silent save, no need to reload all data if UI is optimistic
        } catch (e) {
            console.error("Failed to save chapter order", e);
            loadData(); // revert on failure
        }
    }, 500);
  };

  const handleQueueChapter = async (chap: Chapter) => {
    if (chap.char_count > 50000) {
        setConfirmConfig({
            title: 'Large Chapter Warning',
            message: `This chapter is quite long (${chap.char_count.toLocaleString()} characters). Generating audio for very large chapters in a single job may cause memory issues or take a long time to recover if interrupted.\n\nIt is recommended to split this chapter manually into smaller parts.\n\nDo you wish to queue it anyway?`,
            isDestructive: false,
            confirmText: 'Queue Anyway',
            onConfirm: () => {
                setConfirmConfig(null);
                executeQueue(chap);
            }
        });
        return;
    }
    executeQueue(chap);
  };

  const executeQueue = async (chap: Chapter) => {
    try {
        await api.addProcessingQueue(projectId, chap.id, 0, selectedVoice || undefined);
        loadData();
    } catch (e) {
        console.error("Failed to enqueue", e);
    } finally {
        setSubmitting(false);
    }
  };

  const handleResetChapterAudio = async (chapterId: string) => {
    setConfirmConfig({
      title: 'Reset Chapter Audio',
      message: 'Reset audio for this chapter? Physical files will be deleted and status reset.',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.resetChapter(chapterId);
          loadData();
        } catch (e) {
          console.error("Reset failed", e);
        }
      }
    });
  };

  const handleExportSample = async (chapter: Chapter) => {
    setIsExporting(chapter.id);
    try {
        const res = await api.exportSample(chapter.id, projectId);
        if (res.url) {
            window.open(res.url, '_blank');
        } else {
            alert(res.message || 'Export failed');
        }
    } catch (err) {
        console.error('Export failed', err);
        alert('Export failed');
    } finally {
        setIsExporting(null);
    }
  };

  const handleQueueAllUnprocessed = async () => {
      const liveQueuedChapterIds = new Set(
          Object.values(jobs)
              .filter(j => j.engine !== 'audiobook' && (j.status === 'queued' || j.status === 'running'))
              .map(j => {
                  // Reconstruct chapter ID from the file name, handling the _split format.
                  // E.g. cid_0 -> cid
                  const stem = j.chapter_file.replace('.txt', '');
                  const parts = stem.split('_'); 
                  if (parts.length > 1 && !isNaN(Number(parts[parts.length - 1]))) {
                      parts.pop(); 
                  }
                  return parts.join('_');
              })
      );

      const unprocessed = chapters.filter(c => 
          (c.audio_status === 'unprocessed' || c.audio_status === 'error') && 
          !liveQueuedChapterIds.has(c.id)
      );
      if (unprocessed.length === 0) {
          alert("All chapters are already processed or queued.");
          return;
      }

      setSubmitting(true);
      try {
          for (const chap of unprocessed) {
              await api.addProcessingQueue(projectId, chap.id, 0, selectedVoice || undefined);
          }
          loadData();
          navigate('/queue');
      } catch (e) {
          console.error("Failed to enqueue all", e);
          alert("Some chapters failed to queue.");
      } finally {
          setSubmitting(false);
      }
  };

  const handleStartAssemblyMode = () => {
    const defaultSelected = new Set(chapters.filter(c => c.audio_status === 'done').map(c => c.id));
    setSelectedChapters(defaultSelected);
    setIsAssemblyMode(true);
  };

  const handleConfirmAssembly = async () => {
    if (selectedChapters.size === 0) {
        alert("Please select at least one chapter to assemble.");
        return;
    }
    setSubmitting(true);
    try {
        await api.assembleProject(projectId, Array.from(selectedChapters));
        setIsAssemblyMode(false);
        loadData();
    } catch (e) {
        console.error("Assembly failed", e);
        alert("Assembly failed.");
    } finally {
        setSubmitting(false);
    }
  };

  const handleSortChapters = async () => {
      const sorted = [...chapters].sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }));
      await handleReorder(sorted);
  };

  if (loading) return <div style={{ padding: '2rem' }}>Loading project...</div>;
  if (!project) return <div style={{ padding: '2rem' }}>Project not found.</div>;

  const activeAssemblyJob = Object.values(jobs).find(j => j.engine === 'audiobook' && j.chapter_file === project.name && j.status === 'running');
  const finishedAssemblyJob = Object.values(jobs).find(j => j.engine === 'audiobook' && j.chapter_file === project.name && j.status === 'done');

  if (editingChapterId) {
      const activeIdx = chapters.findIndex(c => c.id === editingChapterId);
      const prevChapterId = activeIdx > 0 ? chapters[activeIdx - 1].id : null;
      const nextChapterId = activeIdx !== -1 && activeIdx < chapters.length - 1 ? chapters[activeIdx + 1].id : null;

      return (
          <ChapterEditor 
              chapterId={editingChapterId} 
              projectId={projectId} 
              speakerProfiles={speakerProfiles}
              speakers={speakers}
              job={Object.values(jobs).find(j => j.project_id === projectId && j.chapter_file && j.chapter_file.startsWith(editingChapterId))}
              onBack={() => {
                  setEditingChapterId(null);
                  loadData();
              }}
              onNavigateToQueue={() => navigate('/queue')}
              selectedVoice={selectedVoice}
              onVoiceChange={setSelectedVoice}
              onNext={nextChapterId ? () => setEditingChapterId(nextChapterId) : undefined}
              onPrev={prevChapterId ? () => setEditingChapterId(prevChapterId) : undefined}
              segmentUpdate={segmentUpdate}
          />
      );
  }

  // Calculate total active runtime
  const totalRuntime = chapters.reduce((acc, chap) => {
      return acc + (chap.audio_status === 'done' ? (chap.audio_length_seconds || chap.predicted_audio_length || 0) : 0);
  }, 0);
  
  const totalPredicted = chapters.reduce((acc, chap) => acc + (chap.predicted_audio_length || 0), 0);

  const bestM4b = availableAudiobooks.length > 0 ? availableAudiobooks[0] : null;

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', minHeight: '100%', paddingBottom: '4rem' }}>
      {/* Header Overview */}
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
            onClick={() => project.cover_image_path ? setShowCoverModal(true) : null}
            style={{
                height: '200px',
                flexShrink: 0,
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                cursor: project.cover_image_path ? 'zoom-in' : 'default',
                transition: 'transform 0.2s',
            }}
            onMouseOver={(e) => { if (project.cover_image_path) e.currentTarget.style.transform = 'scale(1.02)' }}
            onMouseOut={(e) => { if (project.cover_image_path) e.currentTarget.style.transform = 'scale(1)' }}
        >
            {project.cover_image_path ? (
                <img 
                    src={project.cover_image_path} 
                    alt="Cover" 
                    style={{ 
                        width: '100%', 
                        height: '100%', 
                        objectFit: 'contain',
                    }} 
                />
            ) : (
                <ImageIcon size={48} style={{ opacity: 0.2 }} />
            )}
        </div>

        {/* Project Metadata */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                <button onClick={() => navigate('/')} className="btn-ghost" style={{ padding: '0.5rem', marginLeft: '-0.5rem' }}>
                    <ArrowLeft size={20} />
                </button>
                <div style={{ background: 'var(--surface-light)', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'inline-block' }}>
                    {project.series || 'Standalone'}
                </div>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                <h2 style={{ fontSize: '2.5rem', fontWeight: 700, lineHeight: 1.1 }}>{project.name}</h2>
                <button 
                  onClick={() => {
                      setEditProjectData({ name: project.name, series: project.series || '', author: project.author || '' });
                      setShowEditProjectModal(true);
                  }} 
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

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: '220px' }}>
            {bestM4b ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <a 
                        href={bestM4b.url || `/out/audiobook/${bestM4b.filename}`} 
                        download 
                        className="btn-primary" 
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            gap: '8px', 
                            padding: '1rem', 
                            width: '100%', 
                            fontSize: '1rem', 
                            textDecoration: 'none',
                            background: 'var(--accent)',
                            boxShadow: 'var(--shadow-md)',
                            borderRadius: '12px'
                        }}
                    >
                      <Download size={20} />
                      Download Latest M4B
                    </a>
                    {availableAudiobooks.length > 1 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>EXPORT HISTORY</span>
                            {availableAudiobooks.slice(1, 4).map((a, i) => (
                                <a key={i} href={a.url || `/out/audiobook/${a.filename}`} download style={{ fontSize: '0.75rem', color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Clock size={10} /> {a.filename.split('_').pop()?.replace('.m4b', '') || 'Previous'}
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <button className="btn-primary" disabled style={{ padding: '1rem', opacity: 0.5, cursor: 'not-allowed', width: '100%', borderRadius: '12px' }}>
                    No Assembly Yet
                </button>
            )}

            <button
                className="btn-ghost"
                onClick={handleStartAssemblyMode}
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

      {/* Assembly Progress */}
      {activeAssemblyJob && (
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
      )}

      {finishedAssemblyJob && !activeAssemblyJob && (
          <div style={{ background: 'var(--surface)', color: 'var(--success-text)', borderRadius: '12px', padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--success)' }}>
              <CheckCircle size={20} />
              <span style={{ fontWeight: 600 }}>Audiobook assembled successfully! {finishedAssemblyJob.output_mp3}</span>
          </div>
      )}

      {/* Project Tabs */}
      {!activeAssemblyJob && !finishedAssemblyJob && (
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', padding: '0 0.5rem' }}>
              <button 
                  onClick={() => setCurrentTab('chapters')}
                  onMouseEnter={() => setHoveredTab('chapters')}
                  onMouseLeave={() => setHoveredTab(null)}
                  style={{ 
                      padding: '0.6rem 1.25rem', 
                      background: currentTab === 'chapters' 
                        ? 'var(--accent)' 
                        : (hoveredTab === 'chapters' ? 'var(--accent-glow)' : 'transparent'), 
                      border: 'none', 
                      color: currentTab === 'chapters' ? 'white' : 'var(--text-muted)',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      borderRadius: 'var(--radius-button)',
                      boxShadow: currentTab === 'chapters' ? 'var(--shadow-sm)' : 'none'
                  }}
              >
                  Chapters
              </button>
              <button 
                  onClick={() => setCurrentTab('characters')}
                  onMouseEnter={() => setHoveredTab('characters')}
                  onMouseLeave={() => setHoveredTab(null)}
                  style={{ 
                      padding: '0.6rem 1.25rem', 
                      background: currentTab === 'characters' 
                        ? 'var(--accent)' 
                        : (hoveredTab === 'characters' ? 'var(--accent-glow)' : 'transparent'),
                      border: 'none', 
                      color: currentTab === 'characters' ? 'white' : 'var(--text-muted)',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      borderRadius: 'var(--radius-button)',
                      boxShadow: currentTab === 'characters' ? 'var(--shadow-sm)' : 'none'
                  }}
              >
                  Characters
              </button>
          </div>
      )}

      {currentTab === 'characters' ? (
          <CharactersTab projectId={projectId} speakers={speakers} speakerProfiles={speakerProfiles} />
      ) : (
          <>
      {/* Chapters List */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              {isAssemblyMode ? 'Select Chapters for Assembly' : 'Chapters'}
          </h3>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              {isAssemblyMode ? (
                  <>
                      <button onClick={() => setIsAssemblyMode(false)} className="btn-ghost" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }}>
                          Cancel
                      </button>
                      <button 
                          onClick={handleConfirmAssembly} 
                          disabled={submitting || selectedChapters.size === 0} 
                          className="btn-primary" 
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                      >
                          <CheckCircle size={16} /> Confirm Assembly
                      </button>
                  </>
              ) : (
                  <>
                      <button 
                          onClick={handleQueueAllUnprocessed}
                          disabled={submitting || chapters.filter(c => c.audio_status === 'unprocessed' || c.audio_status === 'error').length === 0}
                          className="btn-ghost" 
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 1rem', fontSize: '0.85rem', border: '1px solid var(--border)', color: 'var(--accent)' }}
                      >
                          <Zap size={16} /> Queue Remaining
                      </button>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--surface)', padding: '0.25rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Speaker:</span>
                          <select 
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', fontSize: '0.85rem', cursor: 'pointer' }}
                              onChange={(e) => setSelectedVoice(e.target.value)}
                              value={selectedVoice}
                          >
                              <option value="">Unassigned (Default Speaker)</option>
                              {mergedVoices.map(v => (
                                  <option key={v.id} value={v.name}>{v.name}</option>
                              ))}
                          </select>
                      </div>
                      <button 
                          onClick={handleSortChapters}
                          className="btn-ghost" 
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 1rem', fontSize: '0.85rem', border: '1px solid var(--border)' }}
                      >
                          <ArrowUpDown size={16} /> Sort A-Z
                      </button>
                      <button 
                          onClick={() => setShowAddModal(true)}
                          className="btn-primary" 
                          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                      >
                          <Plus size={16} /> Add Chapter
                      </button>
                  </>
              )}
          </div>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)' }}>
        {chapters.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <FileText size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
            <p style={{ color: 'var(--text-muted)' }}>No chapters yet. Add one to get started.</p>
          </div>
        ) : (
          <Reorder.Group axis="y" values={chapters} onReorder={handleReorder} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
            {chapters.map((chap, idx) => {
                const relevantJobs = Object.values(jobs).filter(j => 
                    j.project_id === projectId && 
                    (j.chapter_id === chap.id || (j.chapter_file && j.chapter_file.includes(chap.id)))
                );
                const activeJob = relevantJobs.find(j => ['running', 'preparing', 'finalizing', 'queued'].includes(j.status));

                return (
                  <Reorder.Item 
                key={chap.id}
                value={chap}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  padding: '0.4rem 1.25rem',
                  borderBottom: idx === chapters.length - 1 ? 'none' : '1px solid var(--border)',
                  display: 'flex',
                  gap: '1.25rem',
                  alignItems: 'center',
                  cursor: 'grab',
                  background: 'var(--surface)'
                }}
                whileDrag={{ background: 'var(--surface-alt)', boxShadow: 'var(--shadow-lg)', zIndex: 50, cursor: 'grabbing' }}
                dragListener={!isAssemblyMode}
                onClick={() => {
                    if (isAssemblyMode && chap.audio_status === 'done') {
                        const newSet = new Set(selectedChapters);
                        if (newSet.has(chap.id)) newSet.delete(chap.id);
                        else newSet.add(chap.id);
                        setSelectedChapters(newSet);
                    }
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: '70px', flexShrink: 0 }}>
                    {isAssemblyMode ? (
                        <div style={{ color: chap.audio_status === 'done' ? 'var(--accent)' : 'var(--border)', cursor: chap.audio_status === 'done' ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center' }}>
                            {selectedChapters.has(chap.id) && chap.audio_status === 'done' ? <CheckSquare size={18} /> : <Square size={18} />}
                        </div>
                    ) : (
                        <div style={{ cursor: 'grab', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }} title="Drag to reorder">
                            <GripVertical size={14} />
                        </div>
                    )}
                    <div style={{
                        width: '20px', height: '20px', borderRadius: '50%', background: 'var(--surface-light)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '600', fontSize: '0.7rem', color: 'var(--text-muted)'
                    }}>
                        {idx + 1}
                    </div>
                </div>

                <div 
                  style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', opacity: isAssemblyMode && chap.audio_status !== 'done' ? 0.4 : 1, cursor: isAssemblyMode ? 'default' : 'pointer', minWidth: '150px', flex: '1 1 0' }}
                  title={isAssemblyMode ? "" : "Click to edit chapter. Click title to rename."}
                  onClick={() => {
                      if (!isAssemblyMode) {
                          setEditingChapterId(chap.id);
                      }
                  }}
                >
                    {editingTitleId === chap.id ? (
                        <input
                            autoFocus
                            value={tempTitle}
                            onChange={(e) => setTempTitle(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                                const saveMyTitle = () => {
                                    if (tempTitle.trim() !== chap.title) {
                                        api.updateChapter(chap.id, { title: tempTitle.trim() })
                                            .then(() => loadData())
                                            .catch(err => console.error('Failed to update title', err));
                                    }
                                };
                                
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    skipBlurSaveId.current = chap.id;
                                    saveMyTitle();
                                    setEditingTitleId(null);
                                } else if (e.key === 'Escape') {
                                    skipBlurSaveId.current = chap.id;
                                    setEditingTitleId(null);
                                } else if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    skipBlurSaveId.current = chap.id;
                                    saveMyTitle();
                                    if (idx > 0) {
                                        setEditingTitleId(chapters[idx - 1].id);
                                        setTempTitle(chapters[idx - 1].title);
                                    } else {
                                        setEditingTitleId(null);
                                    }
                                } else if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    skipBlurSaveId.current = chap.id;
                                    saveMyTitle();
                                    if (idx < chapters.length - 1) {
                                        setEditingTitleId(chapters[idx + 1].id);
                                        setTempTitle(chapters[idx + 1].title);
                                    } else {
                                        setEditingTitleId(null);
                                    }
                                }
                            }}
                            onBlur={() => {
                                if (skipBlurSaveId.current === chap.id) {
                                    skipBlurSaveId.current = null;
                                    return;
                                }
                                if (tempTitle.trim() !== chap.title) {
                                    api.updateChapter(chap.id, { title: tempTitle.trim() })
                                        .then(() => loadData())
                                        .catch(err => console.error('Failed to update title', err));
                                }
                                setEditingTitleId(null);
                            }}
                            style={{ 
                                fontWeight: 500, fontSize: '0.95rem', background: 'var(--surface-light)',
                                border: '1px solid var(--accent)', borderRadius: '4px', outline: 'none',
                                color: 'var(--text-primary)', padding: '0 4px', width: '100%', maxWidth: '200px'
                            }}
                        />
                    ) : (
                        <h4 
                            onClick={(e) => {
                                if (!isAssemblyMode) {
                                    e.stopPropagation();
                                    setEditingTitleId(chap.id);
                                    setTempTitle(chap.title);
                                }
                            }}
                            title={isAssemblyMode ? "" : "Click to edit title"}
                            style={{ fontWeight: 500, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'text' }}
                        >
                            {chap.title}
                        </h4>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                        {(() => {
                           if (activeJob) {
                               return <span title="Generating Audio..."><Clock size={14} color="var(--warning)" /></span>;
                           }
                           if (chap.audio_status === 'done') return <span title="Audio Generated"><CheckCircle size={14} color="var(--success)" /></span>;
                           if (chap.audio_status === 'processing') return <span title="Generating Audio..."><Clock size={14} color="var(--warning)" /></span>;
                           if (chap.audio_status === 'error') return <span title="Generation Failed"><AlertTriangle size={14} color="var(--error)" /></span>;
                           return null;
                        })()}
                        {chap.text_last_modified && chap.audio_generated_at && chap.audio_generated_at > 0 && (chap.text_last_modified > chap.audio_generated_at) && (
                        <span title="Text modified since last audio generation" style={{ display: 'flex', alignItems: 'center' }}>
                            <AlertTriangle size={14} color="var(--warning)" />
                        </span>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem', flex: '2 1 0', minWidth: 0 }}>
                  {(() => {
                    const job = relevantJobs.length > 0 ? [...relevantJobs].sort((a, b) => {
                        const statusOrder: Record<string, number> = { 'running': 0, 'preparing': 1, 'finalizing': 2, 'queued': 3 };
                        const orderA = statusOrder[a.status] ?? 99;
                        const orderB = statusOrder[b.status] ?? 99;
                        if (orderA !== orderB) return orderA - orderB;
                        return (b.created_at || 0) - (a.created_at || 0);
                    })[0] : undefined;

                    if (job && job.status !== 'done') {
                        const isPreparing = job.status === 'preparing';
                        const isFinalizing = job.status === 'finalizing';
                        const isRunning = job.status === 'running';
                        const isFailed = job.status === 'failed';

                        return (
                            <div style={{ width: '100%', maxWidth: '600px' }}>
                                <PredictiveProgressBar 
                                    progress={job.progress || 0}
                                    startedAt={job.started_at}
                                    etaSeconds={job.eta_seconds}
                                    label={isFailed ? "Failed" : (isPreparing ? "Preparing..." : (isFinalizing ? "Finalizing..." : (isRunning ? "Synthesizing..." : "Queued")))}
                                />
                            </div>
                        );
                    }
                    
                    if (chap.audio_status === 'done' && chap.audio_file_path && !isAssemblyMode) {
                        const audioPath = chap.audio_file_path;
                        const wavPath = audioPath.replace(/\.[^.]+$/, '.wav');
                        const mp3Path = audioPath.replace(/\.[^.]+$/, '.mp3');
                        
                        return (
                            <audio 
                                controls 
                                key={chap.id}
                                style={{ height: '30px', width: '100%', maxWidth: '600px' }}
                                onClick={e => e.stopPropagation()}
                                onPointerDown={e => e.stopPropagation()} 
                            >
                                <source src={`/projects/${projectId}/audio/${audioPath}`} />
                                {audioPath !== wavPath && <source src={`/projects/${projectId}/audio/${wavPath}`} />}
                                {audioPath !== mp3Path && <source src={`/projects/${projectId}/audio/${mp3Path}`} />}
                                <source src={`/out/xtts/${audioPath}`} />
                                {audioPath !== wavPath && <source src={`/out/xtts/${wavPath}`} />}
                                {audioPath !== mp3Path && <source src={`/out/xtts/${mp3Path}`} />}
                            </audio>
                        );
                    }
                    
                    return (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            ~{formatLength(chap.predicted_audio_length)} runtime
                        </span>
                    );
                  })()}
                  
                  <div style={{ display: 'flex', gap: '0.15rem', opacity: isAssemblyMode ? 0.3 : 1, pointerEvents: isAssemblyMode ? 'none' : 'auto', borderLeft: '1px solid var(--border)', paddingLeft: '1rem', marginLeft: '0.5rem' }}>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleQueueChapter(chap); }} 
                        className="btn-ghost" 
                        disabled={chap.audio_status === 'processing'}
                        style={{ 
                          padding: '0.4rem', 
                          color: 'var(--accent)',
                          opacity: chap.audio_status === 'processing' ? 0.3 : 1,
                          cursor: chap.audio_status === 'processing' ? 'not-allowed' : 'pointer'
                        }} 
                        title={chap.audio_status === 'processing' ? "Already in Queue" : "Add to Generation Queue"}
                      >
                        <Zap size={16} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setEditingChapterId(chap.id); }} className="btn-ghost" style={{ padding: '0.4rem', color: 'var(--text-secondary)' }} title="Edit Text">
                        <Edit3 size={16} />
                      </button>
                  </div>
                  
                  <div style={{ position: 'relative' }}>
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setOpenMenuId(openMenuId === chap.id ? null : chap.id); 
                      }} 
                      className="btn-ghost" 
                      style={{ padding: '0.4rem', color: 'var(--text-muted)' }}
                    >
                      <MoreVertical size={16} />
                    </button>
                    
                    {openMenuId === chap.id && (
                      <div 
                        className="glass-panel"
                        style={{
                          position: 'absolute',
                          top: '100%',
                          right: 0,
                          zIndex: 1000,
                          minWidth: '160px',
                          padding: '0.5rem',
                          background: 'var(--surface)',
                          boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        <button 
                          className="btn-ghost" 
                          disabled={chap.audio_status !== 'done' || isExporting !== null}
                          style={{ 
                            width: '100%', 
                            justifyContent: 'flex-start', 
                            padding: '0.5rem', 
                            fontSize: '0.8rem',
                            opacity: (chap.audio_status !== 'done' || isExporting !== null) ? 0.5 : 1
                          }}
                          onClick={() => { setOpenMenuId(null); handleExportSample(chap); }}
                        >
                          {isExporting === chap.id ? <Loader2 size={14} className="animate-spin" /> : <Video size={14} />}
                          {isExporting === chap.id ? 'Generating...' : 'Export Video Sample'}
                        </button>
                        {chap.audio_status === 'done' && chap.audio_file_path && (
                          <a 
                            href={`/projects/${projectId}/audio/${chap.audio_file_path}`}
                            download={chap.audio_file_path}
                            className="btn-ghost" 
                            style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem', fontSize: '0.8rem', textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '8px' }}
                            onClick={() => setOpenMenuId(null)}
                          >
                            <Download size={14} /> Download Audio
                          </a>
                        )}
                        <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />
                        <button 
                          className="btn-ghost" 
                          style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem', fontSize: '0.8rem' }}
                          onClick={() => { setOpenMenuId(null); handleResetChapterAudio(chap.id); }}
                        >
                          <RefreshCw size={14} /> Reset Audio
                        </button>
                        <button 
                          className="btn-ghost" 
                          style={{ width: '100%', justifyContent: 'flex-start', padding: '0.5rem', fontSize: '0.8rem', color: 'var(--error)' }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--error-glow)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          onClick={() => { setOpenMenuId(null); handleDeleteChapter(chap.id); }}
                        >
                          <Trash2 size={14} /> Delete Chapter
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        )}
      </div>
          </>
      )}



      {/* Modals */}
      {/* Cover Image Modal */}
      {showCoverModal && project.cover_image_path && (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)'
        }} onClick={() => setShowCoverModal(false)}>
            <img 
                src={project.cover_image_path} 
                alt="Enlarged Cover" 
                style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }} 
                onClick={e => e.stopPropagation()}
            />
        </div>
      )}

      {/* Add Chapter Modal */}
      {showAddModal && (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)'
        }}>
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-panel"
                style={{ width: '100%', maxWidth: '600px', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', border: '1px solid var(--border)' }}
            >
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Add New Chapter</h3>
                <form onSubmit={handleCreateChapter} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Chapter Title *</label>
                        <input
                            autoFocus
                            required
                            value={newTitle}
                            onChange={e => setNewTitle(e.target.value)}
                            placeholder="e.g. Chapter 1"
                            style={{
                                background: 'var(--surface-light)', border: '1px solid var(--border)', color: 'var(--text-primary)',
                                padding: '0.75rem', borderRadius: '8px', width: '100%', outline: 'none'
                            }}
                        />
                    </div>
                    
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Upload Manuscript (Optional)</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                onChange={e => setNewFile(e.target.files?.[0] || null)}
                                accept=".txt"
                                style={{ display: 'none' }}
                            />
                            <button 
                                type="button" 
                                onClick={() => fileInputRef.current?.click()}
                                className="btn-ghost"
                                style={{ border: '1px dashed var(--border)', padding: '0.75rem 1.5rem' }}
                            >
                                {newFile ? newFile.name : 'Choose .txt File...'}
                            </button>
                             {newFile && (
                                <button type="button" onClick={() => setNewFile(null)} className="btn-danger" style={{ padding: '0.5rem' }}>
                                    <Trash2 size={16} />
                                </button>
                            )}
                        </div>
                    </div>

                    {!newFile && (
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Or Paste Text</label>
                            <textarea
                                value={newText}
                                onChange={e => setNewText(e.target.value)}
                                placeholder="Paste your chapter text here..."
                                rows={6}
                                style={{
                                    background: 'var(--surface-light)', border: '1px solid var(--border)', color: 'var(--text-primary)',
                                    padding: '0.75rem', borderRadius: '8px', width: '100%', outline: 'none', resize: 'vertical', fontFamily: 'monospace'
                                }}
                            />
                        </div>
                    )}
                    
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                        <button type="button" onClick={() => setShowAddModal(false)} className="btn-ghost">Cancel</button>
                        <button type="submit" disabled={submitting || !newTitle} className="btn-primary" style={{ minWidth: '100px' }}>
                            {submitting ? 'Saving...' : 'Add Chapter'}
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
      )}

      {/* Edit Project Modal */}
      {showEditProjectModal && (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)'
        }}>
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="glass-panel"
                style={{ width: '100%', maxWidth: '600px', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', border: '1px solid var(--border)' }}
            >
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Edit Project Details</h3>
                <form onSubmit={handleUpdateProject} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Project Name *</label>
                        <input
                            autoFocus
                            required
                            value={editProjectData.name}
                            onChange={e => setEditProjectData({...editProjectData, name: e.target.value})}
                            style={{
                                background: 'var(--surface-light)', border: '1px solid var(--border)', color: 'var(--text-primary)',
                                padding: '0.75rem', borderRadius: '8px', width: '100%', outline: 'none'
                            }}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Series (Optional)</label>
                            <input
                                value={editProjectData.series}
                                onChange={e => setEditProjectData({...editProjectData, series: e.target.value})}
                                style={{
                                    background: 'var(--surface-light)', border: '1px solid var(--border)', color: 'var(--text-primary)',
                                    padding: '0.75rem', borderRadius: '8px', width: '100%', outline: 'none'
                                }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Author (Optional)</label>
                            <input
                                value={editProjectData.author}
                                onChange={e => setEditProjectData({...editProjectData, author: e.target.value})}
                                style={{
                                    background: 'var(--surface-light)', border: '1px solid var(--border)', color: 'var(--text-primary)',
                                    padding: '0.75rem', borderRadius: '8px', width: '100%', outline: 'none'
                                }}
                            />
                        </div>
                    </div>
                    
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Update Cover Art (Optional)</label>
                        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                            <div
                                onClick={() => editCoverInputRef.current?.click()}
                                onDragOver={handleEditCoverDragOver}
                                onDragLeave={handleEditCoverDragLeave}
                                onDrop={handleEditCoverDrop}
                                style={{
                                    width: '100px',
                                    height: '100px',
                                    flexShrink: 0,
                                    borderRadius: '8px',
                                    border: isDraggingEditCover ? '2px solid var(--accent)' : '2px dashed var(--border)',
                                    background: isDraggingEditCover ? 'var(--accent-glow)' : 'var(--surface-light)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    overflow: 'hidden',
                                    position: 'relative',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                {editCoverPreview ? (
                                    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                                        <img src={editCoverPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="New Cover Preview" />
                                            {isDraggingEditCover && (
                                                <div style={{ position: 'absolute', inset: 0, background: 'var(--accent-glow)', opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <ImageIcon size={24} color="white" />
                                                </div>
                                            )}
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '0.5rem' }}>
                                        <ImageIcon size={20} style={{ margin: '0 auto 0.25rem auto', opacity: isDraggingEditCover ? 1 : 0.5, color: isDraggingEditCover ? 'var(--accent)' : 'inherit' }} />
                                        <p style={{ fontSize: '0.6rem', color: isDraggingEditCover ? 'var(--accent)' : 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                                            {isDraggingEditCover ? 'Drop' : 'New Cover'}
                                        </p>
                                    </div>
                                )}
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <input 
                                    type="file" 
                                    ref={editCoverInputRef} 
                                    onChange={handleEditCoverChange}
                                    accept="image/*"
                                    style={{ display: 'none' }}
                                />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <button 
                                        type="button" 
                                        onClick={() => editCoverInputRef.current?.click()}
                                        className="btn-ghost"
                                        style={{ border: '1px solid var(--border)', padding: '0.5rem 1rem', fontSize: '0.85rem' }}
                                    >
                                        Choose File...
                                    </button>
                                    {editCover && (
                                        <button 
                                            type="button" 
                                            onClick={() => { setEditCover(null); setEditCoverPreview(null); }} 
                                            className="btn-danger" 
                                            style={{ padding: '0.5rem' }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                                {editCover && (
                                    <p style={{ fontSize: '0.75rem', color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        Selected: {editCover.name}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                        <button type="button" onClick={() => setShowEditProjectModal(false)} className="btn-ghost">Cancel</button>
                        <button type="submit" disabled={submitting || !editProjectData.name} className="btn-primary" style={{ minWidth: '100px' }}>
                            {submitting ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </motion.div>
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
