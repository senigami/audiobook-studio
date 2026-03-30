import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { PreviewModal } from './components/PreviewModal';
import { VoicesTab } from './components/VoicesTab';
import { ProjectLibrary } from './components/ProjectLibrary';
import { ProjectView } from './components/ProjectView';
import { GlobalQueue } from './components/GlobalQueue';
import { useJobs } from './hooks/useJobs';
import { useInitialData } from './hooks/useInitialData';
import { SettingsTray } from './components/SettingsTray';
import { ConfirmModal } from './components/ConfirmModal';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const navigate = useNavigate();
  const [queueCount, setQueueCount] = useState(0);
  const [queueRefreshTrigger, setQueueRefreshTrigger] = useState(0);

  const fetchQueueCount = async () => {
    try {
        const res = await fetch('/api/processing_queue');
        const queueData = await res.json();
        const active = queueData.filter((q: any) => q.status === 'queued' || q.status === 'preparing' || q.status === 'running' || q.status === 'finalizing');
        setQueueCount(active.length);
    } catch(e) { console.error('Failed to get queue count', e); }
  };

  const [segmentUpdate, setSegmentUpdate] = useState<{ chapterId: string; tick: number }>({ chapterId: '', tick: 0 });
  const { data: initialData, loading: initialLoading, refetch: refetchHome } = useInitialData();
  const { jobs, refreshJobs, testProgress } = useJobs(
    () => { refetchHome(); setQueueRefreshTrigger(prev => prev + 1); }, 
    () => { fetchQueueCount(); setQueueRefreshTrigger(prev => prev + 1); }, 
    () => refetchHome(),
    (chapterId: string) => { setSegmentUpdate(prev => ({ chapterId, tick: prev.tick + 1 })); }
  );
  
  const [previewFilename, setPreviewFilename] = useState<string | null>(null);
  
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
    confirmText?: string;
  } | null>(null);

  const [toast, setToast] = useState<{ message: string; visible: boolean } | null>(null);

  const showToast = (message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => setToast(prev => prev ? { ...prev, visible: false } : null), 4000);
  };

  useEffect(() => {
     fetchQueueCount();
     const interval = setInterval(fetchQueueCount, 3000);
     return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    await Promise.all([refetchHome(), refreshJobs()]);
  };



  return (
    <div className="app-container">
      <Layout
        queueCount={queueCount}
        headerRight={
          <SettingsTray 
            settings={initialData?.settings}
            onRefresh={handleRefresh}
            onShowNotification={showToast}
          />
        }
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
                <ProjectView 
                  jobs={jobs}
                  speakerProfiles={initialData?.speaker_profiles || []}
                  speakers={initialData?.speakers || []}
                  settings={initialData?.settings}
                  refreshTrigger={queueRefreshTrigger}
                  segmentUpdate={segmentUpdate}
                />
              } />
              <Route path="/queue" element={
                <GlobalQueue 
                  paused={initialData?.paused || false} 
                  jobs={jobs}
                  refreshTrigger={queueRefreshTrigger}
                />
              } />
              <Route path="/voices" element={
                <VoicesTab
                  speakerProfiles={initialData?.speaker_profiles || []}
                  onRefresh={handleRefresh}
                  testProgress={testProgress}
                  jobs={jobs}
                  settings={initialData?.settings}
                />
              } />
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
            Loading Audiobook Studio...
          </div>
        </div>
      )}


      <PreviewModal
        isOpen={!!previewFilename}
        onClose={() => setPreviewFilename(null)}
        filename={previewFilename || ''}
      />

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
            <button 
              onClick={() => {
                setToast(null);
                navigate('/queue');
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
              View Queue
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
