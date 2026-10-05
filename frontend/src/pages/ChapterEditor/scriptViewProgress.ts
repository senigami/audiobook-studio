/**
 * scriptViewProgress — pure rendering-progress helpers for ScriptView.
 *
 * Extracted from ScriptView.tsx so the lit-char math and engine-status
 * logic can be unit-tested without React or DOM.
 */

import type { ScriptSpan, ScriptRenderBatch, TtsEngine } from '@/types';

const clamp01 = (value: number) => Math.max(0, Math.min(value, 1));

/**
 * Given a batch render progress (0–1) and the span to query, return:
 *   - litCount:    number of characters in this span that are "lit" (rendered so far)
 *   - showCursor:  whether the progress cursor sits within this span
 *
 * The batch progress is distributed proportionally across all spans in the
 * batch by character count.  `getDisplayText` must return the same string
 * that the UI renders (raw or sanitized, depending on showSafeText).
 */
export function computeSpanRenderProgress(
  batch: ScriptRenderBatch | undefined,
  span: ScriptSpan,
  batchSpans: ScriptSpan[],
  batchProgress: number,
  getDisplayText: (span: ScriptSpan) => string,
): { litCount: number; showCursor: boolean } {
  if (!batch) return { litCount: 0, showCursor: false };

  const progress = clamp01(batchProgress);
  const lengths = batchSpans.map((candidate) => Array.from(getDisplayText(candidate)).length);
  const totalChars = lengths.reduce((sum, length) => sum + length, 0);
  const globalLitCount = Math.floor(progress * totalChars);

  let offset = 0;
  for (let index = 0; index < batchSpans.length; index += 1) {
    const candidate = batchSpans[index];
    const length = lengths[index];
    const spanStart = offset;
    const spanEnd = spanStart + length;
    offset = spanEnd;

    if (candidate.id !== span.id) continue;

    return {
      litCount: Math.max(0, Math.min(globalLitCount - spanStart, length)),
      showCursor: globalLitCount >= spanStart && globalLitCount < spanEnd,
    };
  }

  return { litCount: 0, showCursor: false };
}

export interface BatchEngineStatusResult {
  canGenerate: boolean;
  unavailableEngine: string | undefined;
}

/**
 * Given the span IDs in a render batch, return whether the batch can be
 * generated and which engine (if any) is unavailable.
 *
 * `profileEngineMap` maps speaker_profile_name → engine_id.
 * `anyEnginesEnabled` is true when at least one engine is ready.
 * `engineIsEnabled` returns true if the given engine_id is ready.
 */
export function batchEngineStatus(
  spanIds: string[],
  spanMap: Map<string, ScriptSpan>,
  profileEngineMap: Map<string, string>,
  engines: TtsEngine[],
  anyEnginesEnabled: boolean,
): BatchEngineStatusResult {
  const enginesForBatch = new Set<string>();
  spanIds.forEach((spanId) => {
    const span = spanMap.get(spanId);
    const engineId =
      span?.speaker_profile_name ? profileEngineMap.get(span.speaker_profile_name) || null : null;
    if (engineId) enginesForBatch.add(engineId);
  });

  const engineIsEnabled = (engineId: string): boolean => {
    if (engines.length === 0) return true;
    if (!engineId || engineId === 'unknown') return anyEnginesEnabled;
    return engines.some(
      (engine) => engine.engine_id === engineId && engine.enabled && engine.status === 'ready',
    );
  };

  const unavailable = Array.from(enginesForBatch).find((engineId) => !engineIsEnabled(engineId));
  return {
    canGenerate: unavailable ? false : anyEnginesEnabled,
    unavailableEngine: unavailable,
  };
}
