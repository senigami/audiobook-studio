import { useEffect, useState } from 'react';

const STARTUP_COPY_DELAY_MS = 180;

// Delays showing startup message copy so a fast (sub-180ms) load never
// flashes the "Starting Audiobook Studio Services..." text.
export const useStartupOverlay = (initialLoading: boolean) => {
  const [showStartupCopy, setShowStartupCopy] = useState(false);

  useEffect(() => {
    if (!initialLoading) {
      setShowStartupCopy(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowStartupCopy(true);
    }, STARTUP_COPY_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [initialLoading]);

  return showStartupCopy;
};
