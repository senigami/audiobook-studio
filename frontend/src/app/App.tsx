import { useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from 'react-router-dom';
import { AppShell } from '@/app/layout/AppShell';
import { ProjectLibrary } from '@/pages/ProjectLibrary/ProjectLibraryPage';
import { WelcomePage } from '@/pages/Welcome/WelcomePage';
import { GlobalQueue } from '@/components/queue/GlobalQueue';
import { useJobs } from '@/hooks/useJobs';
import { useQueueSync } from '@/hooks/useQueueSync';
import { useStudioSocketTransport } from '@/hooks/useStudioSocketTransport';
import { useInitialData } from '@/hooks/useInitialData';
import { useChapterRedirect } from '@/hooks/useChapterRedirect';
import { createStudioShellState } from '@/app/layout/StudioShell';
import { QueueRoute } from '@/pages/Queue/QueueRoute';
import { ProjectViewRoute } from '@/pages/ProjectDetail/ProjectViewRoute';
import type { Chapter } from '@/types';
import { AnimatePresence, motion } from 'framer-motion';
import { useQueueDrawer, QueueDrawerHost } from '@/app/QueueDrawerHost';
import { useNotifications, NotificationsHost } from '@/app/NotificationsHost';
import { StartupGate } from '@/app/StartupGate';
import { getDevRoutes } from '@/app/runtimeDebug';

const VoicesTab = lazy(() => import('@/pages/Voices/VoicesPage').then(m => ({ default: m.VoicesTab })));
const VoiceLabPage = lazy(() => import('@/pages/VoiceLab/VoiceLabPage').then(m => ({ default: m.VoiceLabPage })));
const BookLayout = lazy(() => import('@/pages/Book').then(m => ({ default: m.BookLayout })));
const BookIndexRedirect = lazy(() => import('@/pages/Book').then(m => ({ default: m.BookIndexRedirect })));
const ProjectViewPage = lazy(() => import('@/pages/ProjectDetail/ProjectDetailPage').then(m => ({ default: m.ProjectView })));
const EnginesPage = lazy(() => import('@/pages/Engines').then(m => ({ default: m.EnginesPage })));
const IntegrationsPage = lazy(() => import('@/pages/Integrations').then(m => ({ default: m.IntegrationsPage })));
const ActivityPage = lazy(() => import('@/pages/Activity/ActivityPage'));
const SettingsRoute = lazy(() => import('@/pages/Settings').then(m => ({ default: m.SettingsRoute })));

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
          borderTopColor: 'var(--action-primary)',
        }}
      />
    </div>
  );
}

function navigateToBookStage(projectId: string, search: string): { pathname: string; search: string } {
  const params = new URLSearchParams(search);
  const tab = params.get('tab');
  const stage = tab === 'characters'
    ? 'cast'
    : tab === 'assemblies'
      ? 'publish'
      : tab === 'backups'
        ? 'backups'
        : 'contents';
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
        pathname: `/book/${chapter.project_id}/chapter/${chapterId}`,
        search: nextSearch ? `?${nextSearch}` : '',
      }}
    />
  );
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  useStudioSocketTransport();
  const { chapterIdFromRoute, chapterRouteData, chapterRouteLoading } = useChapterRedirect();
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
  const { data: initialData, loading: initialLoading, error: initialError, refetch: refetchHome } = useInitialData();
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

  const notifications = useNotifications();
  const queueDrawer = useQueueDrawer();

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
  const devRoutes = getDevRoutes();
  // Framer Motion drives this transition via JS (requestAnimationFrame), not a
  // CSS transition/animation, so the blanket prefers-reduced-motion CSS guard
  // in theme/base.css can't neutralize it on its own — read the same media
  // query directly (a one-off page-load check, not the reactive useMediaQuery
  // hook) so the motion values collapse to an instant, static transition too.
  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const routeTransition = prefersReducedMotion
    ? { initial: false as const, animate: { opacity: 1, y: 0 }, exit: { opacity: 1, y: 0 }, transition: { duration: 0 } }
    : {
      initial: { opacity: 0, y: 8 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -8 },
      transition: { duration: 0.16, ease: 'easeOut' as const },
    };

  return (
    <div className="app-container">
      <AppShell
        queueCount={queueCount}
        shellState={shellState}
        onToggleQueue={queueDrawer.toggle}
        isQueueOpen={queueDrawer.isOpen}
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
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={location.pathname}
                className="route-transition"
                {...routeTransition}
              >
                <Routes location={location}>
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
                  onOpenQueue={queueDrawer.open}
                />
              } />
              <Route path="/book/:bookId/chapter/:chapterId" element={
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
                  onOpenQueue={queueDrawer.open}
                />
              } />
              <Route path="/project/:projectId" element={<ProjectRedirectRoute />} />
              <Route path="/project/:projectId/details" element={
                <ProjectViewRoute
                  loading={initialLoading || queueLoading}
                  connected={connected}
                  isReconnecting={isReconnecting}
                  refreshingSource={refreshingSource}
                >
                  {({ shellState }) => (
                    <ProjectViewPage
                      jobs={jobs}
                      segmentProgress={segmentProgress}
                      speakerProfiles={initialData?.speaker_profiles || []}
                      speakers={initialData?.speakers || []}
                      settings={initialData?.settings}
                      engines={initialData?.engines || []}
                      refreshTrigger={queueRefreshTrigger}
                      segmentUpdate={segmentUpdate}
                      chapterUpdate={chapterUpdate}
                      shellState={shellState}
                      onOpenQueue={queueDrawer.open}
                    />
                  )}
                </ProjectViewRoute>
              } />
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
                  onShowNotification={notifications.showToast}
                  settings={initialData?.settings}
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
                  onShowNotification={notifications.showToast}
                />
              } />
              {devRoutes.map((route) => (
                <Route key={route.path} path={route.path} element={route.element} />
              ))}
              <Route path="*" element={<Navigate to="/library" replace />} />
                </Routes>
              </motion.div>
            </AnimatePresence>
            </Suspense>
          </div>

          </div>
      </AppShell>

      <StartupGate
        loading={initialLoading}
        error={initialError}
        hasInitialData={!!initialData}
        startupMessage={startupMessage}
        startupDetail={startupDetail}
        onRetry={() => refetchHome()}
      />

      <QueueDrawerHost
        isOpen={queueDrawer.isOpen}
        onClose={queueDrawer.close}
        paused={initialData?.paused || false}
        jobs={jobs}
        queue={mergedQueue}
        loading={queueLoading}
        onRefresh={() => refreshQueue('refresh')}
      />

      <NotificationsHost
        confirmConfig={notifications.confirmConfig}
        onDismissConfirm={() => notifications.setConfirmConfig(null)}
        toast={notifications.toast}
        onDismissToast={notifications.dismissToast}
      />
    </div>
  );
}

export default App;
