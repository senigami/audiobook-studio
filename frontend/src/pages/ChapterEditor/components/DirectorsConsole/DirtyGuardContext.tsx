import React, { createContext, useContext, useMemo } from 'react';

/**
 * Shared "unsaved work" signal between a Director's Console tool body and
 * the console itself (index.tsx). Tool bodies are rendered with ZERO props
 * (INV-1) so this can't be a prop — it's a Context instead.
 *
 * Ownership: `DirectorsConsole` owns the dirty flag (its own
 * useState/useRef) and is the only consumer that ever reads it back — a
 * tool body only ever calls `setDirty`, ideally whenever its own
 * uncommitted-edit signal changes, and never needs to read the current
 * value. `DirtyGuardProvider` is a thin pass-through: it takes the
 * console's state setter as a prop and hands it to descendants via context.
 */
export interface DirtyGuardContextValue {
  /**
   * Called by a tool body to report whether it currently has unsaved/
   * uncommitted work in progress. `message` is an optional short,
   * human-readable label (e.g. "Uncommitted chapter text edit") the console
   * may surface in its confirm-switch copy.
   */
  setDirty: (isDirty: boolean, message?: string) => void;
}

const noopContextValue: DirtyGuardContextValue = { setDirty: () => {} };

const DirtyGuardContext = createContext<DirtyGuardContextValue>(noopContextValue);

/**
 * Hook for a Director's Console tool body to report its dirty state up to
 * the console. Falls back to a no-op setter when rendered outside a
 * `DirtyGuardProvider` (e.g. an isolated unit test) so callers don't need to
 * special-case that.
 */
export function useDirtyGuard(): DirtyGuardContextValue {
  return useContext(DirtyGuardContext);
}

interface DirtyGuardProviderProps {
  /** Owned and stored by `DirectorsConsole` (see index.tsx) — this provider
   * only forwards `setDirty` calls to it so the dirty state lives in
   * exactly one place. */
  onDirtyChange: (isDirty: boolean, message?: string) => void;
  children: React.ReactNode;
}

export const DirtyGuardProvider: React.FC<DirtyGuardProviderProps> = ({ onDirtyChange, children }) => {
  const value = useMemo<DirtyGuardContextValue>(() => ({ setDirty: onDirtyChange }), [onDirtyChange]);
  return <DirtyGuardContext.Provider value={value}>{children}</DirtyGuardContext.Provider>;
};
