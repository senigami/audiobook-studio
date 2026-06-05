import { useSyncExternalStore } from 'react';
import { getStudioSocketConnected, subscribeStudioSocketConnected } from '@/store/studioSocketBus';

export const useStudioSocketConnection = () => {
  return useSyncExternalStore(
    subscribeStudioSocketConnected,
    getStudioSocketConnected,
    getStudioSocketConnected
  );
};
