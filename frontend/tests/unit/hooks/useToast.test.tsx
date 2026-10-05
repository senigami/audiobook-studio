import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useToast } from '@/hooks/useToast';

describe('useToast', () => {
  it('shows a toast with no action by default', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('Hello');
    });

    expect(result.current.toast?.message).toBe('Hello');
    expect(result.current.toast?.action).toBeUndefined();
  });

  it('carries an action (e.g. Undo) alongside the message and invokes it on demand', () => {
    const { result } = renderHook(() => useToast());
    const onClick = vi.fn();

    act(() => {
      result.current.showToast('Deleted "Voice 1"', { label: 'Undo', onClick });
    });

    expect(result.current.toast?.action).toEqual({ label: 'Undo', onClick });

    act(() => {
      result.current.toast?.action?.onClick();
    });

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('dismissToast clears the current toast (and its action)', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('Deleted', { label: 'Undo', onClick: vi.fn() });
    });
    expect(result.current.toast).not.toBeNull();

    act(() => {
      result.current.dismissToast();
    });
    expect(result.current.toast).toBeNull();
  });
});
