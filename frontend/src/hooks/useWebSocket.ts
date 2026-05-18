import { useState, useEffect, useCallback, useRef } from 'react';

export const useWebSocket = (
  url: string,
  onMessage: (data: any) => void,
  options?: { captureDebugMessages?: boolean }
) => {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const onMessageRef = useRef(onMessage);
  const captureDebugMessages = options?.captureDebugMessages ?? true;

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
        const raw = event.data;
        const data = JSON.parse(raw);

        // Record message in a global ring buffer
        if (captureDebugMessages && typeof window !== 'undefined') {
          if (!(window as any).__websocketRecentMessages) {
            (window as any).__websocketRecentMessages = [];
          }
          const buffer = (window as any).__websocketRecentMessages;

          const debugMsg: any = {
            receivedAt: new Date().toISOString(),
            raw,
          };

          if (data && typeof data === 'object') {
            if (data.type !== undefined) debugMsg.type = data.type;
            if (data.source !== undefined) debugMsg.source = data.source;
            if (data.scope !== undefined) debugMsg.scope = data.scope;
            if (data.classification !== undefined) debugMsg.classification = data.classification;
            if (data.job_id !== undefined) debugMsg.job_id = data.job_id;
            if (data.project_id !== undefined) debugMsg.project_id = data.project_id;
            if (data.chapter_id !== undefined) debugMsg.chapter_id = data.chapter_id;
            if (data.status !== undefined) debugMsg.status = data.status;
            if (data.progress !== undefined) debugMsg.progress = data.progress;
            if (data.reason_code !== undefined) debugMsg.reason_code = data.reason_code;
          }

          buffer.push(debugMsg);
          // Cap at 400 messages (between 300 and 500)
          if (buffer.length > 400) {
            buffer.shift();
          }
        }

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
  }, [url, captureDebugMessages]);

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

  const sendMessage = useCallback((data: any) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { connected, sendMessage };
};
