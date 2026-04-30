import { useState, useEffect, useCallback, useRef } from 'react';

export const useWebSocket = (url: string, onMessage: (data: any) => void) => {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN || socketRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}${url}`);
    socketRef.current = socket;

    socket.onopen = () => {
      setConnected(true);
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessageRef.current(data);
      } catch (e) {
        console.error('WS parse error', e);
      }
    };

    socket.onclose = () => {
      setConnected(false);
      socketRef.current = null;
      if (!reconnectTimerRef.current) {
        reconnectTimerRef.current = window.setTimeout(connect, 5000);
      }
    };

    socket.onerror = () => {
      socket.close();
    };
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [connect]);

  return { connected };
};
