import { useCallback, useRef, useEffect } from 'react';
import { api } from '@/api';
import { resolveDefaultVariantName } from '@/utils/chapterEditorHelpers';
import type { ChapterEditorState } from '@/hooks/chapter/useChapterEditorState';
import type { Character, Speaker, SpeakerProfile, ScriptRangeAssignment } from '@/types';

export const useChapterAssignments = (
  state: ChapterEditorState,
  chapterId: string,
  characters: Character[],
  speakers: Speaker[],
  speakerProfiles: SpeakerProfile[],
  loadChapter: (source?: string) => Promise<void>
) => {
  const {
    scriptViewData, setScriptViewData, setSegments,
  } = state;

  // Track the latest known base_revision_id in a ref so consecutive assignments
  // that fire before React re-renders (and re-creates the useCallback closure)
  // still send the revision id returned by the previous response. This is the
  // fix for B2: the closure captures the React state value at render time, but
  // the ref is updated synchronously when each response arrives.
  const latestRevisionIdRef = useRef<string | null>(scriptViewData?.base_revision_id ?? null);

  // Keep the ref in sync whenever the canonical state changes (e.g. on loadChapter).
  useEffect(() => {
    latestRevisionIdRef.current = scriptViewData?.base_revision_id ?? null;
  }, [scriptViewData?.base_revision_id]);

  const handleScriptAssign = useCallback(async (
    spanIds: string[],
    selectedCharacterId: string | null,
    selectedProfileName: string | null,
    onConflict?: () => void
  ) => {
    if (!scriptViewData) return;
    const isClearing = !selectedCharacterId || selectedCharacterId === 'CLEAR_ASSIGNMENT';
    const characterId = isClearing ? null : selectedCharacterId;
    const profileName = isClearing ? null : (selectedProfileName || resolveDefaultVariantName(selectedCharacterId, characters, speakers, speakerProfiles));

    // Optimistic update
    setScriptViewData(prev => {
        if (!prev) return prev;
        return {
            ...prev,
            spans: prev.spans.map(s => spanIds.includes(s.id) ? {
                ...s, character_id: characterId, speaker_profile_name: profileName,
                status: (s.status === 'rendered' && (s.character_id !== characterId || s.speaker_profile_name !== profileName)) ? 'draft' : s.status
            } : s)
        };
    });

    try {
        // Read from ref so rapid consecutive calls use the freshest revision id,
        // not the stale closure value from before the previous response arrived.
        const result = await api.saveScriptAssignments(chapterId, {
            base_revision_id: latestRevisionIdRef.current,
            assignments: [{
                span_ids: spanIds,
                character_id: characterId,
                speaker_profile_name: profileName
            }]
        });
        // Update the ref synchronously before React re-renders, so the next call
        // in the same tick already has the correct revision id.
        latestRevisionIdRef.current = result.base_revision_id;
        setScriptViewData(result);
        const updatedSegs = await api.fetchSegments(chapterId);
        setSegments(updatedSegs);
    } catch (e: any) {
        if (e.status === 409) {
            onConflict?.();
        } else {
            console.error("Script assignment failed", e);
            loadChapter('assignment-error-rollback');
        }
    }
  }, [chapterId, scriptViewData, characters, speakers, speakerProfiles, loadChapter, setScriptViewData, setSegments]);

  const handleScriptAssignRange = useCallback(async (
    range: ScriptRangeAssignment,
    selectedCharacterId: string | null,
    selectedProfileName: string | null,
    onConflict?: () => void
  ) => {
    if (!scriptViewData || !selectedCharacterId) return;
    const isClearing = selectedCharacterId === 'CLEAR_ASSIGNMENT';
    const characterId = isClearing ? null : selectedCharacterId;
    const profileName = isClearing ? null : (selectedProfileName || resolveDefaultVariantName(selectedCharacterId, characters, speakers, speakerProfiles));

    try {
        // Same ref-based fix as handleScriptAssign.
        const result = await api.saveScriptAssignments(chapterId, {
            base_revision_id: latestRevisionIdRef.current,
            assignments: [],
            range_assignments: [{
                ...range,
                character_id: characterId,
                speaker_profile_name: profileName
            }]
        });
        latestRevisionIdRef.current = result.base_revision_id;
        setScriptViewData(result);
        const updatedSegs = await api.fetchSegments(chapterId);
        setSegments(updatedSegs);
    } catch (e: any) {
        console.error("Script range assignment failed", e);
        if (e.status === 409) {
            onConflict?.();
        } else {
            loadChapter('assignment-range-error-rollback');
        }
    }
  }, [chapterId, scriptViewData, characters, speakers, speakerProfiles, loadChapter, setScriptViewData, setSegments]);

  const handleParagraphBulkAssign = useCallback(async (
    segmentIds: string[],
    selectedCharacterId: string | null,
    selectedProfileName: string | null
  ) => {
    if (!selectedCharacterId) return;
    const isClearing = selectedCharacterId === 'CLEAR_ASSIGNMENT';
    const characterId = isClearing ? null : selectedCharacterId;
    const profileName = isClearing ? null : (selectedProfileName || resolveDefaultVariantName(selectedCharacterId, characters, speakers, speakerProfiles));
    
    setSegments(prev => prev.map(s => segmentIds.includes(s.id) ? { 
        ...s, character_id: characterId, speaker_profile_name: profileName, 
        audio_status: isClearing ? s.audio_status : 'unprocessed'
    } : s));

    try {
        await api.updateSegmentsBulk(segmentIds, { 
            character_id: characterId, speaker_profile_name: profileName,
            audio_status: isClearing ? undefined : 'unprocessed'
        });
    } catch (e) { console.error("Bulk assign failed", e); }
  }, [characters, speakers, speakerProfiles, setSegments]);

  const handleParagraphBulkReset = useCallback(async (segmentIds: string[]) => {
    setSegments(prev => prev.map(s => segmentIds.includes(s.id) ? { ...s, character_id: null, speaker_profile_name: null } : s));
    try { await api.updateSegmentsBulk(segmentIds, { character_id: null, speaker_profile_name: null }); }
    catch (e) { console.error("Bulk reset failed", e); }
  }, [setSegments]);

  return {
    handleScriptAssign,
    handleScriptAssignRange,
    handleParagraphBulkAssign,
    handleParagraphBulkReset
  };
};
