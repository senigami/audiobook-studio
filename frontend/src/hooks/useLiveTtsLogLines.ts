import { useEffect, useRef, useState } from 'react';
import type { TtsLogLiveEvent } from '@/api/contracts/liveEvents';
import {
  getLiveEventAuditSnapshot,
  recordLiveEventSubscriberObservation,
  subscribeLiveEventAudit,
} from '@/store/liveEventAuditStore';

export interface LiveTtsLogLine {
  frameId: number;
  line: string;
  jobId?: string | null;
  sequence?: number | null;
  timestamp?: string;
  pluginShortName?: string;
}

export interface UseLiveTtsLogLinesResult {
  liveLines: LiveTtsLogLine[];
  markRefreshStart: () => number;
  resetCursor: (options?: { preserveAfterFrameId?: number }) => void;
}

const dedupeKey = (event: TtsLogLiveEvent): string => {
  const jobId = event.jobId;
  const seq = event.payload.sequence;
  if (jobId && typeof seq === 'number') return `${jobId}:${seq}`;
  return `frame:${event.frameId}`;
};

const dedupeKeyForLine = (line: LiveTtsLogLine): string => {
  if (line.jobId && typeof line.sequence === 'number') return `${line.jobId}:${line.sequence}`;
  return `frame:${line.frameId}`;
};

const latestFrameIdFromSnapshot = (): number => {
  const snapshot = getLiveEventAuditSnapshot();
  if (snapshot.length === 0) return 0;
  return snapshot[snapshot.length - 1].event.frameId;
};

export const useLiveTtsLogLines = (active: boolean): UseLiveTtsLogLinesResult => {
  const [liveLines, setLiveLines] = useState<LiveTtsLogLine[]>([]);
  const cursorRef = useRef<number>(0);
  const liveLinesRef = useRef<LiveTtsLogLine[]>([]);
  const seenKeysRef = useRef<Set<string>>(new Set());

  const setTrackedLiveLines = (nextLines: LiveTtsLogLine[]) => {
    liveLinesRef.current = nextLines;
    setLiveLines(nextLines);
  };

  useEffect(() => {
    if (!active) return;
    cursorRef.current = latestFrameIdFromSnapshot();

    const consumeNewFrames = () => {
      const records = getLiveEventAuditSnapshot();
      const newLines: LiveTtsLogLine[] = [];
      for (const record of records) {
        const event = record.event;
        if (event.frameId <= cursorRef.current) continue;
        cursorRef.current = event.frameId;
        if (event.topic !== 'tts.logs') continue;
        const tts = event as TtsLogLiveEvent;
        const key = dedupeKey(tts);
        if (seenKeysRef.current.has(key)) continue;
        seenKeysRef.current.add(key);
        newLines.push({
          frameId: event.frameId,
          line: tts.payload.line,
          jobId: event.jobId,
          sequence: tts.payload.sequence,
          timestamp: event.receivedAt,
          pluginShortName: tts.payload.pluginShortName,
        });
        recordLiveEventSubscriberObservation(event.frameId, 'tts-diagnostics', 'handled');
      }
      if (newLines.length > 0) {
        setTrackedLiveLines([...liveLinesRef.current, ...newLines]);
      }
    };

    return subscribeLiveEventAudit(consumeNewFrames);
  }, [active]);

  const markRefreshStart = () => latestFrameIdFromSnapshot();

  const resetCursor = (options?: { preserveAfterFrameId?: number }) => {
    cursorRef.current = latestFrameIdFromSnapshot();
    const preserveAfterFrameId = options?.preserveAfterFrameId;
    const preservedLines = typeof preserveAfterFrameId === 'number'
      ? liveLinesRef.current.filter(line => line.frameId > preserveAfterFrameId)
      : [];
    const nextLines = [...preservedLines];
    const seenKeys = new Set(nextLines.map(dedupeKeyForLine));

    if (typeof preserveAfterFrameId === 'number') {
      for (const record of getLiveEventAuditSnapshot()) {
        const event = record.event;
        if (event.frameId <= preserveAfterFrameId || event.topic !== 'tts.logs') continue;
        const tts = event as TtsLogLiveEvent;
        const key = dedupeKey(tts);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        nextLines.push({
          frameId: event.frameId,
          line: tts.payload.line,
          jobId: event.jobId,
          sequence: tts.payload.sequence,
          timestamp: event.receivedAt,
          pluginShortName: tts.payload.pluginShortName,
        });
        recordLiveEventSubscriberObservation(event.frameId, 'tts-diagnostics', 'handled');
      }
    }

    seenKeysRef.current = seenKeys;
    setTrackedLiveLines(nextLines);
  };

  return { liveLines, markRefreshStart, resetCursor };
};
