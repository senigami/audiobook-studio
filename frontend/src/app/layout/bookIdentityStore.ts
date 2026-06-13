export interface BookIdentity {
  id: string;
  title: string;
  author: string | null;
  series: string | null;
  coverUrl: string | null;
  runtimeSeconds: number;
  predictedSeconds: number | null;
}

let currentIdentity: BookIdentity | null = null;
const listeners = new Set<() => void>();

export function getBookIdentitySnapshot(): BookIdentity | null {
  return currentIdentity;
}

export function setBookIdentity(identity: BookIdentity | null): void {
  currentIdentity = identity;
  listeners.forEach((listener) => listener());
}

export function subscribeBookIdentity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
