import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useMatch } from 'react-router-dom';
import { api } from './api';
import { Layout } from './components/Layout';
import { PreviewModal } from './components/PreviewModal';
import { VoicesTab } from './components/VoicesTab';
import { ProjectLibrary } from './components/ProjectLibrary';
import { ProjectView } from './components/ProjectView';
import { GlobalQueue } from './components/GlobalQueue';
import { ProgressBarTestPage } from './components/ProgressBarTestPage';
import { useJobs } from './hooks/useJobs';
import { useQueueSync } from './hooks/useQueueSync';
import { useInitialData } from './hooks/useInitialData';
import { ConfirmModal } from './components/ConfirmModal';
import { createStudioShellState } from './app/layout/StudioShell';
import { ProjectViewRoute } from './features/project-view/routes/ProjectViewRoute';
import { QueueRoute } from './features/queue/routes/QueueRoute';
import { SettingsRoute } from './features/settings/routes';
import type { Chapter, Project } from './types';
import { motion, AnimatePresence } from 'framer-motion';
import { Drawer } from './components/voices/VoiceUtils';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const projectMatch = useMatch('/project/:projectId');
  const chapterMatch = useMatch('/chapter/:chapterId');
  const projectIdFromRoute = projectMatch?.params.projectId;
  const chapterIdFromRoute = chapterMatch?.params.chapterId;
  const [queueRefreshTrigger, setQueueRefreshTrigger] = useState(0);
  const {
    queue: mergedQueue,
    queueCount,
    loading: queueLoading,
    connected,
    isReconnecting,
    activeSource,
    refreshQueue: originalRefreshQueue
  } = useQueueSync();

  const [refreshingSource, setRefreshingSource] = useState<'bootstrap' | 'reconnect' | 'refresh' | undefined>(undefined);

  const refreshQueue = useCallback(async (source: 'bootstrap' | 'reconnect' | 'refresh' = 'refresh') => {
    setRefreshingSource(source);
    try {
      await originalRefreshQueue(source);
    } finally {
      setRefreshingSource(undefined);
    }
    setQueueRefreshTrigger(prev => prev + 1);
  }, [originalRefreshQueue]);

  const [chapterUpdate, setChapterUpdate] = useState<{ chapterId: string; tick: number }>({ chapterId: '', tick: 0 });

  const [segmentUpdate, setSegmentUpdate] = useState<{ chapterId: string; tick: number }>({ chapterId: '', tick: 0 });
  const { data: initialData, loading: initialLoading, refetch: refetchHome } = useInitialData();
  const [chapterRouteData, setChapterRouteData] = useState<Chapter | null>(null);
  const [chapterRouteLoading, setChapterRouteLoading] = useState(false);
  const { jobs, refreshJobs, testProgress, segmentProgress } = useJobs(
    () => { refetchHome(); refreshQueue('refresh'); },
    () => { refreshQueue('refresh'); },
    () => refetchHome(),
    (chapterId: string) => { setSegmentUpdate(prev => ({ chapterId, tick: prev.tick + 1 })); },
    (chapterId: string) => { setChapterUpdate(prev => ({ chapterId, tick: prev.tick + 1 })); }
  );
  const chapterProjectIdFromRoute = initialData?.chapters?.find((c: any) => c.id === chapterIdFromRoute)?.project_id;

  useEffect(() => {
    let cancelled = false;
    if (!chapterIdFromRoute) {
      setChapterRouteData(null);
      setChapterRouteLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setChapterRouteLoading(true);
    api.fetchChapter(chapterIdFromRoute)
      .then(chapter => {
        if (!cancelled) {
          setChapterRouteData(chapter);
        }
      })
      .catch(err => {
        if (!cancelled) {
          console.error('Failed to load chapter route data', err);
          setChapterRouteData(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setChapterRouteLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chapterIdFromRoute]);

  const [previewFilename, setPreviewFilename] = useState<string | null>(null);

  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
    confirmText?: string;
  } | null>(null);

  const [toast, setToast] = useState<{ message: string; visible: boolean; action?: { label: string; onClick: () => void } } | null>(null);

  const showToast = (message: string, action?: { label: string; onClick: () => void }) => {
    setToast({ message, visible: true, action });
    setTimeout(() => setToast(prev => prev ? { ...prev, visible: false } : null), 4000);
  };

  const [isQueueDrawerOpen, setIsQueueDrawerOpen] = useState(false);
  const prevPathRef = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname === '/queue') {
      setIsQueueDrawerOpen(true);
      const target = prevPathRef.current === '/queue' ? '/' : prevPathRef.current;
      navigate(target, { replace: true });
    } else {
      prevPathRef.current = location.pathname;
    }
  }, [location.pathname, navigate]);

  const handleRefresh = async () => {
    setRefreshingSource('refresh');
    try {
      await Promise.all([refetchHome(), refreshJobs(), refreshQueue('refresh')]);
    } finally {
      setRefreshingSource(undefined);
    }
  };

  const shellState = useMemo(() => {
    return createStudioShellState({
      pathname: location.pathname,
      loading: initialLoading || queueLoading,
      connected,
      isReconnecting,
      hydrationSource: activeSource || refreshingSource,
    });
  }, [location.pathname, initialLoading, queueLoading, connected, isReconnecting, activeSource, refreshingSource]);
  const startupMessage = initialData?.system_info?.startup_message || 'Starting Audiobook Studio Services...';
  const startupDetail = initialData?.system_info?.startup_detail;
  const [showStartupCopy, setShowStartupCopy] = useState(false);

  useEffect(() => {
    if (!initialLoading) {
      setShowStartupCopy(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowStartupCopy(true);
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [initialLoading]);


  return (
    <div className="app-container">
      <Layout
        queueCount={queueCount}
        shellState={shellState}
        onToggleQueue={() => setIsQueueDrawerOpen(!isQueueDrawerOpen)}
        isQueueOpen={isQueueDrawerOpen}
      >
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '2.5rem',
          minWidth: 0,
          position: 'relative'
        }}>
          <div style={{ flex: 1 }}>
            <Routes>
              <Route path="/" element={<ProjectLibrary onSelectProject={(id) => navigate(`/project/${id}`)} />} />
              <Route path="/project/:projectId" element={
              <ProjectViewRoute
                  loading={initialLoading || queueLoading}
                  connected={connected}
                  isReconnecting={isReconnecting}
                  refreshingSource={activeSource || refreshingSource}
                  startupReady={initialData?.system_info?.startup_ready !== false}
                  projectId={projectIdFromRoute}
                  projectTitle={initialData?.projects?.find((p: Project) => p.id === projectIdFromRoute)?.name}
                  chapterTitle={initialData?.chapters?.find((c: any) => c.id === chapterIdFromRoute)?.title}
                >
                  {({ shellState }) => (
                    <ProjectView
                      key={shellState.navigation.activeProjectId}
                      jobs={jobs}
                      segmentProgress={segmentProgress}
                      speakerProfiles={initialData?.speaker_profiles || []}
                      speakers={initialData?.speakers || []}
                      engines={initialData?.engines || []}
                      settings={initialData?.settings}
                      refreshTrigger={queueRefreshTrigger}
                      segmentUpdate={segmentUpdate}
                      chapterUpdate={chapterUpdate}
                      shellState={shellState}
                      onOpenQueue={() => setIsQueueDrawerOpen(true)}
                    />
                  )}
                </ProjectViewRoute>
              } />
              {/* Separate Chapter route if needed, though ProjectView handles it via state right now */}
              <Route path="/chapter/:chapterId" element={
                <ProjectViewRoute
                  loading={initialLoading || queueLoading || chapterRouteLoading}
                  connected={connected}
                  isReconnecting={isReconnecting}
                  refreshingSource={activeSource || refreshingSource}
                  startupReady={initialData?.system_info?.startup_ready !== false}
                  // We might need to resolve projectId from chapter's parent here
                  projectId={chapterRouteData?.project_id || chapterProjectIdFromRoute}
                  projectTitle={initialData?.projects?.find((p: Project) => p.id === (chapterRouteData?.project_id || chapterProjectIdFromRoute))?.name}
                  chapterTitle={chapterRouteData?.title || initialData?.chapters?.find((c: any) => c.id === chapterIdFromRoute)?.title}
                >
                  {({ shellState }) => (
                    <ProjectView
                      key={shellState.navigation.activeProjectId}
                      jobs={jobs}
                      segmentProgress={segmentProgress}
                      speakerProfiles={initialData?.speaker_profiles || []}
                      speakers={initialData?.speakers || []}
                      engines={initialData?.engines || []}
                      settings={initialData?.settings}
                      refreshTrigger={queueRefreshTrigger}
                      segmentUpdate={segmentUpdate}
                      chapterUpdate={chapterUpdate}
                      shellState={shellState}
                      onOpenQueue={() => setIsQueueDrawerOpen(true)}
                    />
                  )}
                </ProjectViewRoute>
              } />
              <Route path="/queue" element={
                <QueueRoute
                  loading={queueLoading}
                  connected={connected}
                  isReconnecting={isReconnecting}
                  refreshingSource={activeSource || refreshingSource}
                >
                  {() => (
                    <GlobalQueue
                      paused={initialData?.paused || false}
                      jobs={jobs}
                      queue={mergedQueue}
                      loading={queueLoading}
                      onRefresh={() => refreshQueue('refresh')}
                    />
                  )}
                </QueueRoute>
              } />
              <Route path="/voices" element={
                <VoicesTab
                  speakerProfiles={initialData?.speaker_profiles || []}
                  onRefresh={handleRefresh}
                  testProgress={testProgress}
                  jobs={jobs}
                  settings={initialData?.settings}
                  engines={initialData?.engines || []}
                />
              } />
              <Route path="/settings/*" element={
                <SettingsRoute
                  settings={initialData?.settings}
                  speakerProfiles={initialData?.speaker_profiles || []}
                  speakers={initialData?.speakers || []}
                  engines={initialData?.engines || []}
                  startupReady={initialData?.system_info?.startup_ready !== false}
                  onRefresh={handleRefresh}
                  onShowNotification={showToast}
                />
              } />
              <Route path="/progress-test" element={<ProgressBarTestPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>

          </div>
      </Layout>

      {initialLoading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(248, 249, 252, 0.78)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div
            style={{
              padding: '1.25rem 1.5rem',
              borderRadius: '16px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.9rem',
              color: 'var(--text-primary)',
              fontWeight: 700,
            }}
          >
            <div
              className="animate-spin"
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: '2px solid var(--accent-glow)',
                borderTopColor: 'var(--accent)',
              }}
            />
            {showStartupCopy && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minHeight: '2.1rem' }}>
                <span>{startupMessage}</span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', minHeight: '1.1rem' }}>
                  {startupDetail || '\u00A0'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}


      <PreviewModal
        isOpen={!!previewFilename}
        onClose={() => setPreviewFilename(null)}
        filename={previewFilename || ''}
      />

      <Drawer
        isOpen={isQueueDrawerOpen}
        onClose={() => setIsQueueDrawerOpen(false)}
        title="Processing Queue"
      >
        <GlobalQueue
          paused={initialData?.paused || false}
          jobs={jobs}
          queue={mergedQueue}
          loading={queueLoading}
          onRefresh={() => refreshQueue('refresh')}
          compact={true}
        />
      </Drawer>

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

      {/* Simple Toast */}
      <AnimatePresence>
        {toast?.visible && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            style={{
              position: 'fixed',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 9999,
              background: 'var(--as-ink)',
              color: 'white',
              padding: '12px 20px',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-lg)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '0.9rem',
              fontWeight: 600,
              minWidth: '300px',
              justifyContent: 'space-between',
              border: '1px solid rgba(255,255,255,0.1)'
            }}
          >
            <span>{toast.message}</span>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action?.onClick();
                  setToast(null);
                }}
                style={{
                  background: 'var(--accent)',
                  color: 'white',
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                {toast.action.label}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
