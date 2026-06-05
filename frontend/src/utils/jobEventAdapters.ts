export const resolveEventUpdatedAt = (event: any, payload: any): number => {
  if (typeof payload?.updatedAt === 'number') return payload.updatedAt;
  if (typeof payload?.updated_at === 'number') return payload.updated_at;
  if (typeof payload?.updatedAt === 'string') {
    const val = Date.parse(payload.updatedAt) / 1000;
    if (!Number.isNaN(val)) return val;
  }
  if (typeof payload?.updated_at === 'string') {
    const val = Date.parse(payload.updated_at) / 1000;
    if (!Number.isNaN(val)) return val;
  }
  if (typeof event?.emittedAt === 'number') return event.emittedAt;
  if (typeof event?.emitted_at === 'number') return event.emitted_at;
  return Date.now() / 1000;
};

const getPayloadValue = (payload: Record<string, any>, keyCamel: string, _keySnake?: string) => {
  return payload[keyCamel];
};

const resolveEventClassification = (event: any, payload: Record<string, any>) => {
  const explicit = getPayloadValue(payload, 'classification', 'classification');
  if (explicit !== undefined) return explicit;
  if (event.topic === 'segments.lifecycle' || event.topic === 'segments.progress' || event.segmentId) {
    return 'segment';
  }
  if (event.topic === 'chapters.lifecycle' || event.topic === 'chapters.progress' || event.chapterId) {
    return 'chapter';
  }
  return undefined;
};

export const copyRenderGroupFields = (target: Record<string, any>, source: Record<string, any>, excludeSegmentFields = false) => {
  const fields = [
    'render_group_count',
    'completed_render_groups',
    'active_render_group_index',
    'total_render_weight',
    'completed_render_weight',
    'active_render_group_weight',
    'grouped_progress',
    ...(!excludeSegmentFields ? ['active_segment_id', 'active_segment_progress'] : []),
  ];
  for (const key of fields) {
    if (source[key] !== undefined) {
      target[key] = source[key];
    }
  }
};

export const adaptEventToJobUpdates = (event: any) => {
  const payload = event.payload || {};
  const rCode = getPayloadValue(payload, 'reasonCode', 'reason_code');
  const shouldOmitMessage = event.topic === 'chapters.progress' && (
    rCode === 'segment_start'
    || rCode === 'segment_saved'
    || rCode === 'START_SEGMENT'
    || rCode === 'SEGMENT_SAVED'
  );

  const updates: any = {
    source_topic: event.topic,
    job_id: event.jobId,
    project_id: event.projectId,
    chapter_id: event.chapterId,
    classification: resolveEventClassification(event, payload),
    parent_job_id: getPayloadValue(payload, 'parentJobId', 'parent_job_id'),
    segment_ids: getPayloadValue(payload, 'segmentIds', 'segment_ids'),
    engine: getPayloadValue(payload, 'engine', 'engine'),
    custom_title: getPayloadValue(payload, 'customTitle', 'custom_title'),
    status: getPayloadValue(payload, 'status', 'status'),
    progress: getPayloadValue(payload, 'progress', 'progress'),
    eta_seconds: getPayloadValue(payload, 'etaSeconds', 'eta_seconds'),
    started_at: getPayloadValue(payload, 'startedAt', 'started_at'),
    completed_at: getPayloadValue(payload, 'completedAt', 'completed_at'),
    updated_at: resolveEventUpdatedAt(event, payload),
    db_updated_at: typeof getPayloadValue(payload, 'updatedAt', 'updated_at') === 'number'
      ? getPayloadValue(payload, 'updatedAt', 'updated_at')
      : (typeof getPayloadValue(payload, 'updatedAt', 'updated_at') === 'string'
        ? Date.parse(getPayloadValue(payload, 'updatedAt', 'updated_at') as string) / 1000
        : undefined),
    db_started_at: typeof getPayloadValue(payload, 'startedAt', 'started_at') === 'number'
      ? getPayloadValue(payload, 'startedAt', 'started_at')
      : (typeof getPayloadValue(payload, 'startedAt', 'started_at') === 'string'
        ? Date.parse(getPayloadValue(payload, 'startedAt', 'started_at') as string) / 1000
        : undefined),
    estimated_end_at: getPayloadValue(payload, 'estimatedEndAt', 'estimated_end_at'),
    eta_updated_at: getPayloadValue(payload, 'etaUpdatedAt', 'eta_updated_at'),
    confidence: getPayloadValue(payload, 'confidence', 'confidence'),
    reason_code: rCode,
    render_group_count: getPayloadValue(payload, 'renderGroupCount', 'render_group_count'),
    completed_render_groups: getPayloadValue(payload, 'completedRenderGroups', 'completed_render_groups'),
    active_render_group_index: getPayloadValue(payload, 'activeRenderGroupIndex', 'active_render_group_index'),
    total_render_weight: getPayloadValue(payload, 'totalRenderWeight', 'total_render_weight'),
    completed_render_weight: getPayloadValue(payload, 'completedRenderWeight', 'completed_render_weight'),
    active_render_group_weight: getPayloadValue(payload, 'activeRenderGroupWeight', 'active_render_group_weight'),
    grouped_progress: getPayloadValue(payload, 'groupedProgress', 'grouped_progress'),
    active_segment_id: getPayloadValue(payload, 'activeSegmentId', 'active_segment_id'),
    active_segment_progress: getPayloadValue(payload, 'activeSegmentProgress', 'active_segment_progress'),
    active_segment_eta_seconds: getPayloadValue(payload, 'activeSegmentEtaSeconds', 'active_segment_eta_seconds'),
    active_segment_eta_basis: getPayloadValue(payload, 'activeSegmentEtaBasis', 'active_segment_eta_basis'),
    active_segment_updated_at: getPayloadValue(payload, 'activeSegmentUpdatedAt', 'active_segment_updated_at'),
    active_render_batch_id: getPayloadValue(payload, 'activeRenderBatchId', 'active_render_batch_id'),
    active_render_batch_progress: getPayloadValue(payload, 'activeRenderBatchProgress', 'active_render_batch_progress'),
    produced_audio_length: getPayloadValue(payload, 'producedAudioLength', 'produced_audio_length'),
    audio_length_seconds: getPayloadValue(payload, 'audioLengthSeconds', 'audio_length_seconds'),
    produced_chars: getPayloadValue(payload, 'producedChars', 'produced_chars'),
    produced_segment_count: getPayloadValue(payload, 'producedSegmentCount', 'produced_segment_count'),
    has_segment_support: getPayloadValue(payload, 'hasSegmentSupport', 'has_segment_support'),
    hasSegmentSupport: getPayloadValue(payload, 'hasSegmentSupport', 'has_segment_support'),
  };

  if (!shouldOmitMessage) {
    updates.log = payload.message || payload.log;
  }

  return updates;
};

export const shouldOmitChapterProgressMessage = (event: any) => {
  const payload = event?.payload || {};
  const reasonCode = getPayloadValue(payload, 'reasonCode', 'reason_code');
  return event?.topic === 'chapters.progress' && (
    reasonCode === 'segment_start'
    || reasonCode === 'segment_saved'
    || reasonCode === 'START_SEGMENT'
    || reasonCode === 'SEGMENT_SAVED'
  );
};

export const copyJobUpdateRenderGroupFields = copyRenderGroupFields;
