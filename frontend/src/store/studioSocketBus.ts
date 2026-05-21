export interface StudioSocketEnvelope {
  frameId: number;
  receivedAt: string;
  data: any;
  raw?: string;
}

type StudioSocketMessageListener = (data: any, raw?: string, envelope?: StudioSocketEnvelope) => void;
type StudioSocketSender = (data: any) => void;

const messageListeners = new Set<StudioSocketMessageListener>();
const connectionListeners = new Set<() => void>();

let connected = false;
let sender: StudioSocketSender | null = null;
let nextFrameId = 1;

export const subscribeStudioSocketMessages = (listener: StudioSocketMessageListener) => {
  messageListeners.add(listener);
  return () => {
    messageListeners.delete(listener);
  };
};

export const publishStudioSocketMessage = (data: any, raw?: string) => {
  const envelope: StudioSocketEnvelope = {
    frameId: nextFrameId++,
    receivedAt: new Date().toISOString(),
    data,
    raw,
  };
  messageListeners.forEach(listener => listener(data, raw, envelope));
};

export const getStudioSocketConnected = () => connected;

export const subscribeStudioSocketConnected = (listener: () => void) => {
  connectionListeners.add(listener);
  return () => {
    connectionListeners.delete(listener);
  };
};

export const setStudioSocketConnected = (nextConnected: boolean) => {
  if (connected === nextConnected) return;
  connected = nextConnected;
  connectionListeners.forEach(listener => listener());
};

export const setStudioSocketSender = (nextSender: StudioSocketSender | null) => {
  sender = nextSender;
};

export const sendStudioSocketMessage = (data: any) => {
  sender?.(data);
};

export const resetStudioSocketBusForTests = () => {
  messageListeners.clear();
  connectionListeners.clear();
  connected = false;
  sender = null;
  nextFrameId = 1;
};
