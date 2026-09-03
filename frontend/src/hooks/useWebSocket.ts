import { useState, useEffect, useCallback, useRef } from 'react';

export const useWebSocket = (
  url: string,
  onMessage: (data: any, raw?: string) => void,
  options?: { captureDebugMessages?: boolean }
) => {
  void options?.captureDebugMessages;
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const onMessageRef = useRef(onMessage);
  const mountedRef = useRef(false);
  const didMountRef = useRef(false);
  const urlRef = useRef(url);
  const captureDebugMessages = options?.captureDebugMessages ?? true;
  void captureDebugMessages;

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  // Keep urlRef current so the reconnect closure always uses the latest url.
  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN || socketRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}${urlRef.current}`);
    socketRef.current = socket;

    socket.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    socket.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const raw = event.data;
        const data = JSON.parse(raw);

        onMessageRef.current(data, raw);
      } catch (e) {
        console.error('WS parse error', e);
      }
    };

    socket.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      socketRef.current = null;
      if (!reconnectTimerRef.current) {
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          if (mountedRef.current) {
            connect();
          }
        }, 5000);
      }
    };

    socket.onerror = () => {
      socket.close();
    };
  }, []); // stable: uses refs for url, mounted, and connect itself

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (socketRef.current) {
        // Remove onclose before closing so the reconnect path is not triggered.
        socketRef.current.onclose = null;
        socketRef.current.close();
        socketRef.current = null;
      }
      setConnected(false);
    };
  }, []); // run once on mount/unmount

  // Reconnect when url changes (skip on initial mount — handled by the mount effect above).
  useEffect(() => {
    if (!didMountRef.current) {
      // First run: mark that subsequent runs are post-mount url changes.
      didMountRef.current = true;
      return;
    }
    if (!mountedRef.current) return;
    // Close existing socket without triggering reconnect, then open a new one.
    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.close();
      socketRef.current = null;
    }
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    connect();
  }, [url, connect]);

  const sendMessage = useCallback((data: any) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { connected, sendMessage };
};
