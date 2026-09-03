import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  publishStudioSocketMessage,
  subscribeStudioSocketMessages,
  resetStudioSocketBusForTests,
  type StudioSocketEnvelope,
} from '@/store/studioSocketBus';

describe('studioSocketBus', () => {
  beforeEach(() => {
    resetStudioSocketBusForTests();
  });

  it('increments frameId and sends a structured envelope on publish', () => {
    const listener = vi.fn();
    subscribeStudioSocketMessages(listener);

    publishStudioSocketMessage({ type: 'test_event' }, '{"type":"test_event"}');

    expect(listener).toHaveBeenCalledTimes(1);
    const [data, raw, envelope] = listener.mock.calls[0] as [any, string?, StudioSocketEnvelope?];
    
    expect(data).toEqual({ type: 'test_event' });
    expect(raw).toBe('{"type":"test_event"}');
    expect(envelope).toBeDefined();
    expect(envelope?.frameId).toBe(1);
    expect(envelope?.receivedAt).toBeDefined();
    expect(envelope?.data).toEqual({ type: 'test_event' });
    expect(envelope?.raw).toBe('{"type":"test_event"}');

    // Second publish increments frameId
    publishStudioSocketMessage({ type: 'other_event' });
    const [,, envelope2] = listener.mock.calls[1] as [any, string?, StudioSocketEnvelope?];
    expect(envelope2?.frameId).toBe(2);
  });

  it('resets frameId to 1 on resetStudioSocketBusForTests', () => {
    const listener = vi.fn();
    subscribeStudioSocketMessages(listener);

    publishStudioSocketMessage({ type: 'event1' });
    resetStudioSocketBusForTests();

    subscribeStudioSocketMessages(listener);
    publishStudioSocketMessage({ type: 'event2' });

    // The second call (after reset) gets frameId = 1
    const [,, envelope] = listener.mock.calls[1] as [any, string?, StudioSocketEnvelope?];
    expect(envelope?.frameId).toBe(1);
  });
});
