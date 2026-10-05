import { describe, it, expect } from 'vitest';
import { computeSpanRenderProgress, batchEngineStatus } from '@/pages/ChapterEditor/scriptViewProgress';
import type { ScriptSpan, ScriptRenderBatch, TtsEngine } from '@/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSpan(id: string, text: string): ScriptSpan {
  return {
    id,
    order_index: 0,
    text,
    sanitized_text: text,
    character_id: null,
    speaker_profile_name: null,
    status: 'draft',
    audio_file_path: null,
    audio_generated_at: null,
    char_count: text.length,
    sanitized_char_count: text.length,
  };
}

function makeBatch(id: string, spanIds: string[]): ScriptRenderBatch {
  return { id, span_ids: spanIds };
}

const identity = (span: ScriptSpan) => span.text;

// ── computeSpanRenderProgress ────────────────────────────────────────────────

describe('computeSpanRenderProgress', () => {
  it('returns zero when batch is undefined', () => {
    const span = makeSpan('s1', 'Hello');
    const result = computeSpanRenderProgress(undefined, span, [span], 0.5, identity);
    expect(result).toEqual({ litCount: 0, showCursor: false });
  });

  it('distributes progress proportionally: first span lit at 50% across two equal spans', () => {
    // "Hello" (5 chars) + "World" (5 chars) = 10 total. At 50%: 5 chars lit globally.
    const s1 = makeSpan('s1', 'Hello');
    const s2 = makeSpan('s2', 'World');
    const batch = makeBatch('b1', ['s1', 's2']);
    // Query s1 at 50% — all 5 chars of s1 should be lit; cursor just past s1
    const r1 = computeSpanRenderProgress(batch, s1, [s1, s2], 0.5, identity);
    expect(r1.litCount).toBe(5);
    expect(r1.showCursor).toBe(false);
    // Query s2 at 50% — 0 of s2's chars are lit yet; cursor sits at s2's first char
    // (globalLitCount=5 == spanStart=5, so showCursor is true for index 0 of s2).
    const r2 = computeSpanRenderProgress(batch, s2, [s1, s2], 0.5, identity);
    expect(r2.litCount).toBe(0);
    expect(r2.showCursor).toBe(true);
  });

  it('cursor sits inside s2 when progress spans into it', () => {
    // "Hello" (5) + "World" (5) = 10 total. At 70%: 7 chars lit → s2 has 2 lit, cursor at index 2.
    const s1 = makeSpan('s1', 'Hello');
    const s2 = makeSpan('s2', 'World');
    const batch = makeBatch('b1', ['s1', 's2']);
    const r2 = computeSpanRenderProgress(batch, s2, [s1, s2], 0.7, identity);
    expect(r2.litCount).toBe(2);
    expect(r2.showCursor).toBe(true);
  });

  it('returns zero litCount and no cursor for span not found in batch', () => {
    const s1 = makeSpan('s1', 'Hello');
    const s2 = makeSpan('s2', 'World');
    const ghost = makeSpan('ghost', 'Ghost');
    const batch = makeBatch('b1', ['s1', 's2']);
    const result = computeSpanRenderProgress(batch, ghost, [s1, s2], 0.9, identity);
    expect(result).toEqual({ litCount: 0, showCursor: false });
  });

  it('clamps progress to [0,1] (negative input)', () => {
    const s1 = makeSpan('s1', 'Hello');
    const batch = makeBatch('b1', ['s1']);
    const result = computeSpanRenderProgress(batch, s1, [s1], -0.5, identity);
    expect(result.litCount).toBe(0);
  });

  it('clamps progress to [0,1] (> 1 input)', () => {
    const s1 = makeSpan('s1', 'Hi');
    const batch = makeBatch('b1', ['s1']);
    const result = computeSpanRenderProgress(batch, s1, [s1], 2.0, identity);
    expect(result.litCount).toBe(2); // all 2 chars lit, capped at span length
    expect(result.showCursor).toBe(false);
  });
});

// ── batchEngineStatus ────────────────────────────────────────────────────────

function makeEngine(id: string, enabled: boolean, status: 'ready' | 'error' = 'ready'): TtsEngine {
  return { engine_id: id, label: id, enabled, status } as TtsEngine;
}

describe('batchEngineStatus', () => {
  it('returns canGenerate=false when the batch engine is disabled', () => {
    const s1 = makeSpan('s1', 'Hello');
    s1.speaker_profile_name = 'Voice1';
    const spanMap = new Map([['s1', s1]]);
    const profileEngineMap = new Map([['Voice1', 'xtts']]);
    const engines = [makeEngine('xtts', false)];
    const result = batchEngineStatus(['s1'], spanMap, profileEngineMap, engines, false);
    expect(result.canGenerate).toBe(false);
    expect(result.unavailableEngine).toBe('xtts');
  });

  it('returns canGenerate=true when all engines in the batch are enabled', () => {
    const s1 = makeSpan('s1', 'Hello');
    s1.speaker_profile_name = 'Voice1';
    const spanMap = new Map([['s1', s1]]);
    const profileEngineMap = new Map([['Voice1', 'xtts']]);
    const engines = [makeEngine('xtts', true)];
    const result = batchEngineStatus(['s1'], spanMap, profileEngineMap, engines, true);
    expect(result.canGenerate).toBe(true);
    expect(result.unavailableEngine).toBeUndefined();
  });

  it('returns canGenerate=false (not anyEnginesEnabled) when span has no profile engine', () => {
    const s1 = makeSpan('s1', 'Hello');
    // No speaker_profile_name → no engineId in the set → canGenerate depends on anyEnginesEnabled
    const spanMap = new Map([['s1', s1]]);
    const profileEngineMap = new Map<string, string>();
    const engines: TtsEngine[] = [];
    const result = batchEngineStatus(['s1'], spanMap, profileEngineMap, engines, false);
    expect(result.canGenerate).toBe(false);
    expect(result.unavailableEngine).toBeUndefined();
  });
});
