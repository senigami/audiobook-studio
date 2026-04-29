import { useCallback } from 'react';
import { api } from '../../api';
import { resolveDefaultVariantName } from '../../utils/chapterEditorHelpers';
import type { ChapterEditorState } from './useChapterEditorState';
import type { Character, Speaker, SpeakerProfile, ScriptRangeAssignment } from '../../types';

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
        const result = await api.saveScriptAssignments(chapterId, {
            base_revision_id: scriptViewData.base_revision_id,
            assignments: [{
                span_ids: spanIds,
                character_id: characterId,
                speaker_profile_name: profileName
            }]
        });
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
        const result = await api.saveScriptAssignments(chapterId, {
            base_revision_id: scriptViewData.base_revision_id,
            assignments: [],
            range_assignments: [{
                ...range,
                character_id: characterId,
                speaker_profile_name: profileName
            }]
        });
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
