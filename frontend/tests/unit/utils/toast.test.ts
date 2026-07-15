import { describe, it, expect, vi } from 'vitest';
import { emitToast, APP_TOAST_EVENT } from '@/utils/toast';

describe('emitToast', () => {
  it('dispatches a studio-toast event carrying just the message when no action is given', () => {
    const handler = vi.fn();
    window.addEventListener(APP_TOAST_EVENT, handler);

    emitToast('Saved.');

    expect(handler).toHaveBeenCalledTimes(1);
    const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.message).toBe('Saved.');
    expect(detail.action).toBeUndefined();

    window.removeEventListener(APP_TOAST_EVENT, handler);
  });

  it('carries an optional undo action through to listeners', () => {
    const handler = vi.fn();
    window.addEventListener(APP_TOAST_EVENT, handler);
    const onClick = vi.fn();

    emitToast('Deleted "Voice 1"', { label: 'Undo', onClick });

    const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.message).toBe('Deleted "Voice 1"');
    expect(detail.action).toEqual({ label: 'Undo', onClick });

    window.removeEventListener(APP_TOAST_EVENT, handler);
  });
});
