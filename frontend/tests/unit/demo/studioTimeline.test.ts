import { describe, it, expect } from 'vitest';
import { buildSegmentTimeline, activeChunkIdAt } from '../../../src/demo/stages/siteMockup/panes/studio';

describe('studioTimeline', () => {
  it('should build contiguous segment timeline matching target duration', () => {
    const chunks = [
      { id: 'c1', text: 'Hello world' },
      { id: 'c2', text: '   ' }, // whitespace ignored
      { id: 'c3', text: 'Test', isRendering: true }, // rendering ignored
      { id: 'c4', text: 'Another segment here.' },
    ];
    
    const timeline = buildSegmentTimeline(chunks, 100);
    expect(timeline.length).toBe(2);
    expect(timeline[0].id).toBe('c1');
    expect(timeline[1].id).toBe('c4');
    
    expect(timeline[0].start).toBe(0);
    expect(timeline[0].end).toBeCloseTo(timeline[1].start);
    expect(timeline[1].end).toBeCloseTo(100);
  });

  it('should compute active chunk correctly based on time', () => {
    const timeline = [
      { id: 'c1', start: 0, end: 10 },
      { id: 'c2', start: 10, end: 30 },
      { id: 'c3', start: 30, end: 40 },
    ];
    
    expect(activeChunkIdAt(timeline, -1)).toBeNull();
    expect(activeChunkIdAt(timeline, 0)).toBe('c1');
    expect(activeChunkIdAt(timeline, 5)).toBe('c1');
    expect(activeChunkIdAt(timeline, 10)).toBe('c2');
    expect(activeChunkIdAt(timeline, 29.9)).toBe('c2');
    expect(activeChunkIdAt(timeline, 30)).toBe('c3');
    expect(activeChunkIdAt(timeline, 40)).toBeNull(); // exclusive end
  });
});
