import React from 'react';
import { api } from '@/api';
import type {
  Audiobook,
  Chapter,
  Character,
  Job,
  Project,
  SegmentProgress,
  Settings,
  Speaker,
  SpeakerProfile,
  TtsEngine,
} from '@/types';
import { useProjectActions } from '@/hooks/useProjectActions';
import { resolveVoiceEngineStatus } from '@/utils/chapterEditorHelpers';
import { buildVoiceOptions, getDefaultVoiceProfileName, getVoiceOptionLabel } from '@/utils/voiceProfiles';

export interface UseBookDataOptions {
  bookId: string;
  jobs?: Record<string, Job>;
  segmentProgress?: Record<string, SegmentProgress>;
  speakerProfiles: SpeakerProfile[];
  speakers: Speaker[];
  settings?: Partial<Settings>;
  engines?: TtsEngine[];
  refreshTrigger?: number;
  segmentUpdate?: { chapterId: string; tick: number };
  chapterUpdate?: { chapterId: string; tick: number };
  navigate?: (path: string) => void;
  onOpenQueue?: () => void;
}

type BookActions = ReturnType<typeof useProjectActions> & {
  handleProjectVoiceChange: (voice: string) => Promise<boolean>;
};

export interface BookDataContextValue {
  bookId: string;
  jobs: Record<string, Job>;
  segmentProgress: Record<string, SegmentProgress>;
  project: Project | null;
  chapters: Chapter[];
  characters: Character[];
  availableAudiobooks: Audiobook[];
  loading: boolean;
  selectedVoice: string;
  setSelectedVoice: React.Dispatch<React.SetStateAction<string>>;
  speakerProfiles: SpeakerProfile[];
  speakers: Speaker[];
  engines: TtsEngine[];
  mergedVoices: ReturnType<typeof buildVoiceOptions>;
  effectiveProjectVoice: string;
  projectVoiceStatus: ReturnType<typeof resolveVoiceEngineStatus>;
  projectDefaultVoiceLabel: string;
  totalRuntime: number;
  totalPredicted: number | null;
  hasUnrendered: boolean;
  actions: BookActions;
  segmentUpdate?: { chapterId: string; tick: number };
  chapterUpdate?: { chapterId: string; tick: number };
  reload: (isTransition?: boolean) => Promise<void>;
}

export function useBookData({
  bookId,
  jobs = {},
  segmentProgress = {},
  speakerProfiles,
  speakers,
  settings,
  engines = [],
  refreshTrigger = 0,
  segmentUpdate,
  chapterUpdate,
  navigate = () => undefined,
  onOpenQueue,
}: UseBookDataOptions): BookDataContextValue {
  const [project, setProject] = React.useState<Project | null>(null);
  const [chapters, setChapters] = React.useState<Chapter[]>([]);
  const [characters, setCharacters] = React.useState<Character[]>([]);
  const [availableAudiobooks, setAvailableAudiobooks] = React.useState<Audiobook[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedVoice, setSelectedVoice] = React.useState('');
  const [hasResolvedInitialVoice, setHasResolvedInitialVoice] = React.useState(false);

  const reload = React.useCallback(
    async (isTransition = false) => {
      if (!bookId) return;
      if (isTransition) setLoading(true);
      try {
        const [projectData, chaptersData, charactersData] = await Promise.all([
          api.fetchProject(bookId),
          api.fetchChapters(bookId),
          api.fetchCharacters(bookId),
        ]);
        setProject(projectData);
        setChapters(chaptersData);
        setCharacters(charactersData);
        try {
          const audiobooksData = await api.fetchProjectAudiobooks(bookId);
          setAvailableAudiobooks(audiobooksData || []);
        } catch {
          setAvailableAudiobooks([]);
        }
      } catch (error) {
        console.error(error);
        setProject(null);
      } finally {
        setLoading(false);
      }
    },
    [bookId],
  );

  React.useEffect(() => {
    const isTransition = project?.id !== bookId;
    if (isTransition) {
      setProject(null);
      setChapters([]);
      setCharacters([]);
      setAvailableAudiobooks([]);
      setHasResolvedInitialVoice(false);
    }
    void reload(isTransition);
  }, [bookId, refreshTrigger]);

  React.useEffect(() => {
    if (!project || speakerProfiles.length === 0) return;

    const projectProfile = project.speaker_profile_name || '';
    if (selectedVoice !== projectProfile || !hasResolvedInitialVoice) {
      setSelectedVoice(projectProfile);
      setHasResolvedInitialVoice(true);
    }
  }, [project, speakerProfiles, selectedVoice, hasResolvedInitialVoice]);

  const mergedVoices = React.useMemo(
    () => buildVoiceOptions(speakerProfiles || [], speakers || [], engines, characters),
    [speakerProfiles, speakers, engines, characters],
  );

  const effectiveProjectVoice = React.useMemo(() => {
    return (
      selectedVoice ||
      project?.speaker_profile_name ||
      settings?.default_speaker_profile ||
      getDefaultVoiceProfileName(speakerProfiles, engines) ||
      ''
    );
  }, [selectedVoice, project?.speaker_profile_name, settings?.default_speaker_profile, speakerProfiles, engines]);

  const projectVoiceStatus = React.useMemo(() => {
    return resolveVoiceEngineStatus(effectiveProjectVoice, engines || [], speakerProfiles || []);
  }, [effectiveProjectVoice, engines, speakerProfiles]);

  const projectDefaultVoiceLabel = React.useMemo(() => {
    const fallbackVoiceLabel = getVoiceOptionLabel(effectiveProjectVoice, speakerProfiles, speakers, engines, characters);
    return fallbackVoiceLabel ? `Default Speaker (${fallbackVoiceLabel})` : 'Default Speaker';
  }, [effectiveProjectVoice, speakerProfiles, speakers, engines, characters]);

  const totalRuntime = React.useMemo(
    () => chapters.reduce((acc, chapter) => acc + (chapter.audio_status === 'done' ? chapter.audio_length_seconds || 0 : 0), 0),
    [chapters],
  );

  const totalPredicted = React.useMemo(() => {
    const profile = speakerProfiles.find((speakerProfile) => speakerProfile.name === effectiveProjectVoice);
    const engineId = profile?.engine || settings?.default_engine || '';
    const targetEngine = engines.find((engine) => engine.engine_id === engineId);
    const calibratedCps = targetEngine?.calibrated_cps;

    if (!calibratedCps || calibratedCps <= 0) {
      return null;
    }

    return chapters.reduce((acc, chapter) => {
      if (chapter.audio_status === 'done') {
        return acc + (chapter.audio_length_seconds || 0);
      }
      return acc + chapter.char_count / calibratedCps;
    }, 0);
  }, [chapters, effectiveProjectVoice, engines, settings?.default_engine, speakerProfiles]);

  const hasUnrendered = React.useMemo(
    () => chapters.some((chapter) => chapter.audio_status !== 'done'),
    [chapters],
  );

  const actions = useProjectActions(bookId, () => reload(false), navigate, onOpenQueue);
  const handleProjectVoiceChange = React.useCallback(
    async (voice: string) => {
      const previousVoice = selectedVoice;
      const previousProjectVoice = project?.speaker_profile_name ?? null;
      setSelectedVoice(voice);
      setProject((currentProject) => (
        currentProject ? { ...currentProject, speaker_profile_name: voice || null } : currentProject
      ));
      try {
        await api.updateProject(bookId, { speaker_profile_name: voice || null });
        return true;
      } catch (error) {
        console.error(error);
        setSelectedVoice(previousVoice);
        setProject((currentProject) => (
          currentProject ? { ...currentProject, speaker_profile_name: previousProjectVoice } : currentProject
        ));
        return false;
      }
    },
    [bookId, project?.speaker_profile_name, selectedVoice],
  );

  return {
    bookId,
    jobs,
    segmentProgress,
    project,
    chapters,
    characters,
    availableAudiobooks,
    loading,
    selectedVoice,
    setSelectedVoice,
    speakerProfiles,
    speakers,
    engines,
    mergedVoices,
    effectiveProjectVoice,
    projectVoiceStatus,
    projectDefaultVoiceLabel,
    totalRuntime,
    totalPredicted,
    hasUnrendered,
    actions: {
      ...actions,
      handleProjectVoiceChange,
    },
    segmentUpdate,
    chapterUpdate,
    reload,
  };
}
