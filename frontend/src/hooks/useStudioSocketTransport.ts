import { useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  publishStudioSocketMessage,
  setStudioSocketConnected,
  setStudioSocketSender,
} from '@/store/studioSocketBus';

export const useStudioSocketTransport = () => {
  const { connected, sendMessage } = useWebSocket('/ws', (data, raw) => {
    publishStudioSocketMessage(data, raw);
  });

  useEffect(() => {
    setStudioSocketConnected(connected);
    return () => {
      setStudioSocketConnected(false);
    };
  }, [connected]);

  useEffect(() => {
    setStudioSocketSender(sendMessage);
    return () => {
      setStudioSocketSender(null);
    };
  }, [sendMessage]);

  return { connected, sendMessage };
};
