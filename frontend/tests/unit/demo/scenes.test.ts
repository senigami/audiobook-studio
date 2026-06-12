import { describe, it, expect, beforeEach } from 'vitest';
import { demoTimeline, renderArcScene, compileTimeline } from '@/demo/scenes/index';
import type { DemoScene } from '@/demo/scenes/types';
import { publishStudioSocketMessage, resetStudioSocketBusForTests } from '@/store/studioSocketBus';

const KNOWN_TOPICS = new Set([
  'jobs.lifecycle',
  'queue.items',
  'chapters.lifecycle',
  'chapters.progress',
  'segments.lifecycle',
  'segments.progress',
  'tts.logs',
  'voice.test',
  'system.events',
  'projects.lifecycle',
]);

const isKnownTopic = (topic: unknown) => {
  if (typeof topic !== 'string') return false;
  if (KNOWN_TOPICS.has(topic)) return true;
  if (topic.startsWith('plugins.')) return true;
  return false;
};

// ---------------------------------------------------------------------------
// 1. Shape invariants over every frame in demoTimeline
// ---------------------------------------------------------------------------
describe('demoTimeline frame shapes', () => {
  it('every frame has type studio_event or jobs_snapshot', () => {
    for (const scene of demoTimeline.scenes) {
      for (const frame of scene.frames) {
        expect(['studio_event', 'jobs_snapshot']).toContain(frame.data.type);
      }
    }
  });

  it('every studio_event frame has version:1, a known topic, and an ids object', () => {
    for (const scene of demoTimeline.scenes) {
      for (const frame of scene.frames) {
        if (frame.data.type !== 'studio_event') continue;
        expect(frame.data.version).toBe(1);
        expect(isKnownTopic(frame.data.topic)).toBe(true);
        expect(frame.data.ids).toBeDefined();
        expect(typeof frame.data.ids).toBe('object');
      }
    }
  });

  it('jobs_snapshot frames carry a jobs array', () => {
    for (const scene of demoTimeline.scenes) {
      for (const frame of scene.frames) {
        if (frame.data.type !== 'jobs_snapshot') continue;
        expect(Array.isArray(frame.data.jobs)).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. renderArc ordering invariants
// ---------------------------------------------------------------------------
describe('renderArcScene ordering invariants', () => {
  const SEGMENT_IDS = ['seg-g0-xtts', 'seg-g1-voxtral', 'seg-g2-xtts', 'seg-g3-voxtral'];

  const segFramesFor = (segmentId: string) =>
    renderArcScene.frames.filter(
      f =>
        f.data.type === 'studio_event' &&
        f.data.topic === 'segments.progress' &&
        f.data.ids?.segmentId === segmentId,
    );

  const chapterFrames = () =>
    renderArcScene.frames.filter(
      f => f.data.type === 'studio_event' && f.data.topic === 'chapters.progress',
    );

  it('for each segment: SEGMENT_PENDING → START_SEGMENT → SEGMENT_PROGRESS* → SEGMENT_SAVED', () => {
    for (const segId of SEGMENT_IDS) {
      const frames = segFramesFor(segId);
      expect(frames.length).toBeGreaterThanOrEqual(3);

      const reasonCodes = frames.map(f => f.data.payload?.reasonCode as string);

      const pendingIdx = reasonCodes.indexOf('SEGMENT_PENDING');
      const startIdx = reasonCodes.indexOf('START_SEGMENT');
      const savedIdx = reasonCodes.lastIndexOf('SEGMENT_SAVED');

      expect(pendingIdx).toBeGreaterThanOrEqual(0);
      expect(startIdx).toBeGreaterThan(pendingIdx);
      expect(savedIdx).toBeGreaterThan(startIdx);

      // All SEGMENT_PROGRESS frames come between START_SEGMENT and SEGMENT_SAVED
      reasonCodes.forEach((code, i) => {
        if (code === 'SEGMENT_PROGRESS') {
          expect(i).toBeGreaterThan(startIdx);
          expect(i).toBeLessThan(savedIdx);
        }
      });
    }
  });

  it('SEGMENT_PENDING frames have etaSeconds null', () => {
    for (const segId of SEGMENT_IDS) {
      const pendingFrames = segFramesFor(segId).filter(
        f => f.data.payload?.reasonCode === 'SEGMENT_PENDING',
      );
      expect(pendingFrames.length).toBeGreaterThanOrEqual(1);
      for (const f of pendingFrames) {
        expect(f.data.payload.etaSeconds).toBeNull();
      }
    }
  });

  it('chapter completedRenderGroups is monotonically 0→4 across render arc', () => {
    const completedValues = chapterFrames()
      .map(f => f.data.payload?.completedRenderGroups as number | null)
      .filter(v => v !== null && v !== undefined);

    // Should contain values from 0 to 4
    expect(Math.min(...completedValues)).toBe(0);
    expect(Math.max(...completedValues)).toBe(4);

    // Must be non-decreasing
    for (let i = 1; i < completedValues.length; i++) {
      expect(completedValues[i]).toBeGreaterThanOrEqual(completedValues[i - 1]);
    }
  });

  it('final chapter frame has status done and progress 1', () => {
    const frames = chapterFrames();
    const last = frames[frames.length - 1];
    expect(last.data.payload.status).toBe('done');
    expect(last.data.payload.progress).toBe(1);
  });

  it('final queue frame has status done and progress 1', () => {
    const qFrames = renderArcScene.frames.filter(
      f => f.data.type === 'studio_event' && f.data.topic === 'queue.items',
    );
    const last = qFrames[qFrames.length - 1];
    expect(last.data.payload.status).toBe('done');
    expect(last.data.payload.progress).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. compileTimeline rejects unsorted frames
// ---------------------------------------------------------------------------
describe('compileTimeline validation', () => {
  it('throws when frames are not sorted by atMs', () => {
    const badScene: DemoScene = {
      id: 'bad',
      title: 'Bad',
      caption: '',
      durationMs: 5000,
      frames: [
        { atMs: 3000, data: { type: 'jobs_snapshot', jobs: [] } },
        { atMs: 1000, data: { type: 'jobs_snapshot', jobs: [] } },
      ],
    };
    expect(() => compileTimeline([badScene])).toThrow();
  });

  it('throws when a frame atMs exceeds durationMs', () => {
    const badScene: DemoScene = {
      id: 'bad2',
      title: 'Bad2',
      caption: '',
      durationMs: 1000,
      frames: [{ atMs: 2000, data: { type: 'jobs_snapshot', jobs: [] } }],
    };
    expect(() => compileTimeline([badScene])).toThrow();
  });

  it('accepts valid sorted scenes', () => {
    const good: DemoScene = {
      id: 'good',
      title: 'Good',
      caption: '',
      durationMs: 5000,
      frames: [
        { atMs: 0, data: { type: 'jobs_snapshot', jobs: [] } },
        { atMs: 1000, data: { type: 'jobs_snapshot', jobs: [] } },
        { atMs: 5000, data: { type: 'jobs_snapshot', jobs: [] } },
      ],
    };
    const tl = compileTimeline([good]);
    expect(tl.totalMs).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// 4. Smoke: publish all renderArc frames through the real socket bus
// ---------------------------------------------------------------------------
describe('renderArcScene smoke publish', () => {
  beforeEach(() => {
    resetStudioSocketBusForTests();
  });

  it('publishing all frames does not throw', () => {
    expect(() => {
      for (const frame of renderArcScene.frames) {
        publishStudioSocketMessage(frame.data);
      }
    }).not.toThrow();
  });

  it('all published frames can be normalized without error', async () => {
    const { normalizeStudioSocketEnvelope } = await import('@/api/contracts/liveEvents');
    let frameId = 1;
    for (const frame of renderArcScene.frames) {
      const envelope = {
        frameId: frameId++,
        receivedAt: new Date().toISOString(),
        data: frame.data,
      };
      expect(() => normalizeStudioSocketEnvelope(envelope)).not.toThrow();
    }
  });
});
