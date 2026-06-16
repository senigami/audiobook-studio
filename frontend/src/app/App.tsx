import { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useParams, useMatch } from 'react-router-dom';
import { api } from '@/api';
import { AppShell } from '@/app/layout/AppShell';
import { ProjectLibrary } from '@/pages/ProjectLibrary/ProjectLibraryPage';
import { WelcomePage } from '@/pages/Welcome/WelcomePage';
import { GlobalQueue } from '@/components/queue/GlobalQueue';
import { useJobs } from '@/hooks/useJobs';
import { useQueueSync } from '@/hooks/useQueueSync';
import { useStudioSocketTransport } from '@/hooks/useStudioSocketTransport';
import { useInitialData } from '@/hooks/useInitialData';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import { createStudioShellState } from '@/app/layout/StudioShell';
import { QueueRoute } from '@/pages/Queue/QueueRoute';
import type { Chapter } from '@/types';
import { motion, AnimatePresence } from 'framer-motion';
import { Drawer } from '@/pages/Voices/components/VoiceUtils';

const VoicesTab = lazy(() => import('@/pages/Voices/VoicesPage').then(m => ({ default: m.VoicesTab })));
const VoiceLabPage = lazy(() => import('@/pages/VoiceLab/VoiceLabPage').then(m => ({ default: m.VoiceLabPage })));
const BookLayout = lazy(() => import('@/pages/Book').then(m => ({ default: m.BookLayout })));
const BookIndexRedirect = lazy(() => import('@/pages/Book').then(m => ({ default: m.BookIndexRedirect })));
const EnginesPage = lazy(() => import('@/pages/Engines').then(m => ({ default: m.EnginesPage })));
const IntegrationsPage = lazy(() => import('@/pages/Integrations').then(m => ({ default: m.IntegrationsPage })));
const ActivityPage = lazy(() => import('@/pages/Activity/ActivityPage'));
const SettingsRoute = lazy(() => import('@/pages/Settings').then(m => ({ default: m.SettingsRoute })));
const ProgressBarTestPage = lazy(() => import('@/pages/DevProgressBar/DevProgressBarPage').then(m => ({ default: m.ProgressBarTestPage })));
const LiveOutputPage = lazy(() => import('@/pages/LiveOutput/LiveOutputPage').then(m => ({ default: m.LiveOutputPage })));

function RouteFallback() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '200px',
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
    </div>
  );
}

function navigateToBookStage(projectId: string, search: string): { pathname: string; search: string } {
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  const stage = tab === 'characters'
    ? 'casting'
    : tab === 'assemblies' || tab === 'backups'
      ? 'publish'
      : 'manuscript';
  params.delete('tab');
  const nextSearch = params.toString();
  return {
    pathname: `/book/${projectId}/${stage}`,
    search: nextSearch ? `?${nextSearch}` : '',
  };
}

function ProjectRedirectRoute() {
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();

  if (!projectId) {
    return <Navigate to="/library" replace />;
  }

  return <Navigate replace to={navigateToBookStage(projectId, location.search)} />;
}

function ChapterRedirectRoute({
  chapterId,
  chapter,
  loading,
  search,
}: {
  chapterId: string;
  chapter: Chapter | null;
  loading: boolean;
  search: string;
}) {
  if (loading) {
    return <RouteFallback />;
  }

  if (!chapter?.project_id) {
    return <Navigate to="/library" replace />;
  }

  const params = new URLSearchParams(search);
  params.set('chapter', chapterId);
  const nextSearch = params.toString();

  return (
    <Navigate
      replace
      to={{
        pathname: `/book/${chapter.project_id}/studio`,
        search: nextSearch ? `?${nextSearch}` : '',
      }}
    />
  );
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  useStudioSocketTransport();
  const chapterMatch = useMatch('/chapter/:chapterId');
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

  const [refreshingSource, setRefreshingSource] = useState<'bootstrap' | 'terminal' | 'reconnect' | 'refresh' | undefined>(undefined);

  const refreshQueue = useCallback(async (source: 'bootstrap' | 'terminal' | 'reconnect' | 'refresh' = 'refresh') => {
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
  // Topic ownership for queue refresh:
  //   - useQueueSync owns queue-visible live overlays from jobs.lifecycle,
  //     queue.items, chapters.lifecycle, chapters.progress, and voice.test.
  //   - Job completion (status=done) is the only signal that warrants a ProjectDetailPage
  //     reload via queueRefreshTrigger, because that is when chapter status actually changes.
  //   - queue-visible socket frames must NOT bump the trigger directly, otherwise every
  //     update triggers a fetchProject/Chapters/Characters/Audiobooks burst on top of the
  //     completion bump. That overlap is what inflates the live update count.
  const handleJobComplete = useCallback(() => {
    refetchHome();
    setQueueRefreshTrigger(prev => prev + 1);
  }, [refetchHome]);

  const handlePauseUpdate = useCallback(() => {
    refetchHome();
  }, [refetchHome]);

  const handleSegmentsUpdate = useCallback((chapterId: string) => {
    setSegmentUpdate(prev => ({ chapterId, tick: prev.tick + 1 }));
  }, []);

  const handleChapterUpdate = useCallback((chapterId: string) => {
    setChapterUpdate(prev => ({ chapterId, tick: prev.tick + 1 }));
  }, []);

  const { jobs, refreshJobs, testProgress, segmentProgress } = useJobs(
    handleJobComplete,
    undefined,
    handlePauseUpdate,
    handleSegmentsUpdate,
    handleChapterUpdate
  );
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


  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
    confirmText?: string;
  } | null>(null);

  const [toast, setToast] = useState<{ message: string; visible: boolean; action?: { label: string; onClick: () => void } } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, action?: { label: string; onClick: () => void }) => {
    // Clear any pending timeout before setting a new one
    if (toastTimeoutRef.current !== null) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ message, visible: true, action });
    toastTimeoutRef.current = setTimeout(() => setToast(prev => prev ? { ...prev, visible: false } : null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      // Clear any pending toast timeout on unmount
      if (toastTimeoutRef.current !== null) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

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
      <AppShell
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
            <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<WelcomePage />} />
              <Route path="/library" element={<ProjectLibrary onSelectProject={(id) => navigate(`/project/${id}`)} />} />
              <Route path="/book/:bookId" element={<BookIndexRedirect />} />
              <Route path="/book/:bookId/:stage" element={
                <BookLayout
                  jobs={jobs}
                  segmentProgress={segmentProgress}
                  speakerProfiles={initialData?.speaker_profiles || []}
                  speakers={initialData?.speakers || []}
                  settings={initialData?.settings}
                  engines={initialData?.engines || []}
                  refreshTrigger={queueRefreshTrigger}
                  segmentUpdate={segmentUpdate}
                  chapterUpdate={chapterUpdate}
                  onOpenQueue={() => setIsQueueDrawerOpen(true)}
                />
              } />
              <Route path="/project/:projectId" element={<ProjectRedirectRoute />} />
              <Route path="/chapter/:chapterId" element={
                <ChapterRedirectRoute
                  chapterId={chapterIdFromRoute || ''}
                  chapter={chapterRouteData}
                  loading={initialLoading || queueLoading || chapterRouteLoading}
                  search={location.search}
                />
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
              <Route path="/activity" element={
                <ActivityPage
                  paused={initialData?.paused || false}
                  jobs={jobs}
                  queue={mergedQueue}
                  engines={initialData?.engines || []}
                  loading={queueLoading}
                  onRefresh={() => refreshQueue('refresh')}
                  connected={connected}
                  isReconnecting={isReconnecting}
                />
              } />
              <Route path="/engines" element={
                <EnginesPage
                  startupReady={initialData?.system_info?.startup_ready !== false}
                  onRefresh={handleRefresh}
                  onShowNotification={showToast}
                />
              } />
              <Route path="/integrations" element={<IntegrationsPage />} />
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
              <Route path="/voices/:id" element={
                <VoiceLabPage
                  speakerProfiles={initialData?.speaker_profiles || []}
                  engines={initialData?.engines || []}
                  jobs={jobs}
                  testProgress={testProgress}
                  onRefresh={handleRefresh}
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
              <Route path="/event-stream" element={<LiveOutputPage />} />
              <Route path="*" element={<Navigate to="/library" replace />} />
            </Routes>
            </Suspense>
          </div>

          </div>
      </AppShell>

      {initialLoading && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--glass-surface-light)',
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

      {/* Simple Toast — always-mounted live region so AT announces the message */}
      <div
        aria-live="polite"
        aria-atomic="true"
        style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, pointerEvents: 'none' }}
      >
        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
          {toast?.visible ? toast.message : ''}
        </span>
      </div>
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
              color: 'var(--text-on-accent)',
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
              border: '1px solid var(--glass-border)'
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
                  color: 'var(--text-on-accent)',
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
