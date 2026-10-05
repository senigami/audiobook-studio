import React from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { Job, SegmentProgress, Settings, Speaker, SpeakerProfile, TtsEngine } from '@/types';
import { useBookData, type BookDataContextValue } from '@/pages/Book/useBookData';

const BookDataContext = React.createContext<BookDataContextValue | null>(null);

interface BookDataProviderProps {
  children: React.ReactNode;
  jobs?: Record<string, Job>;
  segmentProgress?: Record<string, SegmentProgress>;
  speakerProfiles: SpeakerProfile[];
  speakers: Speaker[];
  settings?: Partial<Settings>;
  engines?: TtsEngine[];
  refreshTrigger?: number;
  segmentUpdate?: { chapterId: string; tick: number };
  chapterUpdate?: { chapterId: string; tick: number };
  onOpenQueue?: () => void;
}

export function BookDataProvider({
  children,
  jobs = {},
  segmentProgress = {},
  speakerProfiles,
  speakers,
  settings,
  engines = [],
  refreshTrigger = 0,
  segmentUpdate,
  chapterUpdate,
  onOpenQueue,
}: BookDataProviderProps) {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const value = useBookData({
    bookId: bookId || '',
    jobs,
    segmentProgress,
    speakerProfiles,
    speakers,
    settings,
    engines,
    refreshTrigger,
    segmentUpdate,
    chapterUpdate,
    navigate,
    onOpenQueue,
  });

  if (!bookId) {
    return <Navigate to="/library" replace />;
  }

  return <BookDataContext.Provider value={value}>{children}</BookDataContext.Provider>;
}

export function useBookDataContext(): BookDataContextValue {
  const value = React.useContext(BookDataContext);
  if (!value) {
    throw new Error('useBookDataContext must be used within BookDataProvider');
  }
  return value;
}
