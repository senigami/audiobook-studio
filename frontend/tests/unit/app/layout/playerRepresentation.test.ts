import { describe, it, expect } from 'vitest';
import { fitsLegibly, DURATION_BOOTSTRAP } from '@/app/layout/playerRepresentation';
import * as bus from '@/store/playerBus';
import { loadAndPlay, getSnapshot, resetPlayerBusForTests } from '@/store/playerBus';

describe('fitsLegibly — predicate boundaries', () => {
  it('short clip, wide bar → waveform (60 px/sec >> 3 px/sec floor)', () => {
    expect(fitsLegibly(10, 600)).toBe(true);
  });

  it('long clip, wide bar → bar (1 px/sec < 3 px/sec floor)', () => {
    expect(fitsLegibly(600, 600)).toBe(false);
  });

  it('clip at exactly the floor → waveform (boundary: >= not >)', () => {
    // 600 / 200 === 3.0 === PX_PER_SEC_FLOOR; exactly at the floor is legible
    expect(fitsLegibly(200, 600)).toBe(true);
  });

  it('clip just over the floor → bar (600 / 201 ≈ 2.99 < 3)', () => {
    expect(fitsLegibly(201, 600)).toBe(false);
  });

  it('zero/unknown duration → waveform (defensive)', () => {
    expect(fitsLegibly(0, 600)).toBe(true);
  });
});

describe('fitsLegibly — bootstrap (unmeasured width)', () => {
  it('short clip, no width → waveform (within bootstrap threshold)', () => {
    expect(fitsLegibly(DURATION_BOOTSTRAP - 1, 0)).toBe(true);
  });

  it('clip at bootstrap threshold → waveform (boundary: <=)', () => {
    expect(fitsLegibly(DURATION_BOOTSTRAP, 0)).toBe(true);
  });

  it('long clip, no width → bar (exceeds bootstrap)', () => {
    expect(fitsLegibly(DURATION_BOOTSTRAP + 1, 0)).toBe(false);
  });
});

describe('scope toggle removal — bus contract', () => {
  it('switchScope is not exported from playerBus.ts', () => {
    expect('switchScope' in bus).toBe(false);
  });

  it('altScope is not present on the bus snapshot', () => {
    resetPlayerBusForTests();
    loadAndPlay({ scope: 'chapter', title: 'T', audioUrl: 'http://a.com/t.mp3' });
    const snap = getSnapshot();
    expect('altScope' in snap).toBe(false);
  });
});
